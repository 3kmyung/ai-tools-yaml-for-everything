import argparse
import contextlib
import io
import json
import mimetypes
import pathlib
import struct
import sys
import time
import typing

from websockets.exceptions import ConnectionClosed, WebSocketException
from websockets.sync.client import ClientConnection, connect

WEBSOCKET_PATH = "/ws"
RUN_MESSAGE_ID = "capture"
VARIABLE_MARKER = "__variable__"
MEDIA_MARKER = "__media__"
STREAM_VARIABLE_TYPE = "stream"
BYTES_KIND = "bytes"
UPLOAD_KIND = BYTES_KIND
DEFAULT_CONTENT_TYPE = "application/octet-stream"
DEFAULT_MEDIA_SUFFIX = ".bin"
UPLOAD_CHUNK_BYTES = 256 * 1024
STREAM_ID_LENGTH_FORMAT = struct.Struct(">H")
SEQUENCE_FORMAT = struct.Struct(">I")
FAILED_STATUSES = ("failed", "cancelled", "interrupted")
IDLE_TIMEOUT_SECONDS = 600
READY_TIMEOUT_SECONDS = 300
READY_RETRY_SECONDS = 2
EXIT_SUCCESS = 0
EXIT_USAGE = 2
EXIT_RUN_FAILED = 3
EXIT_STREAM_OUTPUT = 4
EXIT_IDLE_TIMEOUT = 5
EXIT_SERVER_UNREACHABLE = 6


class RunFailedError(Exception):
    pass


class ServerUnreachableError(Exception):
    pass


def encode_chunk_frame(stream_id: str, sequence: int, chunk: bytes) -> bytes:
    identifier = stream_id.encode("utf-8")

    return (
        STREAM_ID_LENGTH_FORMAT.pack(len(identifier))
        + identifier
        + SEQUENCE_FORMAT.pack(sequence)
        + chunk
    )


def decode_chunk_frame(frame: bytes) -> tuple[str, bytes]:
    identifier_length = STREAM_ID_LENGTH_FORMAT.unpack_from(frame, 0)[0]
    identifier_end = STREAM_ID_LENGTH_FORMAT.size + identifier_length
    payload_start = identifier_end + SEQUENCE_FORMAT.size
    identifier = frame[STREAM_ID_LENGTH_FORMAT.size : identifier_end]

    return identifier.decode("utf-8"), frame[payload_start:]


class Upload:
    def __init__(self, stream_id: str, path: pathlib.Path) -> None:
        self.stream_id = stream_id
        self.path = path
        self.file = path.open("rb")
        self.sequence = 0

    def variable(self) -> dict[str, typing.Any]:
        content_type, _ = mimetypes.guess_type(self.path.name)

        return {
            VARIABLE_MARKER: {
                "type": STREAM_VARIABLE_TYPE,
                "id": self.stream_id,
                "kind": UPLOAD_KIND,
                "content_type": content_type or DEFAULT_CONTENT_TYPE,
                "filename": self.path.name,
                "size": self.path.stat().st_size,
            }
        }

    def send_next_chunk(self, websocket: ClientConnection) -> None:
        chunk = self.file.read(UPLOAD_CHUNK_BYTES)

        if not chunk:
            websocket.send(
                json.dumps(
                    {"type": "stream_end", "data": {"id": self.stream_id}}
                )
            )
            return

        websocket.send(
            encode_chunk_frame(self.stream_id, self.sequence, chunk)
        )
        self.sequence += 1


class Download:
    def __init__(self, descriptor: dict[str, typing.Any]) -> None:
        self.descriptor = descriptor
        self.stream_id = descriptor["id"]
        self.chunks: list[bytes] = []
        self.is_complete = False

    def bytes(self) -> bytes:
        return b"".join(self.chunks)

    def suffix(self) -> str:
        content_type = (
            self.descriptor.get("content_type") or DEFAULT_CONTENT_TYPE
        )
        guessed = mimetypes.guess_extension(content_type)

        if guessed:
            return guessed

        subtype = content_type.partition("/")[2]

        return f".{subtype}" if subtype.isalnum() else DEFAULT_MEDIA_SUFFIX

    def media(self, file_name: str) -> dict[str, typing.Any]:
        payload: dict[str, typing.Any] = {
            "file": file_name,
            "content_type": (
                self.descriptor.get("content_type") or DEFAULT_CONTENT_TYPE
            ),
        }

        if self.descriptor.get("filename"):
            payload["filename"] = self.descriptor["filename"]

        payload["size"] = len(self.bytes())
        payload["attrs"] = dict(self.descriptor.get("attrs") or {})

        return {MEDIA_MARKER: payload}


