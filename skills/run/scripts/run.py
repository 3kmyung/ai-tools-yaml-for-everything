import argparse
import base64
import concurrent.futures
import io
import json
import pathlib
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import typing

import bundle
import locate
import probe
import run_on_machine
import tunnel

PROGRAM_NAME = pathlib.Path(__file__).name
TEMPORARY_ROOT = pathlib.Path(tempfile.gettempdir())
KIBIBYTE = 1024
ENTRY_FILE = pathlib.Path(run_on_machine.__file__).name
BOOTSTRAP_SCRIPT = (
    "import sys,tarfile,pathlib\n"
    "workspace=pathlib.Path(ROOT,*PARTS)\n"
    "workspace.mkdir(parents=True)\n"
    "archive=tarfile.open(fileobj=sys.stdin.buffer,mode='r|*')\n"
    "try:\n archive.extractall(workspace,filter='data')\n"
    "except TypeError:\n archive.extractall(workspace)\n"
    "print(workspace)\n"
)


def machines(options: argparse.Namespace) -> int:
    names = probe.machine_names()

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(names)) as pool:
        probes = list(pool.map(probe.probe, names))

    print("machine\tstate\tpython\tsystem\tfree\tdetail")

    for probe_result in probes:
        if probe_result.machine is None:
            print(
                f"{probe_result.name}\tunreachable\t-\t-\t-\t"
                f"{probe_result.problem}"
            )
            continue

        machine = probe_result.machine
        problem = probe.version_problem(machine)
        state = "unusable" if problem else "ready"
        detail = problem or probe.machine_notes(machine)
        free = probe.gibibytes(machine.free_bytes)
        print(
            f"{probe_result.name}\t{state}\t{machine.version}"
            f"\t{machine.system}\t{free}\t{detail}"
        )

    return locate.EXIT_SUCCESS


def session_root(project: str, session: str) -> pathlib.Path:
    return TEMPORARY_ROOT / project / session


def state_path(state: dict[str, typing.Any]) -> pathlib.Path:
    return (
        session_root(state["project"], state["session"])
        / locate.SESSION_STATE_DIRECTORY
        / f"{state['machine']['name']}.json"
    )


def logs_directory(state: dict[str, typing.Any]) -> pathlib.Path:
    return (
        session_root(state["project"], state["session"])
        / locate.SESSION_LOGS_DIRECTORY
        / state["machine"]["name"]
    )


def log_path(state: dict[str, typing.Any], label: str) -> pathlib.Path:
    return logs_directory(state) / f"{label}.txt"


def write_state(state: dict[str, typing.Any]) -> None:
    path = state_path(state)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def open_sessions(project: str) -> dict[str, list[pathlib.Path]]:
    root = TEMPORARY_ROOT / project
    pattern = f"*/*/{locate.SESSION_STATE_DIRECTORY}/*.json"
    paths = sorted(root.glob(pattern)) if root.is_dir() else []
    sessions: dict[str, list[pathlib.Path]] = {}

    for path in paths:
        directory = path.parent.parent
        session = f"{directory.parent.name}/{directory.name}"
        sessions.setdefault(session, []).append(path)

    return sessions


def only_choice(choices: list[str], noun: str, flag: str) -> str:
    if len(choices) == 1:
        return choices[0]

    if not choices:
        raise locate.RunError(f"no open {noun}; run open first")

    raise locate.RunError(
        f"several open {noun}s: {', '.join(choices)}; pass {flag}"
    )


