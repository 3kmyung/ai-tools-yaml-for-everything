import argparse
import json
import pathlib
import re
import shutil
import sys
import typing

import yaml

EXIT_SUCCESS = 0
EXIT_USAGE = 2

COMPOSE_FILE = "model-compose.yml"
OUTPUT_FILE = "output.json"
REPLAY_DIRECTORY = "replay"
SINGLE_JOB_ID = "__job__"
REPLAY_COMPONENT_ID = "replay"
WAIT_ACTION_ID = "wait"
FINISH_ACTION_ID = "finish"
REPLAY_SECONDS = 3
MINIMUM_DELAY_SECONDS = 0.3
SLEEP_COMMAND = ("python", "-c")
OUTPUT_TYPE_PATTERN = re.compile(r"^\$\{[^}]*?\s+as\s+([^\s;|}\[]+)[^}]*\}$")
INPUT_REFERENCE_PATTERN = re.compile(r"\$\{\s*input(?:\.[\w-]+)?[^}]*\}")
VARIABLE_OPENING = "${"
MEDIA_TYPES = ("audio", "image", "video", "file")
WEBUI_COMPONENT_ID = "webui"
WEBUI_ITEM_PATTERN = re.compile(r"^(\s*)-\s+id:\s*[\"']?webui[\"']?\s*$")
SKIPPED_INTERFACE_DIRECTORIES = ("node_modules", "dist")


class ReplayError(Exception):
    pass


class ReplayDumper(yaml.SafeDumper):
    pass


def represent_string(dumper: yaml.SafeDumper, value: str) -> yaml.ScalarNode:
    style = "|" if "\n" in value else None

    return dumper.represent_scalar("tag:yaml.org,2002:str", value, style=style)


ReplayDumper.add_representer(str, represent_string)


def read_yaml(path: pathlib.Path) -> dict[str, typing.Any]:
    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as error:
        raise ReplayError(f"cannot read {path}: {error}") from error

    if not isinstance(document, dict):
        raise ReplayError(f"{path} is not a YAML mapping")

    return document


def read_output(path: pathlib.Path) -> dict[str, typing.Any]:
    try:
        output = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ReplayError(f"cannot read {path}: {error}") from error

    if not isinstance(output, dict):
        raise ReplayError(f"{path} is not a JSON object")

    return output


def webui_component(
    document: dict[str, typing.Any],
) -> dict[str, typing.Any] | None:
    components = document.get("components")

    if not isinstance(components, list):
        return None

    found = [
        component
        for component in components
        if isinstance(component, dict)
        and component.get("id") == WEBUI_COMPONENT_ID
    ]

    return found[0] if found else None


def webui_block(compose_text: str) -> str:
    lines = compose_text.splitlines()
    starts = [
        (index, match.group(1))
        for index, match in (
            (index, WEBUI_ITEM_PATTERN.match(line))
            for index, line in enumerate(lines)
        )
        if match is not None
    ]

    if len(starts) != 1:
        raise ReplayError(
            f"the webui component is not written as one "
            f"'- id: {WEBUI_COMPONENT_ID}' item, so it cannot be carried "
            f"over verbatim"
        )

    start, indent = starts[0]
    end = start + 1

    while end < len(lines):
        line = lines[end]
        stripped = line.strip()
        line_indent = len(line) - len(line.lstrip())

        if (
            stripped
            and not stripped.startswith("#")
            and line_indent <= len(indent)
        ):
            break

        end += 1

    while end > start + 1 and not lines[end - 1].strip():
        end -= 1

    return "".join(
        line[len(indent) :] + "\n" if line.strip() else "\n"
        for line in lines[start:end]
    )


def copy_interface(
    component: dict[str, typing.Any],
    release_directory: pathlib.Path,
    replay_directory: pathlib.Path,
) -> None:
    manage = component.get("manage")
    working_directory = (
        manage.get("working_dir") if isinstance(manage, dict) else None
    )

    if not isinstance(working_directory, str):
        raise ReplayError(
            "the webui component names no manage.working_dir to copy"
        )

    source = release_directory / working_directory

    if not source.is_dir():
        raise ReplayError(
            f"the webui component's working_dir {source} is not a directory"
        )

    shutil.copytree(
        source,
        replay_directory / working_directory,
        ignore=shutil.ignore_patterns(*SKIPPED_INTERFACE_DIRECTORIES),
        dirs_exist_ok=True,
    )


def workflows_of(
    document: dict[str, typing.Any],
) -> list[dict[str, typing.Any]]:
    workflows = document.get("workflows")

    if isinstance(workflows, list):
        return [
            workflow for workflow in workflows if isinstance(workflow, dict)
        ]

    workflow = document.get("workflow")

    return [workflow] if isinstance(workflow, dict) else []