class StreamOutputError(Exception):
    pass


class IdleTimeoutError(Exception):
    pass


def websocket_url(api_url: str) -> str:
    return api_url.rstrip("/").replace("http", "ws", 1) + WEBSOCKET_PATH


def is_stream_variable(value: dict[str, typing.Any]) -> bool:
    variable = value.get(VARIABLE_MARKER)

    return (
        isinstance(variable, dict)
        and variable.get("type") == STREAM_VARIABLE_TYPE
    )


def stream_descriptors(
    value: typing.Any,
) -> typing.Iterator[dict[str, typing.Any]]:
    if isinstance(value, dict):
        if is_stream_variable(value):
            yield value[VARIABLE_MARKER]
            return

        for item in value.values():
            yield from stream_descriptors(item)

    if isinstance(value, list):
        for item in value:
            yield from stream_descriptors(item)


def record_job_event(
    outputs: dict[str, typing.Any],
    downloads: dict[str, Download],
    data: dict[str, typing.Any],
) -> list[Download]:
    if data.get("event") == "failed":
        raise RunFailedError(
            f"job '{data.get('job_id')}' failed: {data.get('error')}"
        )

    if data.get("event") != "completed":
        return []

    output = data.get("output")
    outputs[data["job_id"]] = output
    started: list[Download] = []

    for descriptor in stream_descriptors(output):
        if descriptor.get("kind") != BYTES_KIND:
            raise StreamOutputError(
                f"job '{data.get('job_id')}' produced a"
                f" {descriptor.get('kind')} stream,"
                " which the shell draws as a live stream"
                " rather than a saved value"
            )

        if descriptor["id"] in downloads:
            continue

        download = Download(descriptor)
        downloads[download.stream_id] = download
        started.append(download)

    return started


def replace_streams(
    value: typing.Any, downloads: dict[str, Download], names: dict[str, str]
) -> typing.Any:
    if isinstance(value, dict):
        if is_stream_variable(value):
            download = downloads[value[VARIABLE_MARKER]["id"]]

            return download.media(names[download.stream_id])

        return {
            key: replace_streams(item, downloads, names)
            for key, item in value.items()
        }

    if isinstance(value, list):
        return [replace_streams(item, downloads, names) for item in value]

    return value


def media_file_names(
    outputs: dict[str, typing.Any], downloads: dict[str, Download], stem: str
) -> dict[str, str]:
    names: dict[str, str] = {}

    def walk(value: typing.Any, path: list[str]) -> None:
        if isinstance(value, dict):
            if is_stream_variable(value):
                download = downloads[value[VARIABLE_MARKER]["id"]]
                names[download.stream_id] = (
                    ".".join([stem, *path]) + download.suffix()
                )
                return

            for key, item in value.items():
                walk(item, [*path, str(key)])

        if isinstance(value, list):
            for index, item in enumerate(value):
                walk(item, [*path, str(index)])

    walk(outputs, [])

    return names


def connect_when_ready(api_url: str) -> ClientConnection:
    deadline = time.monotonic() + READY_TIMEOUT_SECONDS

    while True:
        try:
            return connect(websocket_url(api_url), max_size=None)
        except OSError as error:
            if time.monotonic() >= deadline:
                raise ServerUnreachableError(
                    f"{api_url} did not accept a connection for"
                    f" {READY_TIMEOUT_SECONDS} seconds: {error}"
                ) from error

            time.sleep(READY_RETRY_SECONDS)


