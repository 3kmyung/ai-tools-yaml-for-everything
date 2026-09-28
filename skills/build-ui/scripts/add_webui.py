import argparse
import io
import pathlib
import re
import sys
import typing

import ports
import yaml

COMPOSE_FILE = "model-compose.yml"
FIRST_CANDIDATE_PORT = 8090
LAST_CANDIDATE_PORT = 65535
CONTROLLER_SECTION = "controller"
ADAPTER_SECTION = "adapter"
WEBUI_SECTION = "webui"
CONTROLLER_WEBUI_REMOVED_MESSAGE = (
    "removed controller.webui: the webui component replaces the default"
    " interface"
)
ANY_ORIGIN = "*"
PORT_PLACEHOLDER = "<port>"
EXCLUDED_PREFIX = "excluded ports:"
EXCLUDED_SEPARATOR = "; "
INSTALL_COMMAND = (
    "    install: [ node, -e, \"require('node:child_process').execSync("
    "'pnpm install --frozen-lockfile', { stdio: 'inherit' })\" ]"
)
START_COMMAND = (
    "    start: [ node, node_modules/vite/bin/vite.js, preview, --port,"
    ' "${env.WEBUI_PORT | <port>}", --strictPort, --host ]'
)
WEBUI_BLOCK = (
    "- id: webui",
    "  type: http-server",
    "  port: ${env.WEBUI_PORT | <port>}",
    "  manage:",
    "    working_dir: web",
    INSTALL_COMMAND,
    "    build: [ node, node_modules/vite/bin/vite.js, build ]",
    START_COMMAND,
)
DEFAULT_MARKER = "default: true"
DEFAULT_MARKED_MESSAGE = (
    f"marked the only other component {DEFAULT_MARKER}:"
    " jobs name no component and would stop resolving"
)
COMPONENT_JOB_TYPE = "component"
TOP_LEVEL_KEY_PATTERN = re.compile(r"^([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$")
LIST_ITEM_PATTERN = re.compile(r"^(\s*)-(\s+|$)")
DEFAULT_ITEM_INDENT = "  "
EXIT_SUCCESS = 0
EXIT_USAGE = 2


class AddWebuiError(Exception):
    pass


def parse_arguments(arguments: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog=pathlib.Path(__file__).name)
    parser.add_argument("release_directory", type=pathlib.Path)

    return parser.parse_args(arguments)


def read_compose(path: pathlib.Path) -> tuple[str, dict[str, typing.Any]]:
    try:
        text = path.read_bytes().decode("utf-8")
        document = yaml.safe_load(text)
    except (OSError, UnicodeDecodeError, yaml.YAMLError) as error:
        raise AddWebuiError(f"cannot read {path}: {error}") from error

    if not isinstance(document, dict):
        raise AddWebuiError(f"{path} is not a YAML mapping")

    return text, document


def webui_lines(port: int, indent: str) -> list[str]:
    return [
        indent + line.replace(PORT_PLACEHOLDER, str(port))
        for line in WEBUI_BLOCK
    ]


def top_level_key(line: str) -> str | None:
    match = TOP_LEVEL_KEY_PATTERN.match(line)

    return match.group(1) if match is not None else None


def block_range(lines: list[str], key: str) -> tuple[int, int]:
    start = next(
        (
            index
            for index, line in enumerate(lines)
            if top_level_key(line) == key
        ),
        None,
    )

    if start is None:
        raise AddWebuiError(f"no top-level '{key}:' line")

    end = start + 1

    while end < len(lines) and top_level_key(lines[end]) is None:
        end += 1

    while end > start + 1 and (
        not lines[end - 1].strip() or lines[end - 1].startswith("#")
    ):
        end -= 1

    value = TOP_LEVEL_KEY_PATTERN.match(lines[start])

    if (
        value is not None
        and value.group(2)
        and not value.group(2).startswith("#")
    ):
        raise AddWebuiError(
            f"'{key}:' has an inline value; add the webui component by hand"
        )

    return start, end


