import argparse
import pathlib
import subprocess
import sys

EXIT_SUCCESS = 0
EXIT_UNRELEASED = 1
EXIT_USAGE = 2

DEFAULT_REMOTE = "upstream"
DEFAULT_REFERENCE = "upstream/main"
TAG_PATTERN = "v*"
TAG_PREFIX = "v"


class VersionError(Exception):
    pass


def git(arguments):
    completed = subprocess.run(
        ["git", *arguments],
        capture_output=True,
        text=True,
        check=False,
    )

    if completed.returncode != 0:
        raise VersionError(
            f"git {' '.join(arguments)} exited {completed.returncode}: "
            f"{completed.stderr.strip()}"
        )

    return completed.stdout.strip()


def find_version(remote, reference, target):
    git(["fetch", "--quiet", "--tags", remote])
    merge_base = git(["merge-base", reference, target])
    tags = git(
        [
            "tag",
            "--contains",
            merge_base,
            "--sort=v:refname",
            "--list",
            TAG_PATTERN,
        ]
    ).splitlines()

    if not tags:
        return merge_base, None

    return merge_base, tags[0].removeprefix(TAG_PREFIX)


def main():
    program_name = pathlib.Path(__file__).name
    parser = argparse.ArgumentParser(prog=program_name)
    parser.add_argument("--remote", default=DEFAULT_REMOTE)
    parser.add_argument(
        "--ref",
        default=DEFAULT_REFERENCE,
        help="The model-compose source the release was checked against.",
    )
    arguments = parser.parse_args()
    target = f"{arguments.remote}/main"

    try:
        merge_base, version = find_version(
            arguments.remote, arguments.ref, target
        )
    except VersionError as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)

        return EXIT_USAGE

    if version is None:
        print(
            f"{program_name}: error: no {TAG_PATTERN} tag contains "
            f"{merge_base}, so no release carries the checked source yet",
            file=sys.stderr,
        )

        return EXIT_UNRELEASED

    print(version)

    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main())