def capture(
    api_url: str,
    workflow_id: str,
    workflow_input: dict[str, typing.Any],
    files: dict[str, pathlib.Path],
) -> tuple[dict[str, typing.Any], dict[str, Download]]:
    outputs: dict[str, typing.Any] = {}
    downloads: dict[str, Download] = {}

    with contextlib.ExitStack() as stack:
        uploads: dict[str, Upload] = {}

        for index, (field, path) in enumerate(files.items()):
            upload = Upload(f"upload-{index}", path)
            stack.callback(upload.file.close)
            uploads[upload.stream_id] = upload
            workflow_input[field] = upload.variable()

        run_message = {
            "type": "run_workflow",
            "id": RUN_MESSAGE_ID,
            "data": {
                "workflow_id": workflow_id,
                "input": workflow_input,
                "subscribe_task": True,
            },
        }

        websocket = stack.enter_context(connect_when_ready(api_url))
        websocket.send(json.dumps(run_message))
        is_task_complete = False

        def pull(stream_id: str) -> None:
            request = {"type": "stream_pull", "data": {"id": stream_id}}
            websocket.send(json.dumps(request))

        def is_finished() -> bool:
            return is_task_complete and all(
                download.is_complete for download in downloads.values()
            )

        while True:
            try:
                frame = websocket.recv(timeout=IDLE_TIMEOUT_SECONDS)
            except TimeoutError as error:
                raise IdleTimeoutError(
                    f"no message for {IDLE_TIMEOUT_SECONDS} seconds;"
                    " a stream output never completes until read,"
                    " or the run is stuck"
                ) from error
            except ConnectionClosed as error:
                raise RunFailedError(
                    "the WebSocket closed before the task finished"
                ) from error

            if isinstance(frame, bytes):
                stream_id, chunk = decode_chunk_frame(frame)
                download = downloads.get(stream_id)

                if download is None:
                    continue

                download.chunks.append(chunk)
                pull(stream_id)

                continue

            message = json.loads(frame)
            data = message.get("data", {})

            if message.get("type") == "error":
                raise RunFailedError(f"server error: {data.get('message')}")

            if (
                message.get("type") == "stream_pull"
                and data.get("id") in uploads
            ):
                uploads[data["id"]].send_next_chunk(websocket)

            if (
                message.get("type") == "stream_abort"
                and data.get("id") in downloads
            ):
                raise RunFailedError(
                    "the server aborted the output stream:"
                    f" {data.get('reason')}"
                )

            if (
                message.get("type") == "stream_end"
                and data.get("id") in downloads
            ):
                downloads[data["id"]].is_complete = True

            if message.get("type") == "job_event":
                for download in record_job_event(outputs, downloads, data):
                    pull(download.stream_id)

            if message.get("type") == "task_state":
                if data.get("status") in FAILED_STATUSES:
                    raise RunFailedError(
                        f"task {data.get('status')}: {data.get('error')}"
                    )

                if data.get("status") == "streaming":
                    raise StreamOutputError("the workflow output is a stream")

                if data.get("status") == "completed":
                    is_task_complete = True

            if is_finished():
                return outputs, downloads


def parse_file_option(value: str) -> tuple[str, pathlib.Path]:
    field, separator, path_text = value.partition("=")
    path = pathlib.Path(path_text)

    if not separator or not field:
        raise argparse.ArgumentTypeError(f"expected FIELD=PATH, got '{value}'")

    if not path.is_file():
        raise argparse.ArgumentTypeError(f"not a file: {path_text}")

    return field, path


def parse_arguments(arguments: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog=pathlib.Path(__file__).name)
    parser.add_argument("api_url")
    parser.add_argument("workflow_id")
    parser.add_argument("input_json")
    parser.add_argument("output_path", type=pathlib.Path)
    parser.add_argument(
        "--file",
        dest="files",
        action="append",
        type=parse_file_option,
        default=[],
        metavar="FIELD=PATH",
    )

    return parser.parse_args(arguments)


def main() -> int:
    for output_file in (sys.stdout, sys.stderr):
        if isinstance(output_file, io.TextIOWrapper):
            output_file.reconfigure(encoding="utf-8")

    program_name = pathlib.Path(__file__).name
    options = parse_arguments(sys.argv[1:])

    try:
        workflow_input = json.loads(options.input_json)
    except json.JSONDecodeError as error:
        print(
            f"{program_name}: error: input is not JSON: {error}",
            file=sys.stderr,
        )
        return EXIT_USAGE

    if not isinstance(workflow_input, dict):
        print(
            f"{program_name}: error: input must be a JSON object",
            file=sys.stderr,
        )
        return EXIT_USAGE

    try:
        outputs, downloads = capture(
            options.api_url,
            options.workflow_id,
            workflow_input,
            dict(options.files),
        )
    except ServerUnreachableError as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)
        return EXIT_SERVER_UNREACHABLE
    except (RunFailedError, OSError, WebSocketException) as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)
        return EXIT_RUN_FAILED
    except StreamOutputError as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)
        return EXIT_STREAM_OUTPUT
    except IdleTimeoutError as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)
        return EXIT_IDLE_TIMEOUT

    if not outputs:
        print(
            f"{program_name}: error: no job reported a completed output",
            file=sys.stderr,
        )
        return EXIT_RUN_FAILED

    names = media_file_names(outputs, downloads, options.output_path.stem)
    saved = replace_streams(outputs, downloads, names)
    options.output_path.parent.mkdir(parents=True, exist_ok=True)

    for stream_id, file_name in names.items():
        media_path = options.output_path.with_name(file_name)
        media_path.write_bytes(downloads[stream_id].bytes())
        print(
            f"saved {len(downloads[stream_id].bytes())} bytes to {media_path}"
        )

    options.output_path.write_text(
        json.dumps(saved, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"saved {', '.join(saved)} to {options.output_path}")
    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.exit(main())
