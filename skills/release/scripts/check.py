import argparse
import io
import pathlib
import re
import subprocess
import sys
import typing

import yaml

REQUIRED_FILES = ["README.md", "model-compose.yml", "LICENSE"]
COMPOSE_FILE = "model-compose.yml"
WEBUI_COMPONENT_ID = "webui"
README_PATTERN = re.compile(r"^README(\.[A-Za-z-]+)?\.md$")
MEDIA_REFERENCE_PATTERNS = (
    re.compile(r"\]\((?:\./)?(docs/images/[^)\s]+)(?:\s+\"[^\"]*\")?\)"),
    re.compile(r"src=[\"'](?:\./)?(docs/images/[^\"']+)[\"']"),
)
EXIT_SUCCESS = 0
EXIT_UNSHIPPABLE = 1
EXIT_USAGE = 2


class CheckError(Exception):
    pass


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog=pathlib.Path(__file__).name)
    parser.add_argument(
        "release_directory", type=pathlib.Path, help="releases/<example>"
    )

    return parser.parse_args()


def run_git(
    release_directory: pathlib.Path, *arguments: str, stdin: str = ""
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            ["git", *arguments],
            cwd=release_directory,
            input=stdin,
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
    except OSError as error:
        raise CheckError(f"cannot run git: {error}") from error


def list_files(
    release_directory: pathlib.Path, *options: str
) -> list[pathlib.PurePosixPath]:
    completed = run_git(
        release_directory,
        "ls-files",
        "-z",
        *options,
        "--exclude-standard",
        "--",
        ".",
    )

    if completed.returncode != 0:
        raise CheckError(f"git ls-files failed: {completed.stderr.strip()}")

    return [
        pathlib.PurePosixPath(entry)
        for entry in completed.stdout.split("\0")
        if entry and (release_directory / entry).exists()
    ]


def repository_prefix(release_directory: pathlib.Path) -> str:
    completed = run_git(release_directory, "rev-parse", "--show-prefix")

    if completed.returncode != 0:
        raise CheckError(f"git rev-parse failed: {completed.stderr.strip()}")

    return completed.stdout.strip()


def ignored_outside(
    release_directory: pathlib.Path, entries: list[pathlib.PurePosixPath]
) -> list[pathlib.PurePosixPath]:
    if not entries:
        return []

    completed = run_git(
        release_directory,
        "check-ignore",
        "-v",
        "-z",
        "--stdin",
        stdin="\0".join(str(entry) for entry in entries),
    )

    if completed.returncode not in (0, 1):
        raise CheckError(
            f"git check-ignore failed: {completed.stderr.strip()}"
        )

    fields = completed.stdout.split("\0")
    prefix = repository_prefix(release_directory)

    return [
        pathlib.PurePosixPath(fields[index + 3])
        for index in range(0, len(fields) - 3, 4)
        if not fields[index].startswith(prefix)
    ]


def read_text(path: pathlib.Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        raise CheckError(f"cannot read {path}: {error}") from error


def referenced_media(
    release_directory: pathlib.Path, files: list[pathlib.PurePosixPath]
) -> set[str]:
    references = set()

    for file in files:
        if len(file.parts) == 1 and README_PATTERN.match(file.name):
            text = read_text(release_directory / file)

            for pattern in MEDIA_REFERENCE_PATTERNS:
                references.update(pattern.findall(text))

    return references


def component_ids(document: dict[str, typing.Any]) -> list[typing.Any]:
    components = document.get("components")
    component = document.get("component")

    if isinstance(components, dict):
        return list(components)

    if isinstance(components, list):
        return [
            item.get("id") for item in components if isinstance(item, dict)
        ]

    if isinstance(component, dict):
        return [component.get("id")]

    return []


def serves_web(release_directory: pathlib.Path) -> bool:
    compose_file = release_directory / COMPOSE_FILE

    if not compose_file.is_file():
        return False

    try:
        document = yaml.safe_load(read_text(compose_file))
    except yaml.YAMLError as error:
        raise CheckError(f"cannot parse {compose_file}: {error}") from error

    if not isinstance(document, dict):
        return False

    return WEBUI_COMPONENT_ID in component_ids(document)


def is_shipped(
    file: pathlib.PurePosixPath, media: set[str], web: bool
) -> bool:
    top = file.parts[0]

    if len(file.parts) == 1:
        return file.name in REQUIRED_FILES or bool(
            README_PATTERN.match(file.name)
        )

    if top == "docs":
        return str(file) in media

    if top == "web":
        return web and file.parts[1] != "test"

    return False


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8")

    program_name = pathlib.Path(__file__).name
    arguments = parse_arguments()
    release_directory = arguments.release_directory

    if not release_directory.is_dir():
        print(
            f"{program_name}: error: {release_directory}: not a directory",
            file=sys.stderr,
        )
        return EXIT_USAGE

    try:
        files = list_files(release_directory, "--cached", "--others")
        ignored = ignored_outside(
            release_directory,
            list_files(release_directory, "--others", "--ignored"),
        )
        media = referenced_media(release_directory, files)
        web = serves_web(release_directory)
    except CheckError as error:
        print(
            f"{program_name}: error: {release_directory}: {error}",
            file=sys.stderr,
        )
        return EXIT_USAGE

    unshippable = [file for file in files if not is_shipped(file, media, web)]
    unshippable += ignored

    missing = [
        name
        for name in REQUIRED_FILES
        if not (release_directory / name).is_file()
    ]
    missing += [
        reference
        for reference in sorted(media)
        if not (release_directory / reference).is_file()
    ]

    for file in unshippable:
        print(f"unshippable {file}")

    for name in missing:
        print(f"missing {name}")

    if unshippable or missing:
        return EXIT_UNSHIPPABLE

    print(f"ok: {release_directory.name}")
    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.exit(main())
