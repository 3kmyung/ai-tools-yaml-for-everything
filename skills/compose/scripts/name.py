import enum
import importlib
import io
import pathlib
import re
import subprocess
import sys
import typing

import yaml

CHECKPOINT_ID_PATTERN = re.compile(r"[^/\s]+/[^/\s]+")
ENVIRONMENT_VARIABLE_PATTERN = re.compile(
    r"\$\{(?:\s*env\.([^\s|}]+))(?:\s*\|\s*([^\s}]+))?\s*\}"
)
NORMALIZATION_PATTERN = re.compile(r"[._-]")
TOKEN_SEPARATOR_PATTERN = re.compile(r"[-_]")
SCHEMA_MODULE = "mindor.dsl.schema.component.impl.model.model"
SCHEMA_ROOT = "ModelComponentConfig"
ENUM_FIELDS = ("architecture", "family")
EXCLUDED_ENUM_VALUE = "auto"
RELEASES_DIRECTORY = "releases"
COMPOSE_FILE = "model-compose.yml"
EXPECTED_ARGUMENT_COUNT = 5
EXIT_SUCCESS = 0
EXIT_USAGE = 2
EXIT_UNKNOWN_COMPONENT = 2
EXIT_NAME_COLLISION = 3
EXIT_NOT_CHECKPOINT_ID = 4


def normalize(text: str) -> str:
    return NORMALIZATION_PATTERN.sub("", text).lower()


def enum_match(text: str, enum_values: list[str]) -> str | None:
    normalized_text = normalize(text)
    matches = [
        value
        for value in enum_values
        if value != EXCLUDED_ENUM_VALUE
        and normalized_text.startswith(normalize(value))
    ]

    if not matches:
        return None

    return max(matches, key=lambda value: len(normalize(value)))


def model_name(checkpoint: str, enum_values: list[str]) -> str:
    organization, checkpoint_name = checkpoint.split("/", 1)

    for text in (checkpoint_name, organization):
        match = enum_match(text, enum_values)

        if match is not None:
            return match

    return TOKEN_SEPARATOR_PATTERN.split(checkpoint_name)[0].lower()


def variant_candidates(
    requested_checkpoint: str, existing_checkpoint: str
) -> list[str]:
    existing_tokens = {
        token.lower()
        for token in TOKEN_SEPARATOR_PATTERN.split(
            existing_checkpoint.split("/")[-1]
        )
    }
    requested_tokens = [
        token.lower()
        for token in TOKEN_SEPARATOR_PATTERN.split(
            requested_checkpoint.split("/")[-1]
        )
    ]

    return [
        token for token in requested_tokens if token not in existing_tokens
    ]


def flatten_union(annotation: typing.Any) -> list[typing.Any]:
    origin = typing.get_origin(annotation)

    if origin is typing.Annotated:
        return flatten_union(typing.get_args(annotation)[0])

    if origin is typing.Union:
        return [
            member
            for argument in typing.get_args(annotation)
            for member in flatten_union(argument)
        ]

    return [annotation]


def annotation_values(annotation: typing.Any) -> list[str]:
    values = []

    for member in flatten_union(annotation):
        if typing.get_origin(member) is typing.Literal:
            values.extend(typing.get_args(member))
        elif isinstance(member, type) and issubclass(member, enum.Enum):
            values.extend(member)

    return [
        value.value if isinstance(value, enum.Enum) else value
        for value in values
    ]


def field_values(component_class: type, field_name: str) -> list[str]:
    field = component_class.model_fields.get(field_name)

    if field is None:
        return []

    return annotation_values(field.annotation)


def schema_enum_values(
    repository: pathlib.Path, task: str, driver: str
) -> list[str] | None:
    sys.path.insert(0, str(repository / "src"))
    schema = importlib.import_module(SCHEMA_MODULE)
    component_classes = [
        component_class
        for component_class in flatten_union(getattr(schema, SCHEMA_ROOT))
        if task in field_values(component_class, "task")
        and driver in field_values(component_class, "driver")
    ]

    if not component_classes:
        return None

    return sorted(
        {
            value
            for component_class in component_classes
            for field_name in ENUM_FIELDS
            for value in field_values(component_class, field_name)
        }
    )


