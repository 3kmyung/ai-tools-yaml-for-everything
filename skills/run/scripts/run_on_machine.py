from __future__ import annotations

import argparse
import inspect
import io
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tarfile
import typing

import call
import diagnose
import execute_in_environment
import locate
import serve
import set_up_environment

VIRTUAL_ENVIRONMENT_COMMANDS = ("up", "down", "kill", "call", "wrap")
MACHINE_FILES = tuple(
    pathlib.Path(inspect.getfile(module)).resolve()
    for module in (
        sys.modules[__name__],
        diagnose,
        locate,
        set_up_environment,
        serve,
        call,
        execute_in_environment,
    )
)


def contained_path(workspace: pathlib.Path, relative: str) -> pathlib.Path:
    path = (workspace / relative).resolve()

    if path != workspace and workspace not in path.parents:
        raise locate.RunError(f"{relative} points outside the workspace")

    return path


def unpack(payload: dict[str, typing.Any]) -> int:
    workspace = locate.workspace_path(payload)
    locate.extract(
        sys.stdin.buffer, contained_path(workspace, payload["destination"])
    )

    return locate.EXIT_SUCCESS


def pack(payload: dict[str, typing.Any]) -> int:
    workspace = locate.workspace_path(payload)
    path = contained_path(workspace, payload["source"])

    if not path.exists():
        raise locate.RunError(
            f"{payload['source']} does not exist in the workspace"
        )

    with tarfile.open(fileobj=sys.stdout.buffer, mode="w|") as archive:
        archive.add(path, arcname=path.name)

    sys.stdout.buffer.flush()

    return locate.EXIT_SUCCESS


def make_writable_and_retry(
    function: typing.Callable[[str], typing.Any], path: str, _: typing.Any
) -> None:
    os.chmod(path, stat.S_IWRITE)
    function(path)


def remove_tree(directory: pathlib.Path) -> None:
    if sys.version_info >= (3, 12):
        shutil.rmtree(directory, onexc=make_writable_and_retry)
    else:
        shutil.rmtree(directory, onerror=make_writable_and_retry)


def kill(payload: dict[str, typing.Any]) -> int:
    workspace = locate.workspace_path(payload)
    print(serve.kill_server(workspace, payload), flush=True)
    print(execute_in_environment.kill_jobs(workspace, payload), flush=True)

    return locate.EXIT_SUCCESS


def remove_children(
    workspace: pathlib.Path, kept: typing.Iterable[str]
) -> None:
    for child in workspace.iterdir():
        if child.name in kept:
            continue

        if child.is_dir() and not child.is_symlink():
            remove_tree(child)
        else:
            child.unlink()


def remove(payload: dict[str, typing.Any]) -> int:
    workspace = locate.workspace_path(payload)
    kept = (
        locate.SESSION_DIRECTORIES
        if payload.get("keep_session_directories")
        else ()
    )
    print(kill_with_virtual_environment(payload), flush=True)

    try:
        remove_children(workspace, kept)
    except OSError as error:
        raise locate.RunError(
            f"cannot remove {workspace}: {error}", locate.EXIT_KILL_FAILED
        ) from error

    locate.remove_empty_directories(workspace, locate.temporary_root(payload))
    print(f"removed {workspace}", flush=True)

    return locate.EXIT_SUCCESS


def kill_with_virtual_environment(payload: dict[str, typing.Any]) -> str:
    workspace = locate.workspace_path(payload)
    python = locate.virtual_environment_python(workspace)

    if not python.exists():
        return "no virtual environment to kill the server and jobs with"

    result = subprocess.run(
        [
            str(python),
            __file__,
            "kill",
            locate.encode_payload(payload),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    output = (result.stdout + result.stderr).strip()

    if result.returncode != locate.EXIT_SUCCESS:
        raise locate.RunError(
            "killing the server and jobs exited"
            f" with code {result.returncode},"
            f" so {workspace} stays: {output}",
            locate.EXIT_KILL_FAILED,
        )

    return output


def in_virtual_environment(workspace: pathlib.Path) -> bool:
    return (
        pathlib.Path(sys.prefix).resolve()
        == (workspace / locate.VIRTUAL_ENVIRONMENT_DIRECTORY).resolve()
    )


def parse_arguments(arguments: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog=pathlib.Path(__file__).name)
    commands = parser.add_subparsers(dest="command_name", required=True)
    handlers = (
        ("set_up", set_up_environment.set_up),
        ("up", serve.up),
        ("down", serve.down),
        ("kill", kill),
        ("call", call.call),
        ("execute", execute_in_environment.execute),
        ("wrap", execute_in_environment.wrap),
        ("status", execute_in_environment.status),
        ("unpack", unpack),
        ("pack", pack),
        ("remove", remove),
    )

    for name, handler in handlers:
        command = commands.add_parser(name)
        command.set_defaults(handler=handler)
        command.add_argument("payload", type=locate.decode_payload)

    return parser.parse_args(arguments)


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8")

    program_name = pathlib.Path(__file__).name
    options = parse_arguments(sys.argv[1:])

    try:
        workspace = locate.workspace_path(options.payload)

        if (
            options.command_name in VIRTUAL_ENVIRONMENT_COMMANDS
            and not in_virtual_environment(workspace)
        ):
            python = locate.virtual_environment_python(workspace)

            if not python.exists():
                raise locate.RunError(
                    f"{python} does not exist; the workspace is not set up",
                    locate.EXIT_SET_UP_FAILED,
                )

            return subprocess.run(
                [str(python), __file__, *sys.argv[1:]], check=False
            ).returncode

        return options.handler(options.payload)
    except locate.RunError as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)

        return error.exit_code


if __name__ == "__main__":
    sys.exit(main())
