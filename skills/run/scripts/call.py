from __future__ import annotations

import asyncio
import json
import mimetypes
import pathlib
import struct
import sys
import tempfile
import typing
import uuid

import diagnose
import locate

INPUTS_PREFIX = ".inputs-"
OUTPUT_FILE = "output.json"
OUTPUT_STEM = "output"
STATE_CHECK_SECONDS = 15
IDLE_TIMEOUT_SECONDS = 600
UPLOAD_CHUNK_BYTES = 256 * 1024
DEFAULT_CONTENT_TYPE = "application/octet-stream"
EXTENSIONS = {
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/pcm": ".pcm",
    "audio/l16": ".pcm",
    "audio/mpeg": ".mp3",
    "video/mp4": ".mp4",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "text/plain": ".txt",
    "application/json": ".json",
}
BYTES_KIND = "bytes"
TEXT_KIND = "text"
OBJECT_KIND = "object"
FALLBACK_EXTENSIONS = {
    BYTES_KIND: ".bin",
    TEXT_KIND: ".txt",
    OBJECT_KIND: ".jsonl",
}
VARIABLE_MARKER = "__variable__"
STREAM_VARIABLE_TYPE = "stream"
STREAMING_STATUS = "streaming"
COMPLETED_STATUS = "completed"
FAILED_STATUSES = ("failed", "cancelled", "interrupted")
STREAM_ID_LENGTH_FORMAT = struct.Struct(">H")
SEQUENCE_FORMAT = struct.Struct(">I")


class Download(typing.NamedTuple):
    path: pathlib.Path
    handle: typing.BinaryIO
    kind: str