def run_git(
    repository: pathlib.Path, *arguments: str
) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(repository), *arguments],
        capture_output=True,
        check=False,
        text=True,
        encoding="utf-8",
    )


def existing_releases(
    repository: pathlib.Path, name: str
) -> list[tuple[str, str]]:
    compose_path = f"{RELEASES_DIRECTORY}/{name}/{COMPOSE_FILE}"
    releases = []
    working_tree_file = repository / compose_path

    if working_tree_file.is_file():
        releases.append(
            (
                str(working_tree_file),
                working_tree_file.read_text(encoding="utf-8"),
            )
        )

    references = run_git(
        repository,
        "for-each-ref",
        "--format=%(refname)",
        "refs/heads",
        "refs/remotes",
    )

    for reference in references.stdout.split():
        show_result = run_git(
            repository, "show", f"{reference}:{compose_path}"
        )

        if show_result.returncode == 0:
            releases.append(
                (f"{reference}:{compose_path}", show_result.stdout)
            )

    return releases


def environment_default(match: re.Match[str]) -> str:
    return match.group(2) if match.group(2) is not None else match.group(0)


def resolve_environment_variables(text: str) -> str:
    return ENVIRONMENT_VARIABLE_PATTERN.sub(environment_default, text)


def model_checkpoint(model: typing.Any) -> str | None:
    if isinstance(model, str):
        return model

    if isinstance(model, dict) and isinstance(model.get("repository"), str):
        return model["repository"]

    return None


def compose_checkpoints(compose_text: str) -> list[str]:
    checkpoints = []
    pending = [yaml.safe_load(resolve_environment_variables(compose_text))]

    while pending:
        node = pending.pop()

        if isinstance(node, dict):
            checkpoint = model_checkpoint(node.get("model"))

            if node.get("type") == "model" and checkpoint is not None:
                checkpoints.append(checkpoint)

            pending.extend(node.values())
        elif isinstance(node, list):
            pending.extend(node)

    return checkpoints


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8")

    program_name = pathlib.Path(sys.argv[0]).name

    if len(sys.argv) != EXPECTED_ARGUMENT_COUNT:
        print(
            f"usage: {program_name} "
            "<repository> <task> <driver> <checkpoint-id>",
            file=sys.stderr,
        )
        return EXIT_USAGE

    repository = pathlib.Path(sys.argv[1]).expanduser().resolve()
    task, driver, requested_checkpoint = sys.argv[2:]

    if not CHECKPOINT_ID_PATTERN.fullmatch(requested_checkpoint):
        print(
            f"{program_name}: error: '{requested_checkpoint}' is not an "
            "<organization>/<name> checkpoint ID",
            file=sys.stderr,
        )
        return EXIT_NOT_CHECKPOINT_ID

    if not (repository / "src").is_dir():
        print(
            f"{program_name}: error: '{repository}' has no src directory",
            file=sys.stderr,
        )
        return EXIT_USAGE

    enum_values = schema_enum_values(repository, task, driver)

    if enum_values is None:
        print(
            f"{program_name}: error: no model component for task '{task}' "
            f"and driver '{driver}'",
            file=sys.stderr,
        )
        return EXIT_UNKNOWN_COMPONENT

    name = f"{task}-{model_name(requested_checkpoint, enum_values)}"
    print(name)

    releases = existing_releases(repository, name)

    if not releases:
        return EXIT_SUCCESS

    locations_by_text = {}

    for location, compose_text in releases:
        locations_by_text.setdefault(compose_text, []).append(location)

    for compose_text, locations in locations_by_text.items():
        for location in locations:
            print(f"existing: {location}")

        for existing_checkpoint in compose_checkpoints(compose_text):
            candidates = " ".join(
                variant_candidates(requested_checkpoint, existing_checkpoint)
            )
            print(f"checkpoint: {existing_checkpoint}")
            print(f"candidates: {candidates}")

    return EXIT_NAME_COLLISION


if __name__ == "__main__":
    sys.exit(main())
