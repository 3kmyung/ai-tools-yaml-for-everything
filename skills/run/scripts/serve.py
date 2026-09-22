from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import sys
import time
import typing

import diagnose
import locate
import set_up_environment

LAUNCHER = "model-compose"
SERVER_LOG_FILE = "server.txt"
DEFAULT_ADAPTER_PORT = 8080
DEFAULT_WEBSOCKET_PATH = "/ws"
WEBUI_COMPONENT_ID = "webui"
GRADIO_DRIVER = "gradio"
KILL_TIMEOUT_SECONDS = 15


class Interface(typing.NamedTuple):
    ports: dict[str, int]
    base_path: str
    websocket_path: str | None


def resolve_value(value: typing.Any) -> typing.Any:
    if not isinstance(value, str):
        return value

    text = value.strip()

    if not (text.startswith("${") and text.endswith("}")):
        return value

    body = text[2:-1]
    name, separator, default = body.partition("|")
    name = name.strip()

    if not name.startswith("env."):
        return value

    environment_value = os.environ.get(name[len("env.") :])

    if environment_value is not None:
        return environment_value

    return default.strip() if separator else None


def port_of(value: typing.Any) -> int | None:
    resolved = resolve_value(value)

    if isinstance(resolved, bool):
        return None

    try:
        return int(resolved)
    except (TypeError, ValueError):
        return None


def load_document(path: pathlib.Path) -> dict[str, typing.Any]:
    import yaml

    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, yaml.YAMLError) as error:
        raise locate.RunError(f"cannot read {path}: {error}") from error

    if not isinstance(document, dict):
        raise locate.RunError(f"{path} is not a YAML mapping")

    return document


def components_of(
    document: dict[str, typing.Any]
) -> list[dict[str, typing.Any]]:
    if "components" in document:
        values = document["components"] or []
    elif "component" in document:
        values = [document["component"]]
    else:
        values = []

    return [value for value in values if isinstance(value, dict)]


def section(
    document: dict[str, typing.Any], name: str
) -> dict[str, typing.Any] | None:
    controller = document.get("controller")
    value = controller.get(name) if isinstance(controller, dict) else None

    return value if isinstance(value, dict) else None


def free_port_after(port: int, taken: set[int]) -> int:
    candidate = port + 1

    while candidate in taken or locate.port_in_use(candidate):
        candidate += 1

    return candidate


def add_gradio(
    document: dict[str, typing.Any], adapter_port: int, changes: list[str]
) -> int:
    existing = section(document, "webui")

    if (
        existing is not None
        and existing.get("driver", GRADIO_DRIVER) == GRADIO_DRIVER
    ):
        port = port_of(existing.get("port"))

        if port is not None:
            return port

    taken = {
        port
        for port in (
            port_of(component.get("port"))
            for component in components_of(document)
        )
        if port
    }
    port = free_port_after(adapter_port, taken | {adapter_port})
    document.setdefault("controller", {})["webui"] = {
        "driver": GRADIO_DRIVER,
        "port": port,
    }
    changes.append(f"added controller.webui (gradio, port {port})")

    return port


def remove_unused_interfaces(
    document: dict[str, typing.Any], webui: str, changes: list[str]
) -> None:
    controller = document.get("controller")

    if (
        webui != locate.WEBUI_GRADIO
        and isinstance(controller, dict)
        and "webui" in controller
    ):
        del controller["webui"]
        changes.append("removed controller.webui")

    components = document.get("components")

    if webui != locate.WEBUI_COMPONENT and isinstance(components, list):
        kept = [
            component
            for component in components
            if not (
                isinstance(component, dict)
                and component.get("id") == WEBUI_COMPONENT_ID
            )
        ]

        if len(kept) != len(components):
            document["components"] = kept
            changes.append(f"removed the {WEBUI_COMPONENT_ID} component")


def original_document(
    path: pathlib.Path, original_path: pathlib.Path
) -> dict[str, typing.Any]:
    if not original_path.exists():
        original_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, original_path)

    return load_document(original_path)


