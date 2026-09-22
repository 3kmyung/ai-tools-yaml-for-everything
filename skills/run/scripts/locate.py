from __future__ import annotations

import base64
import json
import os
import pathlib
import re
import socket
import subprocess
import sys
import tarfile
import typing

TIMESTAMP_FORMAT = "%Y%m%d-%H%M%S"
TIMESTAMP_PATTERN = re.compile(r"\d{8}-\d{6}")
SESSION_STATE_DIRECTORY = ".state"
SESSION_LOGS_DIRECTORY = ".logs"
SESSION_OUTPUTS_DIRECTORY = ".outputs"
SESSION_DIRECTORIES = (
    SESSION_STATE_DIRECTORY,
    SESSION_LOGS_DIRECTORY,
    SESSION_OUTPUTS_DIRECTORY,
)
VIRTUAL_ENVIRONMENT_DIRECTORY = ".venv"
COMPOSE_FILE = "model-compose.yml"
SERVER_RECORD_FILE = "server.json"
JOBS_DIRECTORY = "jobs"
HOST = "127.0.0.1"
SSH_BATCH_OPTIONS = ("-o", "BatchMode=yes")
WEBUI_NONE = "none"
WEBUI_GRADIO = "gradio"
WEBUI_COMPONENT = "component"
WEBUI_CHOICES = (WEBUI_NONE, WEBUI_GRADIO, WEBUI_COMPONENT)
POLL_SECONDS = 1
CONNECT_TIMEOUT_SECONDS = 1
UP_TIMEOUT_SECONDS = 1800
LOG_TAIL_LINES = 40
WINDOWS_DETACHED_FLAGS = 0x00000200 | 0x08000000
WINDOWS_BREAKAWAY_FROM_JOB_FLAG = 0x01000000
ENVIRONMENT_MINIMUM_PYTHON = (3, 10)
ENVIRONMENT_MINIMUM_PYTHON_TEXT = ".".join(
    map(str, ENVIRONMENT_MINIMUM_PYTHON)
)
SCRIPT_MINIMUM_PYTHON = (3, 8)
EXIT_SUCCESS = 0
EXIT_USAGE = 2
EXIT_RUN_FAILED = 3
EXIT_STREAM_ABORTED = 4
EXIT_TIMEOUT = 5
EXIT_UNREACHABLE = 6
EXIT_SET_UP_FAILED = 7
EXIT_BUSY = 8
EXIT_KILL_FAILED = 9


class RunError(Exception):
    def __init__(self, message: str, exit_code: int = EXIT_USAGE):
        super().__init__(message)
        self.exit_code = exit_code


def temporary_root(payload: dict[str, typing.Any]) -> pathlib.Path:
    return pathlib.Path(payload["temporary_root"]).resolve()


def workspace_path(payload: dict[str, typing.Any]) -> pathlib.Path:
    workspace = pathlib.Path(payload["workspace"]).resolve()
    temporary = temporary_root(payload)
    expected = (payload["project"], payload["service"])

    if (
        workspace.parent.parent.parent != temporary
        or (workspace.parent.parent.name, workspace.parent.name) != expected
        or not TIMESTAMP_PATTERN.fullmatch(workspace.name)
    ):
        raise RunError(
            f"{workspace} is not a run workspace"
            f" under {temporary / expected[0] / expected[1]}"
        )

    return workspace


def service_directory(
    workspace: pathlib.Path, payload: dict[str, typing.Any]
) -> pathlib.Path:
    return workspace / "releases" / payload["service"]


def machine_state_directory(
    workspace: pathlib.Path, payload: dict[str, typing.Any]
) -> pathlib.Path:
    return workspace / SESSION_STATE_DIRECTORY / payload["machine"]


def machine_logs_directory(
    workspace: pathlib.Path, payload: dict[str, typing.Any]
) -> pathlib.Path:
    return workspace / SESSION_LOGS_DIRECTORY / payload["machine"]


def server_record_path(
    workspace: pathlib.Path, payload: dict[str, typing.Any]
) -> pathlib.Path:
    return machine_state_directory(workspace, payload) / SERVER_RECORD_FILE


def original_compose_path(
    workspace: pathlib.Path, payload: dict[str, typing.Any]
) -> pathlib.Path:
    return machine_state_directory(workspace, payload) / COMPOSE_FILE


def job_directories(
    workspace: pathlib.Path, payload: dict[str, typing.Any]
) -> tuple[pathlib.Path, pathlib.Path]:
    return (
        machine_state_directory(workspace, payload) / JOBS_DIRECTORY,
        machine_logs_directory(workspace, payload) / JOBS_DIRECTORY,
    )


def virtual_environment_python(workspace: pathlib.Path) -> pathlib.Path:
    directory = workspace / VIRTUAL_ENVIRONMENT_DIRECTORY

    if sys.platform == "win32":
        return directory / "Scripts" / "python.exe"

    return directory / "bin" / "python"


def virtual_environment_bin(workspace: pathlib.Path) -> pathlib.Path:
    return virtual_environment_python(workspace).parent


def virtual_environment_variables(workspace: pathlib.Path) -> dict[str, str]:
    return {
        **os.environ,
        "PATH": str(virtual_environment_bin(workspace))
        + os.pathsep
        + os.environ.get("PATH", ""),
        "VIRTUAL_ENV": str(workspace / VIRTUAL_ENVIRONMENT_DIRECTORY),
        "PYTHONUTF8": "1",
    }


def popen_detached(
    arguments: list[str], **options: typing.Any
) -> subprocess.Popen:
    if sys.platform != "win32":
        return subprocess.Popen(arguments, start_new_session=True, **options)

    try:
        return subprocess.Popen(
            arguments,
            creationflags=(
                WINDOWS_DETACHED_FLAGS | WINDOWS_BREAKAWAY_FROM_JOB_FLAG
            ),
            **options,
        )
    except PermissionError:
        return subprocess.Popen(
            arguments, creationflags=WINDOWS_DETACHED_FLAGS, **options
        )


def log_tail(path: pathlib.Path, line_count: int = LOG_TAIL_LINES) -> str:
    try:
        text = path.read_bytes().decode("utf-8", "replace")
    except OSError:
        return f"({path} does not exist)"

    lines = (
        text.replace("\r\n", "\n").replace("\r", "\n").rstrip("\n").split("\n")
    )

    return "\n".join(lines[-line_count:])


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
        connection.settimeout(CONNECT_TIMEOUT_SECONDS)

        return connection.connect_ex((HOST, port)) == 0


def extract(
    archive_stream: typing.BinaryIO, destination: pathlib.Path
) -> None:
    destination.mkdir(parents=True, exist_ok=True)

    with tarfile.open(fileobj=archive_stream, mode="r|*") as archive:
        try:
            archive.extractall(destination, filter="data")
        except TypeError:
            archive.extractall(destination)


def remove_empty_directories(
    directory: pathlib.Path, stop: pathlib.Path
) -> None:
    children = list(directory.iterdir()) if directory.is_dir() else []

    for child in children:
        if child.is_dir() and not any(child.iterdir()):
            child.rmdir()

    while (
        directory != stop
        and directory.is_dir()
        and not any(directory.iterdir())
    ):
        directory.rmdir()
        directory = directory.parent


def encode_payload(payload: dict[str, typing.Any]) -> str:
    return base64.urlsafe_b64encode(
        json.dumps(payload).encode("utf-8")
    ).decode("ascii")


def decode_payload(text: str) -> dict[str, typing.Any]:
    return json.loads(
        base64.urlsafe_b64decode(text.encode("ascii")).decode("utf-8")
    )