def choose_workflow(
    document: dict[str, typing.Any], workflow_id: str | None
) -> dict[str, typing.Any]:
    workflows = workflows_of(document)

    if workflow_id is not None:
        chosen = [
            workflow
            for workflow in workflows
            if workflow.get("id") == workflow_id
        ]

        if not chosen:
            raise ReplayError(f"no workflow with id {workflow_id!r}")

        return chosen[0]

    if len(workflows) != 1:
        raise ReplayError("the file has several workflows; pass --workflow")

    return workflows[0]


def jobs_of(workflow: dict[str, typing.Any]) -> list[dict[str, typing.Any]]:
    jobs = workflow.get("jobs")

    if jobs is None and isinstance(workflow.get("job"), dict):
        jobs = [workflow["job"]]

    if not isinstance(jobs, list) or not all(
        isinstance(job, dict) for job in jobs
    ):
        raise ReplayError("the workflow has no 'jobs' list or 'job' mapping")

    return [{**job, "id": job.get("id", SINGLE_JOB_ID)} for job in jobs]


def job_depths(jobs: list[dict[str, typing.Any]]) -> dict[str, int]:
    dependencies = {
        job["id"]: list(job.get("depends_on") or []) for job in jobs
    }
    depths: dict[str, int] = {}

    def depth_of(job_id: str, visiting: frozenset[str]) -> int:
        if job_id in depths:
            return depths[job_id]

        if job_id in visiting:
            raise ReplayError(f"job {job_id!r} depends on itself")

        parents = [
            parent
            for parent in dependencies.get(job_id, [])
            if parent in dependencies
        ]
        depth = 1 + max(
            (depth_of(parent, visiting | {job_id}) for parent in parents),
            default=0,
        )
        depths[job_id] = depth

        return depth

    for job_id in dependencies:
        depth_of(job_id, frozenset())

    return depths


def delay_seconds(depths: dict[str, int]) -> float:
    return max(
        MINIMUM_DELAY_SECONDS,
        round(REPLAY_SECONDS / max(depths.values()), 2),
    )


def final_job_id(
    jobs: list[dict[str, typing.Any]], depths: dict[str, int]
) -> str:
    deepest = max(depths.values())

    return [job["id"] for job in jobs if depths[job["id"]] == deepest][-1]


def output_types(
    workflow: dict[str, typing.Any], jobs: list[dict[str, typing.Any]]
) -> dict[str, str | None]:
    mapping = workflow.get("output")

    if mapping is None:
        depended = {
            dependency
            for job in jobs
            for dependency in (job.get("depends_on") or [])
        }
        mapping = {}

        for job in jobs:
            job_output = job.get("output")

            if job["id"] in depended or not isinstance(job_output, dict):
                continue

            for key, expression in job_output.items():
                if key in mapping:
                    raise ReplayError(f"two final jobs both output {key!r}")

                mapping[key] = expression

    if not isinstance(mapping, dict) or not mapping:
        raise ReplayError(
            "the workflow has no named 'output' mapping and no final job "
            "with one"
        )

    types: dict[str, str | None] = {}

    for key, expression in mapping.items():
        match = OUTPUT_TYPE_PATTERN.match(str(expression).strip())
        types[key] = match.group(1) if match is not None else None

    return types


def input_references(value: typing.Any) -> list[str]:
    if isinstance(value, str):
        return INPUT_REFERENCE_PATTERN.findall(value)

    if isinstance(value, dict):
        return [
            reference
            for item in value.values()
            for reference in input_references(item)
        ]

    if isinstance(value, list):
        return [
            reference for item in value for reference in input_references(item)
        ]

    return []


def contains_variable(value: typing.Any) -> bool:
    if isinstance(value, str):
        return VARIABLE_OPENING in value

    if isinstance(value, dict):
        return any(contains_variable(item) for item in value.values())

    if isinstance(value, list):
        return any(contains_variable(item) for item in value)

    return False


def replay_value(
    key: str,
    value: typing.Any,
    value_type: str | None,
    call_directory: pathlib.Path,
    replay_directory: pathlib.Path,
) -> typing.Any:
    base_type = (value_type or "").split("/")[0]

    if base_type not in MEDIA_TYPES:
        if contains_variable(value):
            raise ReplayError(
                f"output {key!r} holds '{VARIABLE_OPENING}', which the "
                f"replay would read as a variable"
            )

        return value

    if not isinstance(value, str):
        raise ReplayError(
            f"output {key!r} is {base_type} but {OUTPUT_FILE} holds no "
            f"file name"
        )

    source = call_directory / value

    if not source.is_file():
        raise ReplayError(
            f"output {key!r} names {value}, which is not beside {OUTPUT_FILE}"
        )

    target = pathlib.Path(REPLAY_DIRECTORY) / f"{key}{source.suffix}"
    shutil.copyfile(source, replay_directory / target)

    return (
        f"${{env.REPLAY_{key.upper()} as {value_type};path | "
        f"{target.as_posix()}}}"
    )