class WorkflowRun:
    def __init__(self, connection: typing.Any, output_directory: pathlib.Path):
        self.connection = connection
        self.output_directory = output_directory
        self.uploads: dict[str, tuple[typing.BinaryIO, int]] = {}
        self.downloads: dict[str, Download] = {}
        self.task_id: str | None = None
        self.output: typing.Any = None
        self.completed = False

    async def start(
        self,
        workflow_id: str,
        workflow_input: dict[str, typing.Any],
        files: dict[str, pathlib.Path],
    ) -> None:
        payload_input = dict(workflow_input)

        for field, path in files.items():
            stream_id = uuid.uuid4().hex
            content_type = mimetypes.guess_type(path.name)[0] or DEFAULT_CONTENT_TYPE
            self.uploads[stream_id] = (path.open("rb"), 0)
            payload_input[field] = {
                VARIABLE_MARKER: {
                    "type": STREAM_VARIABLE_TYPE,
                    "id": stream_id,
                    "kind": BYTES_KIND,
                    "content_type": content_type,
                    "filename": path.name,
                    "size": path.stat().st_size,
                    "attrs": {},
                }
            }

        await self.send(
            "run_workflow",
            {
                "workflow_id": workflow_id,
                "input": payload_input,
                "subscribe_task": True,
            },
        )

    async def send(self, message_type: str, data: dict[str, typing.Any]) -> None:
        await self.connection.send(json.dumps({"type": message_type, "data": data}))

    async def run(self) -> typing.Any:
        import websockets.exceptions

        checker = asyncio.create_task(self.check_state_periodically())

        try:
            while True:
                frame = await asyncio.wait_for(
                    self.connection.recv(), IDLE_TIMEOUT_SECONDS
                )

                if isinstance(frame, bytes):
                    await self.receive_chunk(frame)
                else:
                    await self.receive_message(json.loads(frame))

                if self.completed and not self.downloads:
                    return self.output
        except websockets.exceptions.ConnectionClosedOK:
            pass
        except asyncio.TimeoutError as error:
            raise locate.RunError(
                f"no message for {IDLE_TIMEOUT_SECONDS} seconds", locate.EXIT_TIMEOUT
            ) from error
        except websockets.exceptions.WebSocketException as error:
            raise locate.RunError(
                f"connection lost: {error}", locate.EXIT_RUN_FAILED
            ) from error
        finally:
            checker.cancel()
            self.close_files()

        raise locate.RunError(
            "connection closed before the workflow finished", locate.EXIT_RUN_FAILED
        )

    async def check_state_periodically(self) -> None:
        while True:
            await asyncio.sleep(STATE_CHECK_SECONDS)

            if self.task_id is not None and not self.completed:
                await self.send("get_task", {"task_id": self.task_id})

    async def receive_message(self, message: dict[str, typing.Any]) -> None:
        message_type = message.get("type")
        data = message.get("data") or {}

        if message_type == "error":
            detail = str(data.get("message"))
            hint = (
                "; wrap the bare stream output in a named mapping"
                if STREAMING_STATUS in detail
                else ""
            )
            raise locate.RunError(
                f"server error {data.get('code')}: {detail}{hint}",
                locate.EXIT_RUN_FAILED,
            )

        if message_type == "workflow_started":
            self.task_id = data.get("task_id")
        elif message_type == "task_state":
            await self.receive_task_state(data)
        elif message_type == "stream_pull":
            await self.upload_chunk(data["id"])
        elif message_type == "stream_chunk":
            await self.receive_value_chunk(data["id"], data.get("value"))
        elif message_type == "stream_end":
            self.finish_download(data["id"])
        elif message_type == "stream_abort":
            raise locate.RunError(
                f"stream {data.get('id')} aborted: {data.get('reason')}",
                locate.EXIT_STREAM_ABORTED,
            )

    async def receive_task_state(self, data: dict[str, typing.Any]) -> None:
        status = data.get("status")

        if status in FAILED_STATUSES:
            raise locate.RunError(
                f"workflow {status}: {diagnose.annotated(str(data.get('error')))}",
                locate.EXIT_RUN_FAILED,
            )

        if status != COMPLETED_STATUS or self.completed:
            return

        self.completed = True
        self.output = self.register_downloads(data.get("output"), [OUTPUT_STEM])

        for stream_id in list(self.downloads):
            await self.send("stream_pull", {"id": stream_id})

    def register_downloads(
        self, value: typing.Any, path_parts: list[str]
    ) -> typing.Any:
        marker = stream_marker(value)

        if marker is not None:
            kind = marker.get("kind", BYTES_KIND)
            extension = extension_for(marker.get("content_type"), kind)
            path = self.output_directory / (".".join(path_parts) + extension)
            self.downloads[marker["id"]] = Download(path, path.open("wb"), kind)

            return path.name

        if isinstance(value, dict):
            return {
                key: self.register_downloads(item, [*path_parts, str(key)])
                for key, item in value.items()
            }

        if isinstance(value, list):
            return [
                self.register_downloads(item, [*path_parts, str(index)])
                for index, item in enumerate(value)
            ]

        return value

    async def receive_chunk(self, frame: bytes) -> None:
        stream_id, chunk = decode_frame(frame)
        download = self.downloads.get(stream_id)

        if download is None:
            return

        download.handle.write(chunk)
        await self.send("stream_pull", {"id": stream_id})

    async def receive_value_chunk(self, stream_id: str, value: typing.Any) -> None:
        download = self.downloads.get(stream_id)

        if download is None:
            return

        text = (
            value
            if download.kind == TEXT_KIND
            else json.dumps(value, ensure_ascii=False) + "\n"
        )
        download.handle.write(text.encode("utf-8"))
        await self.send("stream_pull", {"id": stream_id})

    async def upload_chunk(self, stream_id: str) -> None:
        if stream_id not in self.uploads:
            return

        handle, sequence = self.uploads[stream_id]
        chunk = handle.read(UPLOAD_CHUNK_BYTES)

        if not chunk:
            handle.close()
            del self.uploads[stream_id]
            await self.send("stream_end", {"id": stream_id})

            return

        self.uploads[stream_id] = (handle, sequence + 1)
        await self.connection.send(encode_frame(stream_id, sequence, chunk))

    def finish_download(self, stream_id: str) -> None:
        download = self.downloads.pop(stream_id, None)

        if download is None:
            return

        download.handle.close()
        print(
            f"saved {download.path.name} ({download.path.stat().st_size} bytes)",
            flush=True,
        )

    def close_files(self) -> None:
        for handle, _ in self.uploads.values():
            handle.close()

        for download in self.downloads.values():
            download.handle.close()