def read_state(options: argparse.Namespace) -> dict[str, typing.Any]:
    sessions = open_sessions(bundle.project_name(pathlib.Path.cwd()))
    session_name = options.session or only_choice(
        sorted(sessions), "session", "--session <service>/<timestamp>"
    )
    paths = {path.stem: path for path in sessions.get(session_name, [])}

    if not paths:
        raise locate.RunError(
            f"no open session {session_name}; run list to see open ones"
        )

    machine_name = options.machine or only_choice(
        sorted(paths), "machine", "--machine <machine>"
    )

    if machine_name not in paths:
        raise locate.RunError(
            f"{machine_name} is not open in {session_name};"
            f" open machines: {', '.join(sorted(paths))}"
        )

    try:
        return json.loads(paths[machine_name].read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise locate.RunError(
            f"cannot read {paths[machine_name]}: {error}"
        ) from error


def remove_state(state: dict[str, typing.Any]) -> None:
    state_path(state).unlink(missing_ok=True)
    shutil.rmtree(state_path(state).with_suffix(""), ignore_errors=True)
    shutil.rmtree(logs_directory(state), ignore_errors=True)
    locate.remove_empty_directories(
        session_root(state["project"], state["session"]), TEMPORARY_ROOT
    )


def machine_of(state: dict[str, typing.Any]) -> probe.Machine:
    return probe.Machine(**state["machine"])


def shares_session_root(state: dict[str, typing.Any]) -> bool:
    if machine_of(state).host is not None:
        return False

    root = session_root(state["project"], state["session"])

    return pathlib.Path(state["workspace"]).resolve() == root.resolve()


def target_command(machine: probe.Machine, arguments: list[str]) -> list[str]:
    if machine.host is None:
        return arguments

    return probe.ssh_command(machine.host, arguments)


def machine_command(
    state: dict[str, typing.Any], command_name: str, **fields: typing.Any
) -> list[str]:
    machine = machine_of(state)
    payload = {
        "workspace": state["workspace"],
        "temporary_root": machine.temporary_root,
        "project": state["project"],
        "service": state["service"],
        "machine": machine.name,
        **fields,
    }
    separator = "\\" if machine.system == "Windows" else "/"

    return target_command(
        machine,
        [
            machine.python,
            f"{state['workspace']}{separator}{ENTRY_FILE}",
            command_name,
            locate.encode_payload(payload),
        ],
    )


def run_machine_command(
    state: dict[str, typing.Any],
    command_name: str,
    input_bytes: bytes | None = None,
    capture: bool = False,
    **fields: typing.Any,
) -> subprocess.CompletedProcess:
    return subprocess.run(
        machine_command(state, command_name, **fields),
        input=input_bytes,
        stdin=None if input_bytes is not None else subprocess.DEVNULL,
        capture_output=capture,
        check=False,
    )


def unpack_workspace(
    machine: probe.Machine, archive: bytes, parts: list[str]
) -> str:
    if machine.host is None:
        workspace = pathlib.Path(machine.temporary_root).joinpath(*parts)
        workspace.mkdir(parents=True, exist_ok=True)
        locate.extract(io.BytesIO(archive), workspace)

        return str(workspace)

    script = BOOTSTRAP_SCRIPT.replace(
        "ROOT", json.dumps(machine.temporary_root)
    ).replace("PARTS", json.dumps(parts))
    bootstrap = base64.b64encode(script.encode("utf-8")).decode("ascii")
    command = (
        f"{probe.command_word(machine.python)}"
        f" -c \"import base64;exec(base64.b64decode('{bootstrap}'))\""
    )
    result = subprocess.run(
        ["ssh", *probe.SSH_OPTIONS, machine.host, command],
        input=archive,
        capture_output=True,
        check=False,
    )

    if result.returncode != locate.EXIT_SUCCESS:
        error_output = result.stderr.decode("utf-8", "replace").strip()
        raise locate.RunError(
            f"unpacking on {machine.name} failed: {error_output}",
            locate.EXIT_UNREACHABLE,
        )

    return result.stdout.decode("utf-8").strip().splitlines()[-1]


def open_machine(
    probe_result: probe.Probe,
    archive: bytes,
    session_fields: dict[str, str],
    packages: list[str],
) -> int:
    try:
        machine = probe.usable_machine(probe_result)
        workspace = unpack_workspace(
            machine,
            archive,
            [session_fields["project"], session_fields["session"]],
        )
    except locate.RunError as error:
        print(f"{PROGRAM_NAME}: error: {error}", file=sys.stderr)

        return error.exit_code

    state = {
        **session_fields,
        "machine": machine._asdict(),
        "workspace": workspace,
        "tunnels": [],
    }
    write_state(state)
    print(f"unpacked to {machine.name}:{workspace}", flush=True)
    code = run_machine_command(state, "set_up", packages=packages).returncode

    if code != locate.EXIT_SUCCESS:
        print(
            f"{PROGRAM_NAME}: error: set up on {machine.name}"
            f" exited with code {code};"
            f" it stays open until close --machine {machine.name}",
            file=sys.stderr,
        )

        return code

    print(f"ready {machine.name}", flush=True)

    return locate.EXIT_SUCCESS


def open_session(options: argparse.Namespace) -> int:
    start = pathlib.Path.cwd()
    names = list(dict.fromkeys(options.machine))

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(names)) as pool:
        probes = list(pool.map(probe.probe, names))

    service_name, archive = bundle.workspace_archive(
        bundle.repository_root(start),
        options.ref,
        options.service,
        run_on_machine.MACHINE_FILES,
    )
    session_fields = {
        "project": bundle.project_name(start),
        "service": service_name,
        "session": f"{service_name}/{time.strftime(locate.TIMESTAMP_FORMAT)}",
    }
    session_name = session_fields["session"]
    root = session_root(session_fields["project"], session_name)

    try:
        root.mkdir(parents=True)
    except FileExistsError as error:
        raise locate.RunError(
            f"session {session_name} already exists; open again a second later"
        ) from error

    print(
        f"packed {options.ref} and releases/{service_name}:"
        f" {len(archive) // KIBIBYTE} KiB",
        flush=True,
    )
    codes = [
        open_machine(probe_result, archive, session_fields, options.packages)
        for probe_result in probes
    ]
    locate.remove_empty_directories(root, TEMPORARY_ROOT)

    if root.is_dir():
        print(f"session {session_name}")

    return next(
        (code for code in codes if code != locate.EXIT_SUCCESS),
        locate.EXIT_SUCCESS,
    )


