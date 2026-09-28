import argparse
import io
import pathlib
import re
import sys

import shell_files

PACKAGE_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
EXIT_SUCCESS = 0
EXIT_USAGE = 2


def parse_arguments(arguments: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog=pathlib.Path(__file__).name)
    parser.add_argument("web_directory", type=pathlib.Path)
    parser.add_argument("--name", required=True)
    parser.add_argument("--title", required=True)

    return parser.parse_args(arguments)


def write_text(path: pathlib.Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def scaffold(web_directory: pathlib.Path, name: str, title: str) -> list[str]:
    report: list[str] = []
    repository = web_directory.parent.parent.parent
    release_name = shell_files.release_name_of(web_directory)

    for web_path, source in shell_files.fixed_copies().items():
        target = (
            shell_files.owner_directory(web_directory, web_path) / web_path
        )
        write_text(target, shell_files.read_normalized(source))
        report.append(f"wrote {target.relative_to(repository).as_posix()}")

    for web_path, text in shell_files.rendered_files(
        name, title, release_name
    ).items():
        target = web_directory / web_path
        write_text(target, text)
        report.append(f"wrote {target.relative_to(repository).as_posix()}")

    for web_path, source in shell_files.stub_files().items():
        target = web_directory / web_path
        label = target.relative_to(repository).as_posix()

        if target.exists():
            report.append(f"kept {label}")
            continue

        write_text(target, shell_files.read_normalized(source))
        report.append(f"created {label}")

    return report


def main() -> int:
    for output_file in (sys.stdout, sys.stderr):
        if isinstance(output_file, io.TextIOWrapper):
            output_file.reconfigure(encoding="utf-8")

    program_name = pathlib.Path(__file__).name
    options = parse_arguments(sys.argv[1:])

    if not PACKAGE_NAME_PATTERN.match(options.name):
        print(
            f"{program_name}: error: --name must be a lowercase package name,"
            f" got '{options.name}'",
            file=sys.stderr,
        )
        return EXIT_USAGE

    if options.web_directory.exists() and not options.web_directory.is_dir():
        print(
            f"{program_name}: error: {options.web_directory}"
            " is not a directory",
            file=sys.stderr,
        )
        return EXIT_USAGE

    web_directory = options.web_directory.resolve()

    if not shell_files.is_release_web_directory(web_directory):
        print(
            f"{program_name}: error: {web_directory}"
            " is not releases/<release>/web",
            file=sys.stderr,
        )
        return EXIT_USAGE

    for line in scaffold(web_directory, options.name, options.title):
        print(line)

    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.exit(main())