def encode_frame(stream_id: str, sequence: int, chunk: bytes) -> bytes:
    encoded_stream_id = stream_id.encode("utf-8")

    return b"".join(
        [
            STREAM_ID_LENGTH_FORMAT.pack(len(encoded_stream_id)),
            encoded_stream_id,
            SEQUENCE_FORMAT.pack(sequence),
            chunk,
        ]
    )


def decode_frame(frame: bytes) -> tuple[str, bytes]:
    stream_id_length = STREAM_ID_LENGTH_FORMAT.unpack_from(frame, 0)[0]
    stream_id_end = STREAM_ID_LENGTH_FORMAT.size + stream_id_length
    stream_id = frame[STREAM_ID_LENGTH_FORMAT.size : stream_id_end].decode("utf-8")

    return stream_id, frame[stream_id_end + SEQUENCE_FORMAT.size :]


def extension_for(content_type: str | None, kind: str) -> str:
    media_type = (content_type or "").split(";")[0].strip().lower()

    return (
        EXTENSIONS.get(media_type)
        or mimetypes.guess_extension(media_type)
        or FALLBACK_EXTENSIONS.get(kind, FALLBACK_EXTENSIONS[BYTES_KIND])
    )


def stream_marker(value: typing.Any) -> dict[str, typing.Any] | None:
    if not isinstance(value, dict) or set(value) != {VARIABLE_MARKER}:
        return None

    variable = value[VARIABLE_MARKER]

    if isinstance(variable, dict) and variable.get("type") == STREAM_VARIABLE_TYPE:
        return variable

    return None


async def run_workflow(
    url: str,
    payload: dict[str, typing.Any],
    files: dict[str, pathlib.Path],
    output_directory: pathlib.Path,
) -> typing.Any:
    import websockets.asyncio.client
    import websockets.exceptions

    try:
        connection = await websockets.asyncio.client.connect(url, max_size=None)
    except (OSError, websockets.exceptions.WebSocketException) as error:
        raise locate.RunError(
            f"{url} is not accepting connections: {error}; run up first",
            locate.EXIT_UNREACHABLE,
        ) from error

    async with connection:
        workflow_run = WorkflowRun(connection, output_directory)
        await workflow_run.start(payload["workflow"], payload["input"], files)

        return await workflow_run.run()


def websocket_url(record: dict[str, typing.Any]) -> str:
    path = record.get("websocket_path")

    if path is None:
        raise locate.RunError(
            f"{locate.COMPOSE_FILE} disables controller.adapter.websocket"
        )

    return f"ws://{locate.HOST}:{record['ports']['adapter']}{record['base_path']}{path}"


def run_with_inputs(
    workspace: pathlib.Path,
    payload: dict[str, typing.Any],
    url: str,
    output_directory: pathlib.Path,
) -> typing.Any:
    with tempfile.TemporaryDirectory(
        prefix=INPUTS_PREFIX, dir=workspace
    ) as inputs_directory:
        if payload.get("files"):
            locate.extract(sys.stdin.buffer, pathlib.Path(inputs_directory))

        files = {
            field: pathlib.Path(inputs_directory) / relative
            for field, relative in payload.get("files", {}).items()
        }
        print(f"connecting {url}", flush=True)

        return asyncio.run(run_workflow(url, payload, files, output_directory))


def call(payload: dict[str, typing.Any]) -> int:
    workspace = locate.workspace_path(payload)

    try:
        record = json.loads(
            locate.server_record_path(workspace, payload).read_text(encoding="utf-8")
        )
    except (OSError, ValueError) as error:
        raise locate.RunError(
            "no server is running in this workspace; run up first",
            locate.EXIT_UNREACHABLE,
        ) from error

    output_directory = workspace / payload["output"]
    url = websocket_url(record)

    try:
        output_directory.mkdir(parents=True)
    except FileExistsError as error:
        raise locate.RunError(
            f"{output_directory} already exists; call again for a new output folder"
        ) from error

    try:
        output = run_with_inputs(workspace, payload, url, output_directory)
    except BaseException:
        if not any(output_directory.iterdir()):
            output_directory.rmdir()

        raise

    output_text = json.dumps(output, ensure_ascii=False, indent=2)
    (output_directory / OUTPUT_FILE).write_text(output_text + "\n", encoding="utf-8")
    print(output_text, flush=True)

    return locate.EXIT_SUCCESS
