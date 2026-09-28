import argparse
import dataclasses
import io
import json
import pathlib
import re
import sys
import typing

import shell_files
import yaml

COMPOSE_FILE = "model-compose.yml"
CAPTURED_OUTPUT_GLOB = "captured-output*.json"
DEFAULT_WORKFLOW_ID = "__default__"
DEFAULT_COMPONENT_REFERENCE = "__default__"
DEFAULT_ACTION_REFERENCE = "__default__"
UNNAMED_COMPONENT_ID = "__component__"
UNNAMED_ACTION_ID = "__action__"
UNNAMED_JOB_ID = "__job__"
COMPONENT_JOB_TYPE = "component"
WORKFLOW_COMPONENT_TYPE = "workflow"
PASSTHROUGH_INPUT = "${input}"
INPUT_KEY = "input"
VARIABLE_PATTERN = re.compile(
    r"""\$\{
        (?:\s*([a-zA-Z_][^.\[\s]*(?:\[\])?))(?:\[(-?[0-9]+)\])?
        (?:\.([^\s|}]+))?
        (?:\s*as\s*([^\s/;\[}]+)(\[\])?
            (?:/([^\s;\[}]+)(?:\[((?:\$\{[^}]*\}|[^\]])*)\])?)?
            (?:;([^\s}]+))?)?
        (?:\s*\|\s*((?:\$\{[^}]+\}|\\[$@{}]|(?!\s*(?:@\(|\$\{)).)+))?
        (?:\s*(@\(\s*[\w]+\s+(?:\\[$@{}]|(?!\s*\$\{).)+\)))?
    \s*\}""",
    re.VERBOSE,
)
STREAM_PATTERN = re.compile(r"\bas\s+stream\b")
LIST_INDEX_PATTERN = re.compile(r"\[[^\]]*\]")
FILE_TYPES = ("audio", "image", "video", "file")
TEXT_TYPES = ("text", "markdown", "string")
PROMPT_FORMATS = ("url", "path")
SELECT_TYPE = "select"
FORMAT_PREFIX = "format="
CONTRACT_FILES = "files"
CONTRACT_PROMPT = "prompt"
CONTRACT_OPTIONS = "options"
CONTRACT_UNSUPPORTED = "UNSUPPORTED"
EXAMPLE_LIMIT = 60
EXAMPLE_COUNT = 3
EXAMPLE_SEPARATOR = " | "
SINGLE_ACTION_LABEL = "(single action)"
COMPONENT_FACT_KEYS = ("task", "family", "driver", "model")
EXIT_SUCCESS = 0
EXIT_USAGE = 2
EXIT_UNSUPPORTED = 3


class FactsError(Exception):
    pass


@dataclasses.dataclass
class InputVariable:
    name: str
    type: str | None
    is_list: bool
    subtype: str | None
    attributes: str | None
    format: str | None
    default: str | None
    parameter_paths: list[str]
    component_id: str | None
    action_id: str | None

    def annotation(self) -> str:
        if self.type is None:
            return ""

        text = self.type + ("[]" if self.is_list else "")

        if self.subtype is not None:
            text += f"/{self.subtype}"

        if self.attributes is not None:
            text += f"[{self.attributes}]"

        if self.format is not None:
            text += f";{self.format}"

        return text

    def format_name(self) -> str | None:
        if self.format is None:
            return None

        return self.format.removeprefix(FORMAT_PREFIX)


@dataclasses.dataclass
class InputFact:
    workflow_id: str
    variable: InputVariable
    contract: str
    reason: str
    choices: list[str]


@dataclasses.dataclass
class OutputPath:
    types: list[str]
    lengths: list[int]
    examples: list[str]


def parse_arguments(arguments: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog=pathlib.Path(__file__).name)
    parser.add_argument("release_directory", type=pathlib.Path)
    parser.add_argument(
        "--workflow",
        dest="workflow_ids",
        action="append",
        default=[],
        metavar="WORKFLOW_ID",
    )

    return parser.parse_args(arguments)


def as_list(
    document: dict[str, typing.Any], plural: str, singular: str
) -> list:
    if plural in document:
        values = document[plural]
    elif singular in document:
        values = [document[singular]]
    else:
        values = []

    return [value for value in values or [] if isinstance(value, dict)]