def close_tunnels(state: dict[str, typing.Any]) -> None:
    for pid in state.get("tunnels", []):
        tunnel.kill_process(pid)

    state["tunnels"] = []
    write_state(state)


def up(options: argparse.Namespace) -> int:
    state = read_state(options)
    machine = machine_of(state)
    result = run_machine_command(
        state, "up", capture=True, webui=options.webui, timeout=options.timeout
    )
    sys.stderr.write(result.stderr.decode("utf-8", "replace"))
    lines = result.stdout.decode("utf-8", "replace").strip().splitlines()
    started = result.returncode == locate.EXIT_SUCCESS

    for line in lines[:-1] if started else lines:
        print(line)

    if not started:
        return result.returncode

    ready = json.loads(lines[-1])
    ready["local_ports"] = dict(ready["ports"])
    state["server"] = ready
    close_tunnels(state)
    write_state(state)

    if machine.host is not None:
        for label, remote_port in ready["ports"].items():
            pid, local_port = tunnel.open_tunnel(
                str(machine.host), label, remote_port, log_path(state, label)
            )
            state["tunnels"].append(pid)
            ready["local_ports"][label] = local_port
            write_state(state)

    for label, port in ready["local_ports"].items():
        suffix = ready["base_path"] if label == "adapter" else ""
        print(f"{label}: http://{locate.HOST}:{port}{suffix}")

    print(f"server log on {machine.name}: {ready['log']}")

    return locate.EXIT_SUCCESS


def down(options: argparse.Namespace) -> int:
    state = read_state(options)
    close_tunnels(state)
    state.pop("server", None)
    write_state(state)

    return run_machine_command(state, "down").returncode


def archive_of(path: pathlib.Path, archive_name: str) -> bytes:
    buffer = io.BytesIO()

    with tarfile.open(fileobj=buffer, mode="w:") as archive:
        archive.add(path, arcname=archive_name)

    return buffer.getvalue()


def inputs_archive(files: dict[str, pathlib.Path]) -> bytes:
    buffer = io.BytesIO()

    with tarfile.open(fileobj=buffer, mode="w:") as archive:
        for field, path in files.items():
            archive.add(path, arcname=f"{field}/{path.name}")

    return buffer.getvalue()


