from __future__ import annotations

import importlib.util
import os
import pathlib
import shutil
import subprocess
import sys
import typing
import urllib.request

import locate

UV_DIRECTORY = ".uv"
UV_INSTALLER_URL = "https://astral.sh/uv/install"
UV_PYTHON_VERSION = "3.12"
DOWNLOAD_USER_AGENT = "yaml-for-everything-run"
DOWNLOAD_TIMEOUT_SECONDS = 60
FFMPEG_TOOLS = ("ffmpeg", "ffprobe")
STATIC_FFMPEG_PATHS_MARKER = "static-ffmpeg-paths"
STATIC_FFMPEG_PATHS_CODE = (
    "import static_ffmpeg.run as run;"
    f"print('{STATIC_FFMPEG_PATHS_MARKER}',"
    " *run.get_or_fetch_platform_executables_else_raise(), sep=chr(9))"
)
WEBUI_COMPONENT_PROGRAMS = ("node", "pnpm")
WEBUI_COMPONENT_PURPOSE = "--webui component"
ENVIRONMENT_REMEDY = "the virtual environment is created with uv instead"
SUPPLY_REMEDY = "a copy is supplied inside the virtual environment"
REPORT_REMEDY = "nothing installs it; commands that need it refuse to start"


def run_step(
    step: list[str], environment: dict[str, str] | None = None
) -> None:
    print(f"$ {' '.join(step)}", flush=True)
    code = subprocess.run(
        step, stdin=subprocess.DEVNULL, env=environment, check=False
    ).returncode

    if code != locate.EXIT_SUCCESS:
        raise locate.RunError(
            f"{step[0]} exited with code {code}", locate.EXIT_SET_UP_FAILED
        )


def uv_environment(workspace: pathlib.Path) -> dict[str, str]:
    return {
        **os.environ,
        "UV_INSTALL_DIR": str(workspace / UV_DIRECTORY),
        "UV_PYTHON_INSTALL_DIR": str(workspace / UV_DIRECTORY / "python"),
        "UV_NO_MODIFY_PATH": "1",
    }


def install_uv(workspace: pathlib.Path) -> pathlib.Path:
    windows = sys.platform == "win32"
    installer = (
        workspace
        / UV_DIRECTORY
        / ("install.ps1" if windows else "install.sh")
    )
    installer.parent.mkdir(parents=True, exist_ok=True)
    url = UV_INSTALLER_URL + installer.suffix
    request = urllib.request.Request(
        url, headers={"User-Agent": DOWNLOAD_USER_AGENT}
    )

    try:
        with urllib.request.urlopen(
            request, timeout=DOWNLOAD_TIMEOUT_SECONDS
        ) as response:
            installer.write_bytes(response.read())
    except OSError as error:
        raise locate.RunError(
            f"cannot download the uv installer from {url}: {error}",
            locate.EXIT_SET_UP_FAILED,
        ) from error

    shell = (
        ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(installer)]
        if windows
        else ["sh", str(installer)]
    )
    run_step(shell, uv_environment(workspace))
    executable = next(
        (
            path
            for path in (workspace / UV_DIRECTORY).rglob(
                "uv.exe" if windows else "uv"
            )
            if path.is_file()
        ),
        None,
    )

    if executable is None:
        raise locate.RunError(
            f"the uv installer left no uv under {workspace / UV_DIRECTORY}",
            locate.EXIT_SET_UP_FAILED,
        )

    return executable


def create_virtual_environment(
    workspace: pathlib.Path, problems: dict[str, str]
) -> None:
    environment_directory = str(
        workspace / locate.VIRTUAL_ENVIRONMENT_DIRECTORY
    )

    if "python" in problems:
        python = UV_PYTHON_VERSION
    elif "ensurepip" in problems:
        python = sys.executable
    else:
        run_step([sys.executable, "-m", "venv", environment_directory])

        return

    uv = install_uv(workspace)
    run_step(
        [str(uv), "venv", "--seed", "--python", python, environment_directory],
        uv_environment(workspace),
    )