def load_compose(path: pathlib.Path) -> dict[str, typing.Any]:
    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, yaml.YAMLError) as error:
        raise FactsError(f"cannot read {path}: {error}") from error

    if not isinstance(document, dict):
        raise FactsError(f"{path} is not a YAML mapping")

    return document


def workflow_id_of(workflow: dict[str, typing.Any]) -> str:
    return str(workflow.get("id", DEFAULT_WORKFLOW_ID))


def component_id_of(component: dict[str, typing.Any]) -> str:
    return str(component.get("id", UNNAMED_COMPONENT_ID))


def action_id_of(action: dict[str, typing.Any]) -> str:
    return str(action.get("id", UNNAMED_ACTION_ID))


def jobs_of(workflow: dict[str, typing.Any]) -> list[dict[str, typing.Any]]:
    return as_list(workflow, "jobs", "job")


def actions_of(
    component: dict[str, typing.Any],
) -> list[dict[str, typing.Any]]:
    return as_list(component, "actions", "action")


def pick_default(
    items: list[dict[str, typing.Any]],
) -> dict[str, typing.Any] | None:
    if len(items) == 1:
        return items[0]

    return next((item for item in items if item.get("default") is True), None)


def resolve_component(
    reference: typing.Any, components: list[dict[str, typing.Any]]
) -> dict[str, typing.Any] | None:
    if isinstance(reference, dict):
        return reference

    if reference is None or reference == DEFAULT_COMPONENT_REFERENCE:
        return pick_default(components)

    return next(
        (
            item
            for item in components
            if component_id_of(item) == str(reference)
        ),
        None,
    )


def resolve_action(
    reference: typing.Any, component: dict[str, typing.Any]
) -> dict[str, typing.Any] | None:
    actions = actions_of(component)

    if reference is None or reference == DEFAULT_ACTION_REFERENCE:
        return pick_default(actions)

    return next(
        (item for item in actions if action_id_of(item) == str(reference)),
        None,
    )


def walk_strings(
    value: typing.Any, path: str = ""
) -> typing.Iterator[tuple[str, str]]:
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, dict):
        for key, item in value.items():
            yield from walk_strings(
                item, f"{path}.{key}" if path else str(key)
            )
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from walk_strings(item, f"{path}[{index}]")


def parameter_path(path: str) -> str:
    return LIST_INDEX_PATTERN.sub("", path)


def enumerate_variables(
    value: typing.Any,
    component_id: str | None,
    action_id: str | None,
    skip_keys: tuple[str, ...] = (),
) -> list[InputVariable]:
    variables: list[InputVariable] = []

    if isinstance(value, dict):
        value = {
            key: item for key, item in value.items() if key not in skip_keys
        }

    for path, text in walk_strings(value):
        for match in VARIABLE_PATTERN.finditer(text):
            (
                key,
                _,
                name,
                type_name,
                is_list,
                subtype,
                attributes,
                format_text,
            ) = match.group(1, 2, 3, 4, 5, 6, 7, 8)
            default = match.group(9)

            if key != INPUT_KEY or not name:
                continue

            variables.append(
                InputVariable(
                    name=name,
                    type=type_name,
                    is_list=bool(is_list),
                    subtype=subtype,
                    attributes=attributes,
                    format=format_text,
                    default=default.strip() if default is not None else None,
                    parameter_paths=[parameter_path(path)],
                    component_id=component_id,
                    action_id=action_id,
                )
            )

    return variables


def action_parameter(
    action: dict[str, typing.Any] | None, variable_path: str
) -> InputVariable | None:
    if action is None or not variable_path.startswith(f"{INPUT_KEY}."):
        return None

    job_key = variable_path.removeprefix(f"{INPUT_KEY}.").split(".")[0]

    for parameter in enumerate_variables(action, None, None):
        if parameter.name == job_key:
            return parameter

    return None


def adopt_parameter_annotation(
    variable: InputVariable, parameter: InputVariable
) -> None:
    if variable.type is None:
        variable.type = parameter.type
        variable.is_list = parameter.is_list
        variable.subtype = parameter.subtype
        variable.attributes = parameter.attributes
        variable.format = parameter.format

    if variable.default is None:
        variable.default = parameter.default


