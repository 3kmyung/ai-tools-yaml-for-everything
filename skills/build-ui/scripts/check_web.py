import argparse
import io
import os
import pathlib
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile
import typing

import shell_files

SCRIPTS_DIRECTORY = pathlib.Path(__file__).resolve().parent
VERIFY_SCRIPT = SCRIPTS_DIRECTORY / "verify.py"
PNPM_COMMAND = "pnpm"
PNPM_STEPS = ("install", "test", "typecheck", "build")
LOCK_FILE = "pnpm-lock.yaml"
LONG_PATH_ERROR = "ERR_PACKAGE_IMPORT_NOT_DEFINED"
COPY_EXCLUDED = ("node_modules", "dist")
WINDOWS_SHORT_ROOT = pathlib.Path("C:/Temp")
SHORT_NAME_PREFIX = "cw-"
SHORT_NAME_BYTES = 3
EXIT_SUCCESS = 0
EXIT_FAILED = 1
EXIT_USAGE = 2


class StepFailedError(Exception):
    def __init__(self, step: str, output: str) -> None:
        super().__init__(f"step '{step}' failed")
        self.step = step
        self.output = output


def parse_arguments(arguments: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog=pathlib.Path(__file__).name)
    parser.add_argument("web_directory", type=pathlib.Path)

    return parser.parse_args(arguments)


def steps(
    pnpm: str, web_directory: pathlib.Path
) -> list[tuple[str, list[str]]]:
    return [
        (
            "verify.py",
            [sys.executable, "-B", str(VERIFY_SCRIPT), str(web_directory)],
        ),
        *((f"pnpm {step}", [pnpm, step]) for step in PNPM_STEPS),
    ]


def run_streaming(
    command: list[str], directory: pathlib.Path
) -> tuple[int, str]:
    collected: list[str] = []

    with subprocess.Popen(
        command,
        cwd=directory,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    ) as process:
        assert process.stdout is not None

        for raw_line in process.stdout:
            line = raw_line.decode("utf-8", "replace")
            collected.append(line)
            sys.stdout.write(line)
            sys.stdout.flush()

    return process.returncode, "".join(collected)


def run_sequence(pnpm: str, web_directory: pathlib.Path) -> None:
    for name, command in steps(pnpm, web_directory):
        print(f"==> {name} ({web_directory})", flush=True)
        code, output = run_streaming(command, web_directory)

        if code != 0:
            raise StepFailedError(name, output)


def short_copy_root() -> pathlib.Path:
    name = SHORT_NAME_PREFIX + secrets.token_hex(SHORT_NAME_BYTES)

    if sys.platform == "win32":
        WINDOWS_SHORT_ROOT.mkdir(parents=True, exist_ok=True)
        root = WINDOWS_SHORT_ROOT / name
        root.mkdir()
        return root

    return pathlib.Path(tempfile.mkdtemp(prefix=SHORT_NAME_PREFIX))


def make_writable_and_retry(
    function: typing.Callable[[str], object], path: str, _: BaseException
) -> None:
    os.chmod(path, stat.S_IWRITE)
    function(path)


def run_in_short_copy(pnpm: str, web_directory: pathlib.Path) -> None:
    root = short_copy_root()
    release_name = shell_files.release_name_of(web_directory)
    copy = (
        root
        / shell_files.RELEASES_DIRECTORY_NAME
        / release_name
        / shell_files.WEB_DIRECTORY_NAME
    )
    workspace_copy = shell_files.workspace_directory(copy.parent)
    print(
        f"{LONG_PATH_ERROR}: the path is too long for Node,"
        f" rerunning in {copy}",
        flush=True,
    )

    try:
        ignored = shutil.ignore_patterns(*COPY_EXCLUDED)
        workspace = shell_files.workspace_directory(web_directory.parent)
        shutil.copytree(web_directory, copy, ignore=ignored)
        shutil.copytree(
            workspace / shell_files.WEB_DIRECTORY_NAME,
            workspace_copy / shell_files.WEB_DIRECTORY_NAME,
            ignore=ignored,
        )

        for captured_file in workspace.glob(shell_files.CAPTURED_OUTPUT_GLOB):
            shutil.copy2(captured_file, workspace_copy / captured_file.name)

        try:
            run_sequence(pnpm, copy)
        finally:
            if (copy / LOCK_FILE).is_file():
                shutil.copy2(copy / LOCK_FILE, web_directory / LOCK_FILE)
                print(
                    f"copied {LOCK_FILE} back to {web_directory}", flush=True
                )
    finally:
        shutil.rmtree(root, onexc=make_writable_and_retry)
        print(f"deleted the short copy {root}", flush=True)


def check(web_directory: pathlib.Path) -> int:
    program_name = pathlib.Path(__file__).name
    pnpm = shutil.which(PNPM_COMMAND)

    if pnpm is None:
        print(
            f"{program_name}: error: {PNPM_COMMAND} is not on PATH",
            file=sys.stderr,
        )
        return EXIT_USAGE

    try:
        try:
            run_sequence(pnpm, web_directory)
        except StepFailedError as error:
            if LONG_PATH_ERROR not in error.output:
                raise
            run_in_short_copy(pnpm, web_directory)
    except StepFailedError as error:
        print(f"{program_name}: {error.step} failed", file=sys.stderr)
        return EXIT_FAILED

    if not (web_directory / LOCK_FILE).is_file():
        print(
            f"{program_name}: {LOCK_FILE} is missing after install",
            file=sys.stderr,
        )
        return EXIT_FAILED

    step_names = [name for name, _ in steps(pnpm, web_directory)]
    print(f"all steps passed: {', '.join(step_names)}")
    return EXIT_SUCCESS


def main() -> int:
    for output_file in (sys.stdout, sys.stderr):
        if isinstance(output_file, io.TextIOWrapper):
            output_file.reconfigure(encoding="utf-8")

    program_name = pathlib.Path(__file__).name
    options = parse_arguments(sys.argv[1:])
    web_directory = options.web_directory.resolve()

    if not web_directory.is_dir():
        print(
            f"{program_name}: error: {web_directory} is not a directory",
            file=sys.stderr,
        )
        return EXIT_USAGE

    if not shell_files.is_release_web_directory(web_directory):
        print(
            f"{program_name}: error: {web_directory}"
            " is not releases/<release>/web",
            file=sys.stderr,
        )
        return EXIT_USAGE

    return check(web_directory)


if __name__ == "__main__":
    sys.exit(main())