def supply_ffmpeg(workspace: pathlib.Path) -> None:
    python = str(locate.virtual_environment_python(workspace))
    run_step(
        [
            python,
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "static-ffmpeg",
        ]
    )
    result = subprocess.run(
        [python, "-c", STATIC_FFMPEG_PATHS_CODE],
        capture_output=True,
        text=True,
        check=False,
    )

    if result.returncode != locate.EXIT_SUCCESS:
        raise locate.RunError(
            "static-ffmpeg could not fetch its binaries:"
            f" {result.stderr.strip()}",
            locate.EXIT_SET_UP_FAILED,
        )

    suffix = ".exe" if sys.platform == "win32" else ""
    paths = next(
        (
            line.split("\t")[1:]
            for line in result.stdout.splitlines()
            if line.startswith(STATIC_FFMPEG_PATHS_MARKER + "\t")
        ),
        [],
    )

    if len(paths) != len(FFMPEG_TOOLS):
        raise locate.RunError(
            f"static-ffmpeg printed no binary paths: {result.stdout.strip()}",
            locate.EXIT_SET_UP_FAILED,
        )

    for name, source in zip(FFMPEG_TOOLS, paths):
        destination = (
            locate.virtual_environment_bin(workspace) / f"{name}{suffix}"
        )
        shutil.copy2(source, destination)
        print(f"placed {destination}", flush=True)


def python_problem() -> str:
    if sys.version_info >= locate.ENVIRONMENT_MINIMUM_PYTHON:
        return ""

    return (
        f"host Python {sys.version.split()[0]}"
        f" is older than {locate.ENVIRONMENT_MINIMUM_PYTHON_TEXT}"
    )


def ensurepip_problem() -> str:
    if importlib.util.find_spec("ensurepip") is not None:
        return ""

    return (
        "the host Python has no ensurepip,"
        " so python -m venv cannot seed pip"
    )


def host_problems() -> dict[str, str]:
    problems = {"python": python_problem(), "ensurepip": ensurepip_problem()}

    return {name: problem for name, problem in problems.items() if problem}


def missing_programs(
    workspace: pathlib.Path, names: tuple[str, ...]
) -> list[str]:
    search_path = locate.virtual_environment_variables(workspace)["PATH"]

    return [
        name
        for name in names
        if shutil.which(name, path=search_path) is None
    ]


def report_problems(
    problems: dict[str, str],
    missing_ffmpeg: list[str],
    missing_webui: list[str],
) -> None:
    for name, problem in problems.items():
        print(f"{name}: {problem}; {ENVIRONMENT_REMEDY}", flush=True)

    for name in missing_ffmpeg:
        print(f"{name}: {name} is not on PATH; {SUPPLY_REMEDY}", flush=True)

    for name in missing_webui:
        print(
            f"{name} (needed by {WEBUI_COMPONENT_PURPOSE}):"
            f" {name} is not on PATH; {REPORT_REMEDY}",
            flush=True,
        )


def set_up(payload: dict[str, typing.Any]) -> int:
    workspace = locate.workspace_path(payload)
    problems = host_problems()
    missing_ffmpeg = missing_programs(workspace, FFMPEG_TOOLS)
    missing_webui = missing_programs(workspace, WEBUI_COMPONENT_PROGRAMS)
    report_problems(problems, missing_ffmpeg, missing_webui)
    create_virtual_environment(workspace, problems)
    run_step(
        [
            str(locate.virtual_environment_python(workspace)),
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "-e",
            str(workspace),
            "psutil",
            *payload.get("packages", []),
        ]
    )

    if missing_ffmpeg:
        supply_ffmpeg(workspace)

    print(f"installed into {workspace}", flush=True)

    return locate.EXIT_SUCCESS