def workflow_variables(
    workflow: dict[str, typing.Any],
    workflows: list[dict[str, typing.Any]],
    components: list[dict[str, typing.Any]],
    visited: set[str],
) -> list[InputVariable]:
    variables: list[InputVariable] = []
    visited = visited | {workflow_id_of(workflow)}

    for job in jobs_of(workflow):
        job_type = job.get("type", COMPONENT_JOB_TYPE)
        component = (
            resolve_component(job.get("component"), components)
            if job_type == COMPONENT_JOB_TYPE
            else None
        )
        action = (
            resolve_action(job.get("action"), component)
            if component is not None
            else None
        )
        component_id = (
            component_id_of(component) if component is not None else None
        )
        action_id = action_id_of(action) if action is not None else None
        job_input = job.get("input")

        if job_type == COMPONENT_JOB_TYPE and job_input in (
            None,
            PASSTHROUGH_INPUT,
        ):
            if component is None or action is None:
                continue

            variables.extend(
                component_variables(
                    component, action, workflows, components, visited
                )
            )
            continue

        for variable in enumerate_variables(
            job, component_id, action_id, ("component",)
        ):
            parameter = action_parameter(action, variable.parameter_paths[0])

            if parameter is not None:
                variable.parameter_paths = (
                    parameter.parameter_paths or variable.parameter_paths
                )
                adopt_parameter_annotation(variable, parameter)

            variables.append(variable)

    variables.extend(enumerate_variables(workflow.get("output"), None, None))

    return variables


def target_workflow(
    component: dict[str, typing.Any],
    action: dict[str, typing.Any],
    workflows: list[dict[str, typing.Any]],
) -> dict[str, typing.Any] | None:
    if component.get("type") != WORKFLOW_COMPONENT_TYPE:
        return None

    target_id = str(action.get("workflow", DEFAULT_WORKFLOW_ID))

    if target_id == DEFAULT_WORKFLOW_ID:
        return pick_default(workflows)

    return next(
        (item for item in workflows if workflow_id_of(item) == target_id),
        None,
    )


def component_variables(
    component: dict[str, typing.Any],
    action: dict[str, typing.Any],
    workflows: list[dict[str, typing.Any]],
    components: list[dict[str, typing.Any]],
    visited: set[str],
) -> list[InputVariable]:
    if action.get("input") in (None, PASSTHROUGH_INPUT):
        target = target_workflow(component, action, workflows)

        if target is not None and workflow_id_of(target) not in visited:
            return workflow_variables(target, workflows, components, visited)

    return enumerate_variables(
        action, component_id_of(component), action_id_of(action)
    )


def reachable_actions(
    workflow: dict[str, typing.Any],
    workflows: list[dict[str, typing.Any]],
    components: list[dict[str, typing.Any]],
    visited: set[str],
) -> set[tuple[str, str]]:
    reached: set[tuple[str, str]] = set()
    visited.add(workflow_id_of(workflow))

    for job in jobs_of(workflow):
        if job.get("type", COMPONENT_JOB_TYPE) != COMPONENT_JOB_TYPE:
            continue

        component = resolve_component(job.get("component"), components)
        action = (
            resolve_action(job.get("action"), component)
            if component is not None
            else None
        )

        if component is None or action is None:
            continue

        reached.add((component_id_of(component), action_id_of(action)))
        target = target_workflow(component, action, workflows)

        if target is not None and workflow_id_of(target) not in visited:
            reached |= reachable_actions(
                target, workflows, components, visited
            )

    return reached


def unique_variables(variables: list[InputVariable]) -> list[InputVariable]:
    unique: dict[str, InputVariable] = {}

    for variable in variables:
        if variable.name in unique:
            known = unique[variable.name]
            known.parameter_paths += [
                path
                for path in variable.parameter_paths
                if path not in known.parameter_paths
            ]
        else:
            unique[variable.name] = variable

    return list(unique.values())


def literal_text(value: typing.Any) -> str | None:
    if isinstance(value, str):
        return None if "${" in value else value

    if isinstance(value, bool):
        return json.dumps(value)

    if isinstance(value, (int, float)):
        return str(value)

    return None


def values_at(value: typing.Any, path: str) -> list[typing.Any]:
    return [
        item
        for item_path, item in walk_values(value)
        if parameter_path(item_path) == path
    ]


def walk_values(
    value: typing.Any, path: str = ""
) -> typing.Iterator[tuple[str, typing.Any]]:
    if isinstance(value, dict):
        for key, item in value.items():
            yield from walk_values(item, f"{path}.{key}" if path else str(key))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from walk_values(item, f"{path}[{index}]")
    else:
        yield path, value


