import re
import types
import typing

PORT_DEFAULT_PATTERN = re.compile(r"^\$\{[^|}]*\|\s*(\d+)\s*\}$")
PORT_LITERAL_PATTERN = re.compile(r"^\d+$")
PORT_KEY = "port"
WEBUI_COMPONENT_ID = "webui"
LISTEN_STATUS = "LISTEN"
PSUTIL_MISSING_MESSAGE = (
    "psutil is not installed; run `python -m pip install psutil` and try again"
)


class PsutilMissingError(Exception):
    pass


def load_psutil() -> types.ModuleType:
    try:
        import psutil
    except ImportError as error:
        raise PsutilMissingError(PSUTIL_MISSING_MESSAGE) from error

    return psutil


def port_number(value: typing.Any) -> int | None:
    if isinstance(value, bool):
        return None

    if isinstance(value, int):
        return value

    if not isinstance(value, str):
        return None

    text = value.strip()
    match = PORT_DEFAULT_PATTERN.match(text)

    if match is not None:
        return int(match.group(1))

    if PORT_LITERAL_PATTERN.match(text):
        return int(text)

    return None


def listening_owners() -> dict[int, set[int]]:
    psutil = load_psutil()

    try:
        connections = psutil.net_connections(kind="tcp")
    except psutil.AccessDenied:
        return listening_owners_per_process()

    owners: dict[int, set[int]] = {}

    for connection in connections:
        if connection.status != LISTEN_STATUS or not connection.laddr:
            continue

        pids = owners.setdefault(connection.laddr.port, set())

        if connection.pid:
            pids.add(connection.pid)

    return owners


def listening_owners_per_process() -> dict[int, set[int]]:
    psutil = load_psutil()
    owners: dict[int, set[int]] = {}

    for process in psutil.process_iter():
        try:
            connections = process.net_connections(kind="tcp")
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

        for connection in connections:
            if connection.status == LISTEN_STATUS and connection.laddr:
                owners.setdefault(connection.laddr.port, set()).add(
                    process.pid
                )

    return owners


def describe_owners(pids: set[int]) -> str:
    psutil = load_psutil()
    descriptions: list[str] = []

    for pid in sorted(pids):
        try:
            descriptions.append(f"{psutil.Process(pid).name()} pid {pid}")
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            descriptions.append(f"pid {pid}")

    return ", ".join(descriptions) or "unknown process"


def components_of(
    document: dict[str, typing.Any],
) -> list[dict[str, typing.Any]]:
    if "components" in document:
        values = document["components"] or []
    elif "component" in document:
        values = [document["component"]]
    else:
        values = []

    return [value for value in values if isinstance(value, dict)]


def webui_component(
    document: dict[str, typing.Any],
) -> dict[str, typing.Any] | None:
    return next(
        (
            component
            for component in components_of(document)
            if component.get("id") == WEBUI_COMPONENT_ID
        ),
        None,
    )


def controller_port(
    document: dict[str, typing.Any], section: str
) -> int | None:
    controller = document.get("controller")
    settings = (
        controller.get(section) if isinstance(controller, dict) else None
    )

    if not isinstance(settings, dict):
        return None

    return port_number(settings.get(PORT_KEY))


def declared_ports(
    value: typing.Any, path: str = ""
) -> typing.Iterator[tuple[str, int]]:
    if isinstance(value, dict):
        for key, item in value.items():
            item_path = f"{path}.{key}" if path else str(key)
            number = port_number(item) if key == PORT_KEY else None

            if number is not None:
                yield item_path, number
            else:
                yield from declared_ports(item, item_path)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from declared_ports(item, f"{path}[{index}]")