def upload_path(
    state: dict[str, typing.Any],
    source: pathlib.Path,
    destination: str,
    archive_name: str,
) -> None:
    result = run_machine_command(
        state,
        "unpack",
        input_bytes=archive_of(source, archive_name),
        capture=True,
        destination=destination,
    )

    if result.returncode != locate.EXIT_SUCCESS:
        error_output = result.stderr.decode("utf-8", "replace").strip()
        raise locate.RunError(
            f"uploading {source} failed: {error_output}", result.returncode
        )


def download_path(
    state: dict[str, typing.Any], source: str, destination: pathlib.Path
) -> None:
    result = run_machine_command(state, "pack", capture=True, source=source)

    if result.returncode != locate.EXIT_SUCCESS:
        error_output = result.stderr.decode("utf-8", "replace").strip()
        raise locate.RunError(
            f"downloading {source} failed: {error_output}", result.returncode
        )

    locate.extract(io.BytesIO(result.stdout), destination)


def parse_files(pairs: list[str]) -> dict[str, pathlib.Path]:
    files: dict[str, pathlib.Path] = {}

    for pair in pairs:
        field, separator, path_text = pair.partition("=")
        path = pathlib.Path(path_text)

        if not separator or not field:
            raise locate.RunError(f"--file expects FIELD=PATH, got {pair!r}")

        if not path.is_file():
            raise locate.RunError(f"--file {field}: {path} does not exist")

        files[field] = path.resolve()

    return files


def unused_call_id(output_directory: pathlib.Path) -> str:
    timestamp = time.strftime(locate.TIMESTAMP_FORMAT)
    call_id = timestamp
    suffix = 1

    while (output_directory / call_id).exists():
        suffix += 1
        call_id = f"{timestamp}-{suffix}"

    return call_id


def call(options: argparse.Namespace) -> int:
    state = read_state(options)

    try:
        workflow_input = json.loads(options.input_json)
    except json.JSONDecodeError as error:
        raise locate.RunError(f"input is not valid JSON: {error}") from error

    if not isinstance(workflow_input, dict):
        raise locate.RunError("input must be a JSON object")

    files = parse_files(options.file)
    local = machine_of(state).host is None
    output_directory = (
        options.output_directory
        or session_root(state["project"], state["session"])
        / locate.SESSION_OUTPUTS_DIRECTORY
        / state["machine"]["name"]
    ).resolve()
    call_id = unused_call_id(output_directory)
    staged_output = (
        f"{locate.SESSION_OUTPUTS_DIRECTORY}/"
        f"{state['machine']['name']}/{call_id}"
    )
    code = run_machine_command(
        state,
        "call",
        input_bytes=inputs_archive(files) if files else None,
        workflow=options.workflow,
        input=workflow_input,
        files={field: f"{field}/{path.name}" for field, path in files.items()},
        output=str(output_directory / call_id) if local else staged_output,
    ).returncode

    if code != locate.EXIT_SUCCESS:
        return code

    if not local:
        download_path(state, staged_output, output_directory)

    print(f"saved {output_directory / call_id}")

    return locate.EXIT_SUCCESS


def execute(options: argparse.Namespace) -> int:
    state = read_state(options)

    if not options.command:
        raise locate.RunError("execute needs a command after --")

    return run_machine_command(
        state,
        "execute",
        command=options.command,
        directory=options.directory,
        detach=options.detach,
    ).returncode


def status(options: argparse.Namespace) -> int:
    state = read_state(options)

    return run_machine_command(
        state, "status", job=options.job, lines=options.lines
    ).returncode


def upload(options: argparse.Namespace) -> int:
    state = read_state(options)
    source = pathlib.Path(options.source)

    if not source.exists():
        raise locate.RunError(f"{source} does not exist")

    destination = pathlib.PurePosixPath(options.destination)
    upload_path(
        state, source.resolve(), str(destination.parent), destination.name
    )
    print(f"uploaded {source} to {state['machine']['name']}:{destination}")

    return locate.EXIT_SUCCESS