def choice_candidates(
    variable: InputVariable,
    components: list[dict[str, typing.Any]],
    reachable: set[tuple[str, str]] | None,
) -> list[str]:
    sources: dict[str, list[str]] = {}

    if variable.default is not None:
        sources.setdefault(variable.default, []).append("default")

    component = next(
        (
            item
            for item in components
            if variable.component_id is not None
            and component_id_of(item) == variable.component_id
        ),
        None,
    )
    other_actions = [
        action
        for action in (actions_of(component) if component is not None else [])
        if action_id_of(action) != variable.action_id
        and (
            reachable is None
            or (component_id_of(component), action_id_of(action)) in reachable
        )
    ]

    for action in other_actions:
        for path in variable.parameter_paths:
            for value in values_at(action, path):
                text = literal_text(value)
                source = f"{action_id_of(action)}.{path}"

                if text is not None and source not in sources.get(text, []):
                    sources.setdefault(text, []).append(source)

    if variable.type == SELECT_TYPE and variable.subtype:
        for member in variable.subtype.split(","):
            sources.setdefault(member, []).append("select")

    return [
        f"{value} ({', '.join(origin)})" for value, origin in sources.items()
    ]


def classify(variable: InputVariable) -> tuple[str, str]:
    if variable.is_list:
        return CONTRACT_UNSUPPORTED, "list input has no slot"

    if variable.format_name() in PROMPT_FORMATS:
        return CONTRACT_PROMPT, f";{variable.format_name()} is a text field"

    if variable.type in FILE_TYPES:
        return CONTRACT_FILES, f"as {variable.type}"

    if variable.default is not None:
        return CONTRACT_OPTIONS, "has a default"

    if variable.type is None or variable.type in TEXT_TYPES:
        return CONTRACT_PROMPT, f"as {variable.type or 'none'}"

    return (
        CONTRACT_UNSUPPORTED,
        f"as {variable.annotation()} without a default",
    )


def input_facts(
    workflow: dict[str, typing.Any],
    workflows: list[dict[str, typing.Any]],
    components: list[dict[str, typing.Any]],
    reachable: set[tuple[str, str]] | None,
) -> list[InputFact]:
    facts: list[InputFact] = []
    variables = unique_variables(
        workflow_variables(workflow, workflows, components, set())
    )

    for variable in variables:
        contract, reason = classify(variable)
        choices = (
            choice_candidates(variable, components, reachable)
            if contract == CONTRACT_OPTIONS
            else []
        )
        facts.append(
            InputFact(
                workflow_id_of(workflow), variable, contract, reason, choices
            )
        )

    return facts


def contains_stream(value: typing.Any) -> bool:
    return any(STREAM_PATTERN.search(text) for _, text in walk_strings(value))


def cell(value: typing.Any) -> str:
    text = "" if value is None else str(value)

    return " ".join(text.split()).replace("|", "\\|")


def table(headers: list[str], rows: list[list[typing.Any]]) -> list[str]:
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]

    if not rows:
        rows = [["(none)"] + [""] * (len(headers) - 1)]

    lines += [
        "| " + " | ".join(cell(value) for value in row) + " |" for row in rows
    ]

    return lines


def controller_section(document: dict[str, typing.Any]) -> list[str]:
    controller = document.get("controller") or {}
    adapter = controller.get("adapter") or {}
    webui = controller.get("webui")
    rows = [
        ["controller.adapter.port", adapter.get("port")],
        ["controller.adapter.base_path", adapter.get("base_path")],
        ["controller.adapter.origins", adapter.get("origins", "* (default)")],
        [
            "controller.webui",
            (
                "absent"
                if webui is None
                else json.dumps(webui, ensure_ascii=False)
            ),
        ],
    ]

    return ["## Controller", "", *table(["key", "value"], rows), ""]