def save_changes(
    path: pathlib.Path,
    original_path: pathlib.Path,
    document: dict[str, typing.Any],
    changes: list[str],
) -> None:
    import yaml

    if not changes:
        shutil.copy2(original_path, path)

        return

    path.write_text(
        yaml.safe_dump(document, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )
    print(
        f"workspace copy of {locate.COMPOSE_FILE}: {'; '.join(changes)}",
        file=sys.stderr,
        flush=True,
    )


def websocket_path_of(adapter: dict[str, typing.Any]) -> str | None:
    websocket = resolve_value(adapter.get("websocket", True))

    if websocket is False:
        return None

    if isinstance(websocket, dict):
        return resolve_value(websocket.get("path", DEFAULT_WEBSOCKET_PATH))

    return DEFAULT_WEBSOCKET_PATH


def wanted_interface(
    path: pathlib.Path,
    document: dict[str, typing.Any],
    webui: str,
    changes: list[str],
) -> Interface:
    remove_unused_interfaces(document, webui, changes)
    adapter = section(document, "adapter")

    if adapter is None:
        raise locate.RunError(f"{path} has no controller.adapter")

    adapter_port = port_of(adapter.get("port", DEFAULT_ADAPTER_PORT))

    if adapter_port is None:
        raise locate.RunError(f"{path} has no numeric controller.adapter.port")

    ports = {"adapter": adapter_port}
    base_path = (resolve_value(adapter.get("base_path")) or "").rstrip("/")

    if webui == locate.WEBUI_GRADIO:
        ports[locate.WEBUI_GRADIO] = add_gradio(
            document, adapter_port, changes
        )
    elif webui == locate.WEBUI_COMPONENT:
        component = next(
            (
                item
                for item in components_of(document)
                if item.get("id") == WEBUI_COMPONENT_ID
            ),
            None,
        )
        component_port = port_of(component.get("port")) if component else None

        if component_port is None:
            raise locate.RunError(
                "--webui component needs an id: webui component"
                f" with a port in {path}"
            )

        ports[locate.WEBUI_COMPONENT] = component_port

    return Interface(ports, base_path, websocket_path_of(adapter))


def busy_ports(ports: dict[str, int]) -> list[str]:
    return [
        f"{label} port {port}"
        for label, port in ports.items()
        if locate.port_in_use(port)
    ]


def move_busy_ports(
    document: dict[str, typing.Any],
    interface: Interface,
    webui: str,
    changes: list[str],
) -> Interface:
    busy = busy_ports(interface.ports)

    if not busy:
        return interface

    if webui == locate.WEBUI_COMPONENT:
        raise locate.RunError(
            f"already in use on this machine: {', '.join(busy)};"
            " --webui component cannot move ports, because the built page"
            " calls the adapter port it was built with",
            locate.EXIT_BUSY,
        )

    taken = set(interface.ports.values()) | {
        port
        for port in (
            port_of(component.get("port"))
            for component in components_of(document)
        )
        if port
    }
    ports = dict(interface.ports)

    for label, port in interface.ports.items():
        if not locate.port_in_use(port):
            continue

        moved = free_port_after(port, taken)
        taken.add(moved)
        ports[label] = moved
        name = "adapter" if label == "adapter" else "webui"
        controller_section = section(document, name)

        if controller_section is None:
            raise locate.RunError(
                f"cannot move the {label} port without controller.{name}"
            )

        controller_section["port"] = moved
        changes.append(
            f"moved the {label} port from {port}, in use, to {moved}"
        )

    return interface._replace(ports=ports)


def up(payload: dict[str, typing.Any]) -> int:
    workspace = locate.workspace_path(payload)
    service_directory = locate.service_directory(workspace, payload)
    webui = payload.get("webui", locate.WEBUI_NONE)
    timeout = payload.get("timeout", locate.UP_TIMEOUT_SECONDS)

    if webui == locate.WEBUI_COMPONENT:
        missing = set_up_environment.missing_programs(
            workspace, set_up_environment.WEBUI_COMPONENT_PROGRAMS
        )

        if missing:
            raise locate.RunError(
                f"{', '.join(missing)} not on PATH on this machine;"
                " --webui component cannot start without them",
                locate.EXIT_SET_UP_FAILED,
            )

    path = service_directory / locate.COMPOSE_FILE
    original_path = locate.original_compose_path(workspace, payload)
    document = original_document(path, original_path)
    changes: list[str] = []
    interface = wanted_interface(path, document, webui, changes)
    log_path = (
        locate.machine_logs_directory(workspace, payload) / SERVER_LOG_FILE
    )
    record = read_record(workspace, payload)
    running_ports = record.get("ports") if record else None

    if running_ports and serves_this_session(
        workspace, payload, running_ports
    ):
        if set(running_ports) != set(interface.ports):
            raise locate.RunError(
                "this session's server is already running with other"
                " interfaces; run down, then up",
                locate.EXIT_BUSY,
            )

        print("reusing the server already running in this session", flush=True)
        print(
            ready_line(running_ports, interface.base_path, log_path),
            flush=True,
        )

        return locate.EXIT_SUCCESS

    if busy_ports(interface.ports) and held_by_this_session(
        workspace, interface.ports
    ):
        raise locate.RunError(
            "this session's server is already running with other interfaces;"
            " run down, then up",
            locate.EXIT_BUSY,
        )

    interface = move_busy_ports(document, interface, webui, changes)
    save_changes(path, original_path, document, changes)
    ports = interface.ports

    bin_directory = locate.virtual_environment_bin(workspace)
    launcher = shutil.which(LAUNCHER, path=str(bin_directory))

    if launcher is None:
        raise locate.RunError(
            f"{LAUNCHER} does not exist in {bin_directory}; run open again"
        )

    record_path = locate.server_record_path(workspace, payload)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    record_path.parent.mkdir(parents=True, exist_ok=True)

    with log_path.open("wb") as log:
        process = locate.popen_detached(
            [launcher, "-f", locate.COMPOSE_FILE, "up"],
            cwd=service_directory,
            env=locate.virtual_environment_variables(workspace),
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
        )

    record = {
        "pid": process.pid,
        "ports": ports,
        "base_path": interface.base_path,
        "websocket_path": interface.websocket_path,
    }
    record_path.write_text(json.dumps(record), encoding="utf-8")
    print(
        f"launched {LAUNCHER} up (pid {process.pid}), log: {log_path}",
        flush=True,
    )
    deadline = time.monotonic() + timeout

    while True:
        if all(locate.port_in_use(port) for port in ports.values()):
            print(ready_line(ports, interface.base_path, log_path), flush=True)

            return locate.EXIT_SUCCESS

        if process.poll() is not None:
            kill_server(workspace, payload)
            raise locate.RunError(
                f"{LAUNCHER} exited with code {process.returncode}"
                " before listening;"
                f" last {locate.LOG_TAIL_LINES} lines of {log_path}:"
                f"\n{diagnose.annotated(locate.log_tail(log_path))}",
                locate.EXIT_UNREACHABLE,
            )

        if time.monotonic() >= deadline:
            kill_server(workspace, payload)
            raise locate.RunError(
                f"not listening after {timeout} seconds;"
                f" last {locate.LOG_TAIL_LINES} lines of {log_path}:"
                f"\n{diagnose.annotated(locate.log_tail(log_path))}",
                locate.EXIT_TIMEOUT,
            )

        time.sleep(locate.POLL_SECONDS)


def listens_on(connection: typing.Any, ports: set[int]) -> bool:
    import psutil

    return (
        connection.status == psutil.CONN_LISTEN
        and bool(connection.laddr)
        and connection.laddr.port in ports
    )


def listening_pids(ports: set[int]) -> set[int]:
    import psutil

    try:
        connections = psutil.net_connections(kind="tcp")
    except psutil.AccessDenied:
        return listening_pids_per_process(ports)

    return {
        connection.pid
        for connection in connections
        if connection.pid and listens_on(connection, ports)
    }


def listening_pids_per_process(ports: set[int]) -> set[int]:
    import psutil

    pids: set[int] = set()

    for process in psutil.process_iter():
        try:
            connections = process.net_connections(kind="tcp")
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

        if any(listens_on(connection, ports) for connection in connections):
            pids.add(process.pid)

    return pids


def runs_in_workspace(process: typing.Any, workspace: pathlib.Path) -> bool:
    import psutil

    try:
        directory = pathlib.Path(process.cwd()).resolve()
    except (psutil.NoSuchProcess, psutil.AccessDenied, OSError):
        return False

    return directory == workspace or workspace in directory.parents


def add_with_children(
    process: typing.Any, tree: dict[int, typing.Any]
) -> None:
    import psutil

    try:
        for member in [process, *process.children(recursive=True)]:
            tree.setdefault(member.pid, member)
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return


def process_tree(
    pid: int, ports: typing.Iterable[int], workspace: pathlib.Path
) -> list[typing.Any]:
    import psutil

    tree: dict[int, typing.Any] = {}

    try:
        add_with_children(psutil.Process(pid), tree)
    except psutil.NoSuchProcess:
        pass

    for listener_pid in listening_pids(set(ports)) - set(tree):
        try:
            listener = psutil.Process(listener_pid)
        except psutil.NoSuchProcess:
            continue

        if runs_in_workspace(listener, workspace):
            add_with_children(listener, tree)

    return list(tree.values())


def ready_line(
    ports: dict[str, int], base_path: str | None, log_path: pathlib.Path
) -> str:
    return json.dumps(
        {"ports": ports, "base_path": base_path, "log": str(log_path)}
    )


def read_record(
    workspace: pathlib.Path, payload: dict[str, typing.Any]
) -> dict[str, typing.Any] | None:
    try:
        return json.loads(
            locate.server_record_path(workspace, payload).read_text(
                encoding="utf-8"
            )
        )
    except (OSError, ValueError):
        return None


def held_by_this_session(
    workspace: pathlib.Path, ports: dict[str, int]
) -> bool:
    import psutil

    listener_pids = listening_pids(set(ports.values()))

    if not listener_pids:
        return False

    for pid in listener_pids:
        try:
            listener = psutil.Process(pid)
        except psutil.NoSuchProcess:
            return False

        if not runs_in_workspace(listener, workspace):
            return False

    return True


def serves_this_session(
    workspace: pathlib.Path,
    payload: dict[str, typing.Any],
    ports: dict[str, int],
) -> bool:
    record = read_record(workspace, payload)

    if record is None or record.get("ports") != ports:
        return False

    if not all(locate.port_in_use(port) for port in ports.values()):
        return False

    owned = {
        process.pid
        for process in process_tree(record["pid"], ports.values(), workspace)
    }
    listener_pids = listening_pids(set(ports.values()))

    return bool(listener_pids) and listener_pids <= owned


def kill_processes(processes: list[typing.Any]) -> None:
    import psutil

    for process in processes:
        try:
            process.terminate()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    _, alive = psutil.wait_procs(processes, timeout=KILL_TIMEOUT_SECONDS)

    for process in alive:
        try:
            process.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    psutil.wait_procs(alive, timeout=KILL_TIMEOUT_SECONDS)


def kill_server(
    workspace: pathlib.Path, payload: dict[str, typing.Any]
) -> str:
    record_path = locate.server_record_path(workspace, payload)

    try:
        record = json.loads(record_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return "no server was running"

    processes = process_tree(
        record["pid"], record["ports"].values(), workspace
    )
    kill_processes(processes)
    record_path.unlink(missing_ok=True)

    return f"killed {len(processes)} server processes"


def down(payload: dict[str, typing.Any]) -> int:
    print(kill_server(locate.workspace_path(payload), payload), flush=True)

    return locate.EXIT_SUCCESS