def indentation(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def first_item(lines: list[str], start: int, end: int) -> int | None:
    return next(
        (
            index
            for index in range(start + 1, end)
            if LIST_ITEM_PATTERN.match(lines[index]) is not None
        ),
        None,
    )


def insert_into_components(lines: list[str], port: int) -> list[str]:
    start, end = block_range(lines, "components")
    item = first_item(lines, start, end)
    match = LIST_ITEM_PATTERN.match(lines[item]) if item is not None else None
    indent = match.group(1) if match is not None else DEFAULT_ITEM_INDENT
    separator = (
        [""] if any(not line.strip() for line in lines[start:end]) else []
    )

    return lines[:end] + separator + webui_lines(port, indent) + lines[end:]


def convert_single_component(lines: list[str], port: int) -> list[str]:
    start, end = block_range(lines, "component")
    content = [
        index
        for index in range(start + 1, end)
        if lines[index].strip() and not lines[index].startswith("#")
    ]

    if not content:
        raise AddWebuiError("'component:' has no body")

    base = min(indentation(lines[index]) for index in content)
    rewritten = [lines[start].replace("component", "components", 1)]
    first = True

    for line in lines[start + 1 : end]:
        if not line.strip() or indentation(line) < base:
            rewritten.append(line)
        elif first:
            rewritten.append(DEFAULT_ITEM_INDENT + "- " + line[base:])
            first = False
        else:
            rewritten.append(DEFAULT_ITEM_INDENT + "  " + line[base:])

    return (
        lines[:start]
        + rewritten
        + webui_lines(port, DEFAULT_ITEM_INDENT)
        + lines[end:]
    )


def append_components(lines: list[str], port: int) -> list[str]:
    while lines and not lines[-1].strip():
        lines = lines[:-1]

    return [*lines, "", "components:", *webui_lines(port, DEFAULT_ITEM_INDENT)]


def mark_only_component_default(lines: list[str]) -> list[str]:
    start, end = block_range(lines, "components")
    item = first_item(lines, start, end)

    if item is None:
        raise AddWebuiError(
            "cannot find the existing component to mark as default"
        )

    match = LIST_ITEM_PATTERN.match(lines[item])
    assert match is not None
    rest = lines[item][match.end() :]
    column = match.end() if rest.strip() else indentation(lines[item + 1])
    target = item if rest.strip() else item + 1

    return (
        lines[: target + 1]
        + [" " * column + DEFAULT_MARKER]
        + lines[target + 1 :]
    )


def jobs_use_default_component(document: dict[str, typing.Any]) -> bool:
    workflows = document.get("workflows")
    workflows = (
        workflows
        if isinstance(workflows, list)
        else [document.get("workflow")]
    )

    for workflow in workflows:
        if not isinstance(workflow, dict):
            continue

        jobs = workflow.get("jobs")
        jobs = jobs if isinstance(jobs, list) else [workflow.get("job")]

        for job in jobs:
            if (
                isinstance(job, dict)
                and job.get("type", COMPONENT_JOB_TYPE) == COMPONENT_JOB_TYPE
                and job.get("component") in (None, "__default__")
            ):
                return True

    return False


def needs_default_marker(document: dict[str, typing.Any]) -> bool:
    components = ports.components_of(document)

    return (
        len(components) == 1
        and components[0].get("default") is not True
        and jobs_use_default_component(document)
    )


def has_controller_webui(document: dict[str, typing.Any]) -> bool:
    controller = document.get(CONTROLLER_SECTION)

    return (
        isinstance(controller, dict)
        and controller.get(WEBUI_SECTION) is not None
    )


def remove_controller_webui(lines: list[str]) -> list[str]:
    start, end = block_range(lines, CONTROLLER_SECTION)
    children = [
        index for index in range(start + 1, end) if lines[index].strip()
    ]

    if not children:
        raise AddWebuiError("'controller:' has no body")

    child_indent = min(indentation(lines[index]) for index in children)
    webui_start = next(
        (
            index
            for index in children
            if indentation(lines[index]) == child_indent
            and lines[index].strip().startswith(f"{WEBUI_SECTION}:")
        ),
        None,
    )

    if webui_start is None:
        raise AddWebuiError("cannot find controller.webui to remove")

    webui_end = webui_start + 1

    while webui_end < end and (
        not lines[webui_end].strip()
        or indentation(lines[webui_end]) > child_indent
    ):
        webui_end += 1

    while webui_end > webui_start + 1 and not lines[webui_end - 1].strip():
        webui_end -= 1

    return lines[:webui_start] + lines[webui_end:]


def split_lines(text: str) -> tuple[list[str], str]:
    newline = "\r\n" if "\r\n" in text else "\n"
    lines = text.split(newline)

    if len(lines) > 1 and lines[-1] == "":
        lines = lines[:-1]

    return lines, newline


def insert_webui(text: str, document: dict[str, typing.Any], port: int) -> str:
    lines, newline = split_lines(text)

    if has_controller_webui(document):
        lines = remove_controller_webui(lines)

    if "components" in document:
        lines = insert_into_components(lines, port)
    elif "component" in document:
        lines = convert_single_component(lines, port)
    else:
        lines = append_components(lines, port)

    if needs_default_marker(document):
        lines = mark_only_component_default(lines)

    return newline.join(lines) + newline


def excluded_ports(document: dict[str, typing.Any]) -> dict[int, str]:
    reasons: dict[int, str] = {}
    adapter_port = ports.controller_port(document, ADAPTER_SECTION)
    webui_port = ports.controller_port(document, WEBUI_SECTION)

    if adapter_port is not None:
        reasons[adapter_port] = "controller.adapter.port"

    if webui_port is not None:
        reasons.setdefault(webui_port, "controller.webui.port")

    for path, number in ports.declared_ports(document):
        reasons.setdefault(number, f"{path} in {COMPOSE_FILE}")

    return reasons


def choose_port(
    reasons: dict[int, str], owners: dict[int, set[int]]
) -> tuple[int, dict[int, str]]:
    listening: dict[int, str] = {}

    for port in range(FIRST_CANDIDATE_PORT, LAST_CANDIDATE_PORT + 1):
        if port in reasons:
            continue

        if port not in owners:
            return port, listening

        listening[port] = f"listening ({ports.describe_owners(owners[port])})"

    raise AddWebuiError(f"no free port from {FIRST_CANDIDATE_PORT} upward")


def excluded_line(reasons: dict[int, str]) -> str:
    if not reasons:
        return f"{EXCLUDED_PREFIX} none"

    entries = [f"{port} {reason}" for port, reason in sorted(reasons.items())]

    return f"{EXCLUDED_PREFIX} {EXCLUDED_SEPARATOR.join(entries)}"


def warnings(document: dict[str, typing.Any]) -> list[str]:
    messages: list[str] = []
    controller = document.get(CONTROLLER_SECTION)
    controller = controller if isinstance(controller, dict) else {}
    adapter = controller.get(ADAPTER_SECTION)
    adapter = adapter if isinstance(adapter, dict) else {}

    if adapter.get("origins", ANY_ORIGIN) != ANY_ORIGIN:
        messages.append('warning: controller.adapter.origins is not "*"')

    return messages


def check_written(path: pathlib.Path, updated: str, port: int | None) -> None:
    reparsed = yaml.safe_load(updated)

    if not isinstance(reparsed, dict) or has_controller_webui(reparsed):
        raise AddWebuiError(f"removing controller.webui would break {path}")

    added = ports.webui_component(reparsed)

    if added is None or ports.port_number(added.get(ports.PORT_KEY)) != port:
        raise AddWebuiError(
            f"inserting the webui component would break {path}"
        )


def add_webui(release_directory: pathlib.Path) -> list[str]:
    path = release_directory / COMPOSE_FILE
    text, document = read_compose(path)
    existing = ports.webui_component(document)
    removed = (
        [CONTROLLER_WEBUI_REMOVED_MESSAGE]
        if has_controller_webui(document)
        else []
    )

    if existing is not None:
        declared = existing.get(ports.PORT_KEY)
        port = ports.port_number(declared)

        if removed:
            lines, newline = split_lines(text)
            updated = newline.join(remove_controller_webui(lines)) + newline
            check_written(path, updated, port)
            path.write_bytes(updated.encode("utf-8"))

        return [
            f"port {port if port is not None else declared}",
            f"kept the existing webui component in {path}",
            *removed,
            *warnings(document),
        ]

    reasons = excluded_ports(document)
    port, listening = choose_port(reasons, ports.listening_owners())
    updated = insert_webui(text, document, port)
    check_written(path, updated, port)
    path.write_bytes(updated.encode("utf-8"))
    marked = [DEFAULT_MARKED_MESSAGE] if needs_default_marker(document) else []

    return [
        f"port {port}",
        excluded_line({**reasons, **listening}),
        f"added the webui component to {path}",
        *removed,
        *marked,
        *warnings(document),
    ]


def main() -> int:
    for output_file in (sys.stdout, sys.stderr):
        if isinstance(output_file, io.TextIOWrapper):
            output_file.reconfigure(encoding="utf-8")

    program_name = pathlib.Path(__file__).name
    options = parse_arguments(sys.argv[1:])

    try:
        report = add_webui(options.release_directory.resolve())
    except (AddWebuiError, ports.PsutilMissingError) as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)
        return EXIT_USAGE

    for line in report:
        print(line)

    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.exit(main())