def sleep_command(seconds: float) -> list[str]:
    return [*SLEEP_COMMAND, f"import time; time.sleep({seconds})"]


def replay_component_id(
    jobs: list[dict[str, typing.Any]], final_id: str
) -> str:
    final_job = next(job for job in jobs if job["id"] == final_id)
    component_id = final_job.get("component")

    if isinstance(component_id, str) and component_id != WEBUI_COMPONENT_ID:
        return component_id

    return REPLAY_COMPONENT_ID


def replay_component(
    component_id: str, seconds: float, final_output: dict[str, typing.Any]
) -> dict[str, typing.Any]:
    return {
        "id": component_id,
        "type": "shell",
        "actions": [
            {
                "id": WAIT_ACTION_ID,
                "command": sleep_command(seconds),
                "output": {},
            },
            {
                "id": FINISH_ACTION_ID,
                "command": sleep_command(seconds),
                "output": final_output,
            },
        ],
    }


def replay_job(
    job: dict[str, typing.Any], final_id: str, component_id: str
) -> dict[str, typing.Any]:
    references = input_references(job.get("input"))
    replayed = {
        "id": job["id"],
        "component": component_id,
        "action": FINISH_ACTION_ID
        if job["id"] == final_id
        else WAIT_ACTION_ID,
    }

    if references:
        replayed["input"] = " ".join(dict.fromkeys(references))

    if "depends_on" in job:
        replayed["depends_on"] = job["depends_on"]

    return replayed


def write_replay(
    release_directory: pathlib.Path,
    call_directory: pathlib.Path,
    replay_directory: pathlib.Path,
    workflow_id: str | None,
) -> pathlib.Path:
    compose_text = (release_directory / COMPOSE_FILE).read_text(
        encoding="utf-8"
    )
    document = read_yaml(release_directory / COMPOSE_FILE)
    output = read_output(call_directory / OUTPUT_FILE)
    workflow = choose_workflow(document, workflow_id)
    interface = webui_component(document)
    interface_text = webui_block(compose_text) if interface else ""
    jobs = jobs_of(workflow)
    depths = job_depths(jobs)
    final_id = final_job_id(jobs, depths)
    types = output_types(workflow, jobs)
    missing = sorted(set(types) - set(output))

    if missing:
        raise ReplayError(f"{OUTPUT_FILE} lacks workflow outputs {missing}")

    (replay_directory / REPLAY_DIRECTORY).mkdir(parents=True, exist_ok=True)

    final_output = {
        key: replay_value(
            key, output[key], value_type, call_directory, replay_directory
        )
        for key, value_type in types.items()
    }
    workflow_output = {
        key: (
            f"${{jobs.{final_id}.output.{key}"
            f"{f' as {value_type}' if value_type else ''}}}"
        )
        for key, value_type in types.items()
    }
    replay_workflow = {
        key: value
        for key, value in workflow.items()
        if key not in ("jobs", "job", "output")
    }
    replay_workflow["output"] = workflow_output
    component_id = replay_component_id(jobs, final_id)
    replay_workflow["jobs"] = [
        replay_job(job, final_id, component_id) for job in jobs
    ]
    replay_document = {
        "controller": document.get("controller", {}),
        "workflows": [replay_workflow],
        "components": [
            replay_component(component_id, delay_seconds(depths), final_output)
        ],
    }
    replay_text = yaml.dump(
        replay_document,
        Dumper=ReplayDumper,
        sort_keys=False,
        allow_unicode=True,
        width=10000,
    )

    if interface:
        copy_interface(interface, release_directory, replay_directory)
        replay_text += interface_text

    compose_path = replay_directory / COMPOSE_FILE
    compose_path.write_text(replay_text, encoding="utf-8", newline="\n")

    return compose_path


def main():
    program_name = pathlib.Path(__file__).name
    parser = argparse.ArgumentParser(prog=program_name)
    parser.add_argument("release_directory", type=pathlib.Path)
    parser.add_argument(
        "call_directory",
        type=pathlib.Path,
        help="A folder yaml-for-everything:run call saved, "
        "holding output.json.",
    )
    parser.add_argument("replay_directory", type=pathlib.Path)
    parser.add_argument("--workflow", default=None)
    arguments = parser.parse_args()

    try:
        compose_path = write_replay(
            arguments.release_directory,
            arguments.call_directory,
            arguments.replay_directory,
            arguments.workflow,
        )
    except ReplayError as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)

        return EXIT_USAGE

    print(f"wrote {compose_path}")

    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main())
