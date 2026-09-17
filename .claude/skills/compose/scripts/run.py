import argparse
import asyncio
import io
import json
import mimetypes
import os
import pathlib
import re
import shutil
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import time
import typing
import uuid

import yaml
from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import WebSocketException

COMPOSE_FILE = "model-compose.yml"
LAUNCHER_COMMAND = ("model-compose", "-f", COMPOSE_FILE, "up")
SERVER_LOG_FILE = "server.log"
OUTPUT_FILE = "output.json"
OUTPUT_STEM = "output"
RUNS_DIRECTORY = pathlib.Path(tempfile.gettempdir()) / "compose-runs"
HOST = "127.0.0.1"
DEFAULT_PORT = 8080
DEFAULT_WEBSOCKET_PATH = "/ws"
DEFAULT_TIMEOUT_SECONDS = 1800
POLL_SECONDS = 1
STATE_CHECK_SECONDS = 15
STOP_WAIT_SECONDS = 30
LOG_TAIL_LINES = 40
UPLOAD_CHUNK_BYTES = 1024 * 1024
OCTET_STREAM_CONTENT_TYPE = "application/octet-stream"
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
FALLBACK_EXTENSIONS = {"bytes": ".bin", "text": ".txt", "object": ".jsonl"}
VARIABLE_KEY = "__variable__"
STREAM_TYPE = "stream"
BYTES_KIND = "bytes"
TEXT_KIND = "text"
STREAMING_STATUS = "streaming"
COMPLETED_STATUS = "completed"
FAILED_STATUSES = ("failed", "cancelled", "interrupted")
WINDOWS_CREATE_NEW_PROCESS_GROUP = 0x00000200
ENVIRONMENT_VARIABLE_PATTERN = re.compile(
    r"^\$\{\s*env\.([^\s|}]+)\s*(?:\|\s*([^}]*?)\s*)?\}$"
)
STREAM_ID_LENGTH = struct.Struct(">H")
STREAM_SEQUENCE = struct.Struct(">I")
EXIT_SUCCESS = 0
EXIT_BUSY = 1
EXIT_USAGE = 2
EXIT_WORKFLOW_FAILED = 3
EXIT_STREAM_ABORTED = 4
EXIT_TIMEOUT = 5
EXIT_EXITED_EARLY = 6


class RunError(Exception):
    def __init__(self, message: str, exit_code: int):
        super().__init__(message)
        self.exit_code = exit_code


class Download(typing.NamedTuple):
    path: pathlib.Path
    handle: typing.BinaryIO
    kind: str