def download(options: argparse.Namespace) -> int:
    state = read_state(options)
    source = pathlib.PurePosixPath(options.source)
    download_path(
        state, str(source), pathlib.Path(options.destination).resolve()
    )
    print(f"downloaded {source.name} into {options.destination}")

    return locate.EXIT_SUCCESS


def close_session(options: argparse.Namespace) -> int:
    state = read_state(options)
    close_tunnels(state)
    code = run_machine_command(
        state,
        "remove",
        keep_session_directories=shares_session_root(state),
    ).returncode

    if code != locate.EXIT_SUCCESS:
        return code

    remove_state(state)

    return locate.EXIT_SUCCESS


def list_sessions(options: argparse.Namespace) -> int:
    sessions = open_sessions(bundle.project_name(pathlib.Path.cwd()))

    if not sessions:
        print("no open sessions")

    for session, paths in sorted(sessions.items()):
        for path in paths:
            state = json.loads(path.read_text(encoding="utf-8"))
            server = state.get("server")
            serving = (
                ", ".join(
                    f"{label} {locate.HOST}:{port}"
                    for label, port in server["local_ports"].items()
                )
                if server
                else "no server"
            )
            print(f"{session}\t{path.stem}:{state['workspace']}\t{serving}")

    return locate.EXIT_SUCCESS


def parse_arguments(arguments: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog=PROGRAM_NAME)
    commands = parser.add_subparsers(dest="command_name", required=True)
    commands.add_parser("machines").set_defaults(handler=machines)
    commands.add_parser("list").set_defaults(handler=list_sessions)

    opening = commands.add_parser("open")
    opening.set_defaults(handler=open_session)
    opening.add_argument("service")
    opening.add_argument("--machine", action="append", required=True)
    opening.add_argument("--ref", default="main")
    opening.add_argument(
        "--package", action="append", dest="packages", default=[]
    )

    targeting = argparse.ArgumentParser(add_help=False)
    targeting.add_argument("--session", metavar="SERVICE/TIMESTAMP")
    targeting.add_argument("--machine")

    serving = commands.add_parser("up", parents=[targeting])
    serving.set_defaults(handler=up)
    serving.add_argument(
        "--webui", choices=locate.WEBUI_CHOICES, default=locate.WEBUI_NONE
    )
    serving.add_argument(
        "--timeout", type=int, default=locate.UP_TIMEOUT_SECONDS
    )

    for name, handler in (("down", down), ("close", close_session)):
        commands.add_parser(name, parents=[targeting]).set_defaults(
            handler=handler
        )

    calling = commands.add_parser("call", parents=[targeting])
    calling.set_defaults(handler=call)
    calling.add_argument("workflow")
    calling.add_argument("input_json")
    calling.add_argument(
        "--file", action="append", default=[], metavar="FIELD=PATH"
    )
    calling.add_argument("--output-directory", type=pathlib.Path)

    executing = commands.add_parser("execute", parents=[targeting])
    executing.set_defaults(handler=execute)
    executing.add_argument("--directory", default=".")
    executing.add_argument("--detach", action="store_true")

    reporting = commands.add_parser("status", parents=[targeting])
    reporting.set_defaults(handler=status)
    reporting.add_argument("--job")
    reporting.add_argument("--lines", type=int, default=locate.LOG_TAIL_LINES)

    uploading = commands.add_parser("upload", parents=[targeting])
    uploading.set_defaults(handler=upload)
    uploading.add_argument("source")
    uploading.add_argument("destination")

    downloading = commands.add_parser("download", parents=[targeting])
    downloading.set_defaults(handler=download)
    downloading.add_argument("source")
    downloading.add_argument("destination")

    command: list[str] = []

    if "--" in arguments:
        separator = arguments.index("--")
        command = arguments[separator + 1 :]
        arguments = arguments[:separator]

    options = parser.parse_args(arguments)
    options.command = command

    return options


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8")

    options = parse_arguments(sys.argv[1:])

    try:
        return options.handler(options)
    except locate.RunError as error:
        print(f"{PROGRAM_NAME}: error: {error}", file=sys.stderr)

        return error.exit_code


if __name__ == "__main__":
    sys.exit(main())
