import base64
import glob
import pathlib
import re
import subprocess
import sys
import typing

import locate

SSH_DIRECTORY_PATH = pathlib.Path.home() / ".ssh"
SSH_CONFIGURATION_PATH = SSH_DIRECTORY_PATH / "config"
SSH_INCLUDE_DEPTH = 16
SSH_CONNECT_TIMEOUT_SECONDS = 10
SSH_OPTIONS = (
    "-T",
    *locate.SSH_BATCH_OPTIONS,
    "-o",
    f"ConnectTimeout={SSH_CONNECT_TIMEOUT_SECONDS}",
)
LOCAL_MACHINE = "local"
GIT_HOST_NAMES = (
    "github.com",
    "gitlab.com",
    "bitbucket.org",
    "ssh.dev.azure.com",
)
BARE_WORD_PATTERN = re.compile(r"[\w.:\\/+-]+")
SSH_CONNECTION_FAILED = 255
PROBE_TIMEOUT_SECONDS = 30
PROBE_FIELD_COUNT = 5
KEYWORD_PART_COUNT = 2
PROBE_SCRIPT = """\
import os, platform, shutil, sys, tempfile
candidates = [tempfile.gettempdir()]
if os.name == "posix":
    candidates.append("/var/tmp")
free = {}
for path in candidates:
    if os.path.isdir(path) and os.access(path, os.W_OK):
        free[path] = shutil.disk_usage(path).free
root = max(free, key=free.get) if free else candidates[0]
version = "%d.%d" % sys.version_info[:2]
print(sys.executable, platform.system(), root, version, free.get(root, 0), \
sep="\\t")
"""
PROBE_CODE = "import base64;exec(base64.b64decode('{}'))".format(
    base64.b64encode(PROBE_SCRIPT.encode("utf-8")).decode("ascii")
)
PYTHON_CANDIDATES = ("python3", "python")
GIBIBYTE = 1024**3
LOW_SPACE_BYTES = 10 * GIBIBYTE


class Machine(typing.NamedTuple):
    name: str
    host: str | None
    python: str
    system: str
    temporary_root: str
    version: str
    free_bytes: int = 0


class Probe(typing.NamedTuple):
    name: str
    machine: Machine | None
    problem: str


def included_paths(pattern: str) -> list[pathlib.Path]:
    path = pathlib.Path(pattern).expanduser()

    if not path.is_absolute():
        path = SSH_DIRECTORY_PATH / path

    return [pathlib.Path(match) for match in sorted(glob.glob(str(path)))]


def ssh_configuration_lines(path: pathlib.Path, depth: int = 0) -> list[str]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []

    expanded: list[str] = []

    for line in lines:
        parts = line.strip().split(None, 1)

        if len(parts) == KEYWORD_PART_COUNT and parts[0].lower() == "include":
            if depth < SSH_INCLUDE_DEPTH:
                for pattern in parts[1].split():
                    for included in included_paths(pattern):
                        expanded.extend(
                            ssh_configuration_lines(included, depth + 1)
                        )

            continue

        expanded.append(line)

    return expanded


def ssh_hosts() -> list[tuple[str, str]]:
    lines = ssh_configuration_lines(SSH_CONFIGURATION_PATH)
    hosts: list[tuple[str, str]] = []
    current: list[str] = []
    host_names: dict[str, str] = {}

    for line in lines:
        parts = line.strip().split(None, 1)

        if len(parts) != KEYWORD_PART_COUNT or parts[0].startswith("#"):
            continue

        keyword, value = parts[0].lower(), parts[1].strip()

        if keyword == "host":
            current = [
                name
                for name in value.split()
                if not re.search(r"[*?!]", name)
            ]

            for name in current:
                hosts.append((name, name))
        elif keyword == "match":
            current = []
        elif keyword == "hostname":
            for name in current:
                host_names[name] = value

    return [(name, host_names.get(name, name)) for name, _ in hosts]


def is_git_host(host_name: str) -> bool:
    lowered = host_name.lower()

    return lowered in GIT_HOST_NAMES or lowered.startswith("git.")