def workflow_section(
    workflows: list[dict[str, typing.Any]],
    components: list[dict[str, typing.Any]],
    only_one: bool,
) -> list[str]:
    workflow_rows = []
    job_rows = []

    for workflow in workflows:
        jobs = jobs_of(workflow)
        stream = contains_stream(workflow.get("output")) or any(
            contains_stream(job.get("output")) for job in jobs
        )
        workflow_rows.append(
            [
                workflow_id_of(workflow),
                workflow.get("title") or workflow.get("name"),
                workflow.get("description"),
                "yes" if only_one or workflow.get("default") is True else "no",
                "yes" if workflow.get("private") is True else "no",
                ", ".join(str(job.get("id", UNNAMED_JOB_ID)) for job in jobs),
                "yes" if stream else "no",
            ]
        )

        for job in jobs:
            job_type = job.get("type", COMPONENT_JOB_TYPE)
            component = (
                resolve_component(job.get("component"), components)
                if job_type == COMPONENT_JOB_TYPE
                else None
            )
            action = (
                resolve_action(job.get("action"), component)
                if component is not None
                else None
            )
            job_rows.append(
                [
                    workflow_id_of(workflow),
                    job.get("id", UNNAMED_JOB_ID),
                    job_type,
                    (
                        component_id_of(component)
                        if component is not None
                        else ""
                    ),
                    action_id_of(action) if action is not None else "",
                    ", ".join(
                        str(item) for item in job.get("depends_on") or []
                    ),
                    "yes" if contains_stream(job.get("output")) else "no",
                ]
            )

    return [
        "## Workflows",
        "",
        *table(
            [
                "id",
                "title",
                "description",
                "default",
                "private",
                "jobs",
                "output as stream",
            ],
            workflow_rows,
        ),
        "",
        "## Jobs",
        "",
        *table(
            [
                "workflow",
                "job",
                "type",
                "component",
                "action",
                "depends_on",
                "output as stream",
            ],
            job_rows,
        ),
        "",
    ]


def input_section(facts: list[InputFact]) -> list[str]:
    rows = [
        [
            fact.workflow_id,
            fact.variable.name,
            fact.variable.annotation(),
            fact.variable.default,
            fact.contract,
            fact.reason,
            ", ".join(fact.variable.parameter_paths),
        ]
        for fact in facts
    ]
    choice_rows = [
        [fact.workflow_id, fact.variable.name, "; ".join(fact.choices)]
        for fact in facts
        if fact.contract == CONTRACT_OPTIONS
    ]

    return [
        "## Inputs",
        "",
        *table(
            [
                "workflow",
                "field",
                "as",
                "default",
                "contract",
                "why",
                "parameter",
            ],
            rows,
        ),
        "",
        "## Option choice candidates",
        "",
        *table(["workflow", "field", "candidates"], choice_rows),
        "",
    ]


def component_fact_text(value: typing.Any) -> str:
    if value is None:
        return ""

    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)

    return str(value)


def component_action_label(
    component: dict[str, typing.Any], action: dict[str, typing.Any] | None
) -> str:
    if action is None:
        return ""

    if "actions" not in component and "id" not in action:
        return SINGLE_ACTION_LABEL

    return action_id_of(action)


def component_section(components: list[dict[str, typing.Any]]) -> list[str]:
    rows = [
        [
            component_id_of(component),
            component.get("type"),
            *(
                component_fact_text(component.get(key))
                for key in COMPONENT_FACT_KEYS
            ),
            component_action_label(component, action),
            action.get("method", "") if action is not None else "",
        ]
        for component in components
        for action in actions_of(component) or [None]
    ]

    return [
        "## Components",
        "",
        *table(
            ["component", "type", *COMPONENT_FACT_KEYS, "action", "method"],
            rows,
        ),
        "",
    ]


def json_type(value: typing.Any) -> str:
    if value is None:
        return "null"

    if isinstance(value, bool):
        return "boolean"

    if isinstance(value, (int, float)):
        return "number"

    if isinstance(value, str):
        return "string"

    if isinstance(value, list):
        return "array"

    return "object"


def example_text(value: typing.Any) -> str | None:
    if isinstance(value, (dict, list)):
        return None

    text = json.dumps(value, ensure_ascii=False)

    if len(text) > EXAMPLE_LIMIT:
        return text[: EXAMPLE_LIMIT - 1] + "…"

    return text


def flatten_output(
    value: typing.Any, path: str, paths: dict[str, OutputPath]
) -> None:
    entry = paths.setdefault(path, OutputPath([], [], []))
    type_name = json_type(value)
    example = example_text(value)

    if type_name not in entry.types:
        entry.types.append(type_name)

    if (
        example is not None
        and example not in entry.examples
        and len(entry.examples) < EXAMPLE_COUNT
    ):
        entry.examples.append(example)

    if isinstance(value, dict):
        for key, item in value.items():
            flatten_output(item, f"{path}.{key}" if path else str(key), paths)
    elif isinstance(value, list):
        entry.lengths.append(len(value))

        for item in value:
            flatten_output(item, f"{path}[]", paths)