class WorkflowSession:
    def __init__(self, connection: ClientConnection, output_directory: pathlib.Path):
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
            content_type = (
                mimetypes.guess_type(path.name)[0] or OCTET_STREAM_CONTENT_TYPE
            )
            self.uploads[stream_id] = (path.open("rb"), 0)
            payload_input[field] = {
                VARIABLE_KEY: {
                    "type": STREAM_TYPE,
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
        checker = asyncio.create_task(self.check_state_periodically())

        try:
            async for frame in self.connection:
                if isinstance(frame, bytes):
                    await self.receive_chunk(frame)
                else:
                    await self.receive_message(json.loads(frame))

                if self.completed and not self.downloads:
                    return self.output
        except WebSocketException as error:
            raise RunError(f"connection lost: {error}", EXIT_WORKFLOW_FAILED) from error
        finally:
            checker.cancel()
            self.close_files()

        raise RunError(
            "connection closed before the workflow finished", EXIT_WORKFLOW_FAILED
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
            raise RunError(
                f"server error {data.get('code')}: {detail}{hint}",
                EXIT_WORKFLOW_FAILED,
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
            raise RunError(
                f"stream {data.get('id')} aborted: {data.get('reason')}",
                EXIT_STREAM_ABORTED,
            )

    async def receive_task_state(self, data: dict[str, typing.Any]) -> None:
        status = data.get("status")

        if status in FAILED_STATUSES:
            raise RunError(
                f"workflow {status}: {data.get('error')}", EXIT_WORKFLOW_FAILED
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
            f"saved {download.path} ({download.path.stat().st_size} bytes)", flush=True
        )

    def close_files(self) -> None:
        for handle, _ in self.uploads.values():
            handle.close()

        for download in self.downloads.values():
            download.handle.close()


def parse_arguments(arguments: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog=pathlib.Path(sys.argv[0]).name)
    parser.add_argument("release_directory", type=pathlib.Path)
    parser.add_argument("workflow_id")
    parser.add_argument("input_json")
    parser.add_argument("--output-directory", type=pathlib.Path)
    parser.add_argument("--file", action="append", default=[], metavar="FIELD=PATH")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS)

    return parser.parse_args(arguments)


def resolve_value(value: typing.Any) -> typing.Any:
    if not isinstance(value, str):
        return value

    match = ENVIRONMENT_VARIABLE_PATTERN.match(value.strip())

    if match is None:
        return value

    name, default = match.groups()

    return os.environ.get(name, default)


def read_endpoint(release_directory: pathlib.Path) -> tuple[int, str]:
    path = release_directory / COMPOSE_FILE

    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, yaml.YAMLError) as error:
        raise RunError(f"cannot read {path}: {error}", EXIT_USAGE) from error

    controller = document.get("controller") if isinstance(document, dict) else None
    adapter = controller.get("adapter") if isinstance(controller, dict) else None

    if not isinstance(adapter, dict):
        raise RunError(f"{path} has no controller.adapter", EXIT_USAGE)

    websocket = resolve_value(adapter.get("websocket", True))

    if websocket is False:
        raise RunError(f"{path} disables controller.adapter.websocket", EXIT_USAGE)

    try:
        port = int(resolve_value(adapter.get("port", DEFAULT_PORT)))
    except (TypeError, ValueError) as error:
        raise RunError(
            f"{path} has no numeric controller.adapter.port", EXIT_USAGE
        ) from error

    base_path = (resolve_value(adapter.get("base_path")) or "").rstrip("/")
    websocket_path = (
        resolve_value(websocket.get("path", DEFAULT_WEBSOCKET_PATH))
        if isinstance(websocket, dict)
        else DEFAULT_WEBSOCKET_PATH
    )

    return port, f"ws://{HOST}:{port}{base_path}{websocket_path}"


def parse_input(input_json: str) -> dict[str, typing.Any]:
    try:
        workflow_input = json.loads(input_json)
    except json.JSONDecodeError as error:
        raise RunError(f"input is not valid JSON: {error}", EXIT_USAGE) from error

    if not isinstance(workflow_input, dict):
        raise RunError("input must be a JSON object", EXIT_USAGE)

    return workflow_input


def parse_files(pairs: list[str]) -> dict[str, pathlib.Path]:
    files: dict[str, pathlib.Path] = {}

    for pair in pairs:
        field, separator, path_text = pair.partition("=")
        path = pathlib.Path(path_text)

        if not separator or not field:
            raise RunError(f"--file expects FIELD=PATH, got {pair!r}", EXIT_USAGE)

        if not path.is_file():
            raise RunError(f"--file {field}: {path} does not exist", EXIT_USAGE)

        files[field] = path.resolve()

    return files


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(POLL_SECONDS)

        return probe.connect_ex((HOST, port)) == 0


def launch(
    release_directory: pathlib.Path, log_path: pathlib.Path
) -> subprocess.Popen[bytes]:
    executable = shutil.which(LAUNCHER_COMMAND[0])

    if executable is None:
        raise RunError(f"{LAUNCHER_COMMAND[0]} is not on PATH", EXIT_USAGE)

    environment = {**os.environ, "PYTHONUTF8": "1"}
    detach: dict[str, typing.Any] = (
        {"creationflags": WINDOWS_CREATE_NEW_PROCESS_GROUP}
        if sys.platform == "win32"
        else {"start_new_session": True}
    )

    try:
        with log_path.open("wb") as log:
            return subprocess.Popen(
                [executable, *LAUNCHER_COMMAND[1:]],
                cwd=release_directory,
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                **detach,
            )
    except OSError as error:
        raise RunError(
            f"cannot launch {LAUNCHER_COMMAND[0]}: {error}", EXIT_USAGE
        ) from error


def process_group_alive(group_id: int) -> bool:
    try:
        os.killpg(group_id, 0)
    except ProcessLookupError:
        return False

    return True


def stop(process: subprocess.Popen[bytes]) -> None:
    if sys.platform == "win32":
        if process.poll() is None:
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            process.wait()

        return

    if not process_group_alive(process.pid):
        return

    os.killpg(process.pid, signal.SIGINT)
    deadline = time.monotonic() + STOP_WAIT_SECONDS

    while process_group_alive(process.pid) and time.monotonic() < deadline:
        process.poll()
        time.sleep(POLL_SECONDS)

    if process_group_alive(process.pid):
        os.killpg(process.pid, signal.SIGKILL)

    process.wait()


def log_tail(log_path: pathlib.Path) -> str:
    try:
        text = log_path.read_bytes().decode("utf-8", "replace")
    except OSError:
        return f"({log_path} is missing)"

    lines = text.replace("\r\n", "\n").replace("\r", "\n").rstrip("\n").split("\n")

    return "\n".join(lines[-LOG_TAIL_LINES:])


async def wait_until_ready(
    url: str,
    process: subprocess.Popen[bytes],
    log_path: pathlib.Path,
    timeout: int,
) -> ClientConnection:
    deadline = time.monotonic() + timeout

    while True:
        try:
            return await connect(url, max_size=None)
        except (OSError, WebSocketException):
            pass

        if process.poll() is not None:
            raise RunError(
                f"{LAUNCHER_COMMAND[0]} exited with code {process.returncode} before"
                f" accepting connections; last {LOG_TAIL_LINES} lines of {log_path}:\n"
                f"{log_tail(log_path)}",
                EXIT_EXITED_EARLY,
            )

        if time.monotonic() >= deadline:
            raise RunError(
                f"{url} not reachable after {timeout} seconds;"
                f" last {LOG_TAIL_LINES} lines of {log_path}:\n{log_tail(log_path)}",
                EXIT_TIMEOUT,
            )

        await asyncio.sleep(POLL_SECONDS)


def encode_frame(stream_id: str, sequence: int, chunk: bytes) -> bytes:
    encoded_stream_id = stream_id.encode("utf-8")

    return b"".join(
        [
            STREAM_ID_LENGTH.pack(len(encoded_stream_id)),
            encoded_stream_id,
            STREAM_SEQUENCE.pack(sequence),
            chunk,
        ]
    )


def decode_frame(frame: bytes) -> tuple[str, bytes]:
    stream_id_length = STREAM_ID_LENGTH.unpack_from(frame, 0)[0]
    stream_id_end = STREAM_ID_LENGTH.size + stream_id_length
    stream_id = frame[STREAM_ID_LENGTH.size : stream_id_end].decode("utf-8")

    return stream_id, frame[stream_id_end + STREAM_SEQUENCE.size :]


def extension_for(content_type: str | None, kind: str) -> str:
    media_type = (content_type or "").split(";")[0].strip().lower()

    return (
        EXTENSIONS.get(media_type)
        or mimetypes.guess_extension(media_type)
        or FALLBACK_EXTENSIONS.get(kind, FALLBACK_EXTENSIONS[BYTES_KIND])
    )


def stream_marker(value: typing.Any) -> dict[str, typing.Any] | None:
    if not isinstance(value, dict) or set(value) != {VARIABLE_KEY}:
        return None

    variable = value[VARIABLE_KEY]

    if isinstance(variable, dict) and variable.get("type") == STREAM_TYPE:
        return variable

    return None


async def run_workflow(
    options: argparse.Namespace,
    url: str,
    process: subprocess.Popen[bytes],
    log_path: pathlib.Path,
    workflow_input: dict[str, typing.Any],
    files: dict[str, pathlib.Path],
    output_directory: pathlib.Path,
) -> typing.Any:
    connection = await wait_until_ready(url, process, log_path, options.timeout)
    print(f"connected {url}", flush=True)

    async with connection:
        session = WorkflowSession(connection, output_directory)
        await session.start(options.workflow_id, workflow_input, files)

        return await session.run()


def run(options: argparse.Namespace) -> int:
    release_directory = options.release_directory.resolve()
    output_directory = (
        options.output_directory or RUNS_DIRECTORY / release_directory.name
    ).resolve()
    port, url = read_endpoint(release_directory)
    workflow_input = parse_input(options.input_json)
    files = parse_files(options.file)

    if port_in_use(port):
        raise RunError(f"port {port} is already in use", EXIT_BUSY)

    output_directory.mkdir(parents=True, exist_ok=True)
    log_path = output_directory / SERVER_LOG_FILE
    process = launch(release_directory, log_path)
    print(
        f"launched {' '.join(LAUNCHER_COMMAND)} (pid {process.pid}), log: {log_path}",
        flush=True,
    )

    try:
        output = asyncio.run(
            run_workflow(
                options, url, process, log_path, workflow_input, files, output_directory
            )
        )
    finally:
        stop(process)

    output_path = output_directory / OUTPUT_FILE
    output_text = json.dumps(output, ensure_ascii=False, indent=2)
    output_path.write_text(output_text + "\n", encoding="utf-8")
    print(f"saved {output_path}")
    print(output_text)

    return EXIT_SUCCESS


def main() -> int:
    for output_stream in (sys.stdout, sys.stderr):
        if isinstance(output_stream, io.TextIOWrapper):
            output_stream.reconfigure(encoding="utf-8")

    program_name = pathlib.Path(sys.argv[0]).name
    options = parse_arguments(sys.argv[1:])

    try:
        return run(options)
    except RunError as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)
        return error.exit_code


if __name__ == "__main__":
    sys.exit(main())