def machine_names() -> list[str]:
    return [LOCAL_MACHINE] + [
        name for name, host_name in ssh_hosts() if not is_git_host(host_name)
    ]


def command_word(program: str) -> str:
    return program if BARE_WORD_PATTERN.fullmatch(program) else f'"{program}"'


def ssh_command(host: str, arguments: list[str]) -> list[str]:
    program, *rest = arguments

    return [
        "ssh",
        *SSH_OPTIONS,
        host,
        " ".join(
            [command_word(program), *(f'"{argument}"' for argument in rest)]
        ),
    ]


def parse_probe(name: str, host: str | None, output: str) -> Machine | None:
    fields = (
        output.strip().splitlines()[-1].split("\t")
        if output.strip()
        else []
    )

    if len(fields) != PROBE_FIELD_COUNT:
        return None

    python, system, temporary_root, version, free_bytes = fields

    return Machine(
        name,
        host,
        python,
        system,
        temporary_root,
        version,
        int(free_bytes),
    )


def probe_local() -> Probe:
    result = subprocess.run(
        [sys.executable, "-c", PROBE_CODE],
        capture_output=True,
        text=True,
        check=False,
    )

    return Probe(
        LOCAL_MACHINE,
        parse_probe(LOCAL_MACHINE, None, result.stdout),
        result.stderr.strip(),
    )


def probe_remote(name: str) -> Probe:
    problem = ""

    for candidate in PYTHON_CANDIDATES:
        try:
            result = subprocess.run(
                ["ssh", *SSH_OPTIONS, name, f'{candidate} -c "{PROBE_CODE}"'],
                capture_output=True,
                text=True,
                timeout=PROBE_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return Probe(
                name, None, f"no answer in {PROBE_TIMEOUT_SECONDS} seconds"
            )

        machine = (
            parse_probe(name, name, result.stdout)
            if result.returncode == 0
            else None
        )

        if machine is not None:
            return Probe(name, machine, "")

        problem = (
            result.stderr.strip().splitlines()
            or [f"exited with code {result.returncode}"]
        )[-1]

        if result.returncode == SSH_CONNECTION_FAILED:
            return Probe(name, None, problem)

    return Probe(name, None, f"no python3 or python: {problem}")


def probe(name: str) -> Probe:
    return probe_local() if name == LOCAL_MACHINE else probe_remote(name)


def python_version(machine: Machine) -> tuple[int, int]:
    major, minor = (int(part) for part in machine.version.split("."))

    return major, minor


def version_problem(machine: Machine) -> str:
    if python_version(machine) < locate.SCRIPT_MINIMUM_PYTHON:
        return (
            f"Python {machine.version} is too old"
            " to run the machine-side scripts"
        )

    return ""


def version_note(machine: Machine) -> str:
    if python_version(machine) < locate.ENVIRONMENT_MINIMUM_PYTHON:
        return (
            f"Python {machine.version}"
            f" < {locate.ENVIRONMENT_MINIMUM_PYTHON_TEXT},"
            " so open installs an isolated uv Python"
        )

    return ""


def space_note(machine: Machine) -> str:
    if machine.free_bytes >= LOW_SPACE_BYTES:
        return ""

    return (
        f"only {gibibytes(machine.free_bytes)} free"
        f" in {machine.temporary_root}"
    )


def gibibytes(size: int) -> str:
    return f"{size / GIBIBYTE:.1f} GiB"


def machine_notes(machine: Machine) -> str:
    return "; ".join(
        note for note in (version_note(machine), space_note(machine)) if note
    )


def usable_machine(probe_result: Probe) -> Machine:
    if probe_result.machine is None:
        raise locate.RunError(
            f"{probe_result.name} is unreachable: {probe_result.problem}",
            locate.EXIT_UNREACHABLE,
        )

    problem = version_problem(probe_result.machine)

    if problem:
        raise locate.RunError(
            f"{probe_result.name}: {problem}", locate.EXIT_UNREACHABLE
        )

    return probe_result.machine