def length_text(lengths: list[int]) -> str:
    if not lengths:
        return ""

    if min(lengths) == max(lengths):
        return str(lengths[0])

    return f"{min(lengths)}–{max(lengths)}"


def captured_section(workspace_directory: pathlib.Path) -> list[str]:
    files = sorted(workspace_directory.glob(CAPTURED_OUTPUT_GLOB))

    if not files:
        return [
            "## Captured output",
            "",
            f"No {CAPTURED_OUTPUT_GLOB} in {workspace_directory}.",
            "",
        ]

    lines: list[str] = []

    for path in files:
        try:
            outputs = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise FactsError(f"cannot read {path}: {error}") from error

        paths: dict[str, OutputPath] = {}
        flatten_output(outputs, "", paths)
        rows = [
            [
                output_path,
                " or ".join(entry.types),
                length_text(entry.lengths),
                EXAMPLE_SEPARATOR.join(entry.examples),
            ]
            for output_path, entry in paths.items()
            if output_path
        ]
        lines += [
            f"## Captured output: {path.name}",
            "",
            *table(["path", "type", "array length", "examples"], rows),
            "",
        ]

    return lines


def unsupported_section(facts: list[InputFact]) -> list[str]:
    unsupported = [
        fact for fact in facts if fact.contract == CONTRACT_UNSUPPORTED
    ]

    if not unsupported:
        return []

    return [
        "## UNSUPPORTED inputs",
        "",
        *table(
            ["workflow", "field", "as", "why"],
            [
                [
                    fact.workflow_id,
                    fact.variable.name,
                    fact.variable.annotation(),
                    fact.reason,
                ]
                for fact in unsupported
            ],
        ),
        "",
    ]


def select_workflows(
    workflows: list[dict[str, typing.Any]], workflow_ids: list[str]
) -> list[dict[str, typing.Any]]:
    if not workflow_ids:
        return workflows

    known = [workflow_id_of(workflow) for workflow in workflows]
    unknown = [
        workflow_id
        for workflow_id in dict.fromkeys(workflow_ids)
        if workflow_id not in known
    ]

    if unknown:
        raise FactsError(
            f"unknown --workflow {', '.join(unknown)};"
            f" known: {', '.join(known)}"
        )

    return [
        workflow
        for workflow in workflows
        if workflow_id_of(workflow) in workflow_ids
    ]


def extract(
    release_directory: pathlib.Path, workflow_ids: list[str]
) -> tuple[list[str], bool]:
    document = load_compose(release_directory / COMPOSE_FILE)
    workflows = as_list(document, "workflows", "workflow")
    components = as_list(document, "components", "component")
    selected = select_workflows(workflows, workflow_ids)
    reachable: set[tuple[str, str]] | None = None

    if workflow_ids:
        reachable = set()

        for workflow in selected:
            reachable |= reachable_actions(
                workflow, workflows, components, set()
            )

    facts = [
        fact
        for workflow in selected
        for fact in input_facts(workflow, workflows, components, reachable)
    ]
    lines = [
        f"# Facts: {release_directory.name}",
        "",
        *controller_section(document),
        *workflow_section(selected, components, len(workflows) == 1),
        *input_section(facts),
        *component_section(components),
        *captured_section(shell_files.workspace_directory(release_directory)),
    ]
    unsupported = unsupported_section(facts)

    return lines + unsupported, bool(unsupported)


def main() -> int:
    for output_file in (sys.stdout, sys.stderr):
        if isinstance(output_file, io.TextIOWrapper):
            output_file.reconfigure(encoding="utf-8")

    program_name = pathlib.Path(__file__).name
    options = parse_arguments(sys.argv[1:])
    release_directory = options.release_directory.resolve()

    try:
        lines, has_unsupported = extract(
            release_directory, options.workflow_ids
        )
    except FactsError as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)
        return EXIT_USAGE

    print("\n".join(lines).rstrip("\n"))

    if has_unsupported:
        print(
            f"{program_name}: some inputs have no slot"
            " in the release contract",
            file=sys.stderr,
        )
        return EXIT_UNSUPPORTED

    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.exit(main())
