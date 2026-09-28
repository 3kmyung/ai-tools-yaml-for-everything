import io
import pathlib
import re
import sys
import typing

import shell_files

SOURCE_DIRECTORY = "src"
SOURCE_PATTERN = re.compile(r"\.tsx?$")
TEST_PATTERN = re.compile(r"\.test\.tsx?$")
COMPONENT_SUFFIX = ".tsx"
RAW_COLOR = re.compile(r"#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(")
ARBITRARY_UTILITY = re.compile(
    r"\b(?:text|bg|border|fill|stroke|p|px|py|pt|pr|pb|pl|m|mx|my|gap"
    r"|rounded|shadow"
    r"|leading|tracking|w|h|size|inset|top|right|bottom|left)-\[[^\]]+\]"
)
INLINE_SIZE = re.compile(
    r"\b(?:width|height|minWidth|maxWidth|minHeight|maxHeight"
    r"|padding\w*|margin\w*"
    r"|gap|rowGap|columnGap|fontSize|lineHeight|letterSpacing|borderRadius"
    r"|top|right|bottom|left|inset)\s*:\s*[\"'`]?-?(?:[1-9]\d*|0?\.\d+)"
)
DOMAIN_FORBIDDEN = (
    (
        re.compile(
            r"""(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)"""
            r"""["'](?:react|react-dom)(?:/[^"']*)?["']"""
        ),
        "imports React",
    ),
    (re.compile(r"\bfetch\s*\("), "calls fetch"),
    (re.compile(r"\bWebSocket\b"), "uses WebSocket"),
    (re.compile(r"\bdocument\."), "touches document"),
    (re.compile(r"\bwindow\."), "touches window"),
)
NATIVE_MEDIA_CONTROLS = re.compile(r"<(audio|video)\b[^>]*?\bcontrols\b")
CAPTURED_OUTPUT_CALL = re.compile(
    rf"\b{shell_files.CAPTURED_OUTPUT_READER}\s*(?:<[^>]*>)?\s*\("
)
LOCALIZED_SCRIPT = re.compile("[가-힣一-鿿]")
LOCALIZED_PROPERTY_LINE = re.compile(r"""^\s*["']?(?:ko|zh)["']?\s*:""")
EXPECTED_ARGUMENT_COUNT = 2
EXIT_SUCCESS = 0
EXIT_VIOLATION = 1
EXIT_USAGE = 2


RENDERED_FILES: dict[
    str, tuple[typing.Callable[[str], str], typing.Callable[[str], str]]
] = {
    shell_files.PACKAGE_FILE: (
        shell_files.read_package_name,
        shell_files.render_package,
    ),
    shell_files.PAGE_FILE: (
        shell_files.read_page_title,
        shell_files.render_page,
    ),
}


def asset_label(source: pathlib.Path) -> str:
    return source.relative_to(shell_files.ASSETS_DIRECTORY).as_posix()


def find_changed_copies(web_directory: pathlib.Path) -> list[str]:
    violations: list[str] = []

    for copy_path, source in shell_files.fixed_copies().items():
        copy = (
            shell_files.owner_directory(web_directory, copy_path) / copy_path
        )

        if not copy.is_file():
            violations.append(
                f"{copy_path}: missing, run scaffold.py or copy"
                f" assets/{asset_label(source)}"
            )
        elif shell_files.read_normalized(copy) != shell_files.read_normalized(
            source
        ):
            violations.append(
                f"{copy_path}: differs from assets/{asset_label(source)}"
            )

    return violations


def find_changed_renders(web_directory: pathlib.Path) -> list[str]:
    violations: list[str] = []

    for file_name, (read_value, render) in RENDERED_FILES.items():
        path = web_directory / file_name

        if not path.is_file():
            violations.append(f"{file_name}: missing, run scaffold.py")
            continue

        text = shell_files.read_normalized(path)

        try:
            expected = render(read_value(text))
        except shell_files.TemplateValueError as error:
            violations.append(f"{file_name}: {error}")
            continue

        if text != expected:
            violations.append(
                f"{file_name}: differs from assets/templates/{file_name},"
                " run scaffold.py"
            )

    config_name = shell_files.TYPESCRIPT_CONFIG_FILE
    config_path = web_directory / config_name
    expected_config = shell_files.render_typescript_config(
        shell_files.release_name_of(web_directory)
    )

    if not config_path.is_file():
        violations.append(f"{config_name}: missing, run scaffold.py")
    elif shell_files.read_normalized(config_path) != expected_config:
        violations.append(
            f"{config_name}: differs from assets/templates/{config_name},"
            " run scaffold.py"
        )

    return violations


def find_misplaced_files(web_directory: pathlib.Path) -> list[str]:
    violations: list[str] = []
    release_name = shell_files.release_name_of(web_directory)
    workspace = f"{shell_files.WORKSPACES_DIRECTORY_NAME}/{release_name}"

    if (web_directory / shell_files.TEST_ROOT).exists():
        violations.append(
            f"{shell_files.TEST_ROOT}/: ships with the release, move it to"
            f" {workspace}/{shell_files.WEB_DIRECTORY_NAME}"
            f"/{shell_files.TEST_ROOT}/"
        )

    for path in sorted(
        web_directory.parent.glob(shell_files.CAPTURED_OUTPUT_GLOB)
    ):
        violations.append(
            f"../{path.name}: ships with the release, move it to {workspace}/"
        )

    return violations


def source_files(web_directory: pathlib.Path) -> list[pathlib.Path]:
    return sorted(
        path
        for path in (web_directory / SOURCE_DIRECTORY).rglob("*")
        if path.is_file()
        and SOURCE_PATTERN.search(path.name)
        and not TEST_PATTERN.search(path.name)
    )


def find_untouched_stubs(web_directory: pathlib.Path) -> list[str]:
    violations: list[str] = []

    for stub_path, source in shell_files.stub_files().items():
        release_file = web_directory / stub_path

        if release_file.is_file() and shell_files.read_normalized(
            release_file
        ) == shell_files.read_normalized(source):
            violations.append(
                f"{stub_path}: still the scaffold stub,"
                " write the release definition"
            )

    return violations


def find_offending_lines(web_directory: pathlib.Path) -> list[str]:
    violations: list[str] = []
    fixed = {
        web_directory / copy_path for copy_path in shell_files.fixed_copies()
    }

    for path in source_files(web_directory):
        if path in fixed:
            continue

        patterns = [RAW_COLOR, ARBITRARY_UTILITY]

        if path.suffix == COMPONENT_SUFFIX:
            patterns.append(INLINE_SIZE)

        relative_path = path.relative_to(web_directory).as_posix()

        for number, line in enumerate(
            shell_files.read_normalized(path).split("\n"), start=1
        ):
            if any(pattern.search(line) for pattern in patterns):
                violations.append(f"{relative_path}:{number}: {line.strip()}")

    return violations


def is_under(relative_path: str, directory: str) -> bool:
    return relative_path.startswith(f"{directory}/")


def release_owned_files(
    web_directory: pathlib.Path,
) -> list[tuple[str, pathlib.Path]]:
    fixed = set(shell_files.fixed_copies())
    owned: list[tuple[str, pathlib.Path]] = []

    for root in shell_files.OWNED_ROOTS:
        owner = shell_files.owner_directory(web_directory, root)

        for path in sorted((owner / root).rglob("*")):
            relative_path = path.relative_to(owner).as_posix()

            if path.is_file() and relative_path not in fixed:
                owned.append((relative_path, path))

    return owned


def line_number_at(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def find_unlocalized_lines(relative_path: str, text: str) -> list[str]:
    return [
        f"{relative_path}:{number}: Korean or Chinese text outside a ko:"
        " or zh: line of a Localized object with en, ko and zh"
        for number, line in enumerate(text.split("\n"), start=1)
        if LOCALIZED_SCRIPT.search(line)
        and not LOCALIZED_PROPERTY_LINE.match(line)
    ]


def find_release_violations(web_directory: pathlib.Path) -> list[str]:
    violations: list[str] = []
    domain_tests_reading_output = 0
    allowed = ", ".join(
        f"{directory}/" for directory in shell_files.RELEASE_DIRECTORIES
    )

    for relative_path, path in release_owned_files(web_directory):
        if not any(
            is_under(relative_path, directory)
            for directory in shell_files.RELEASE_DIRECTORIES
        ):
            violations.append(
                f"{relative_path}: not a shell file and outside {allowed}"
            )
            continue

        if not SOURCE_PATTERN.search(path.name):
            continue

        text = shell_files.read_normalized(path)

        if is_under(relative_path, shell_files.RELEASE_DIRECTORY):
            violations += find_unlocalized_lines(relative_path, text)

        if is_under(relative_path, shell_files.DOMAIN_DIRECTORY):
            for pattern, description in DOMAIN_FORBIDDEN:
                for match in pattern.finditer(text):
                    violations.append(
                        f"{relative_path}:"
                        f"{line_number_at(text, match.start())}:"
                        f" domain code {description}"
                    )

        for match in NATIVE_MEDIA_CONTROLS.finditer(text):
            violations.append(
                f"{relative_path}:{line_number_at(text, match.start())}:"
                f" <{match.group(1)} controls> is the browser player,"
                " use ui/audio/"
            )

        if (
            is_under(relative_path, shell_files.DOMAIN_TEST_DIRECTORY)
            and TEST_PATTERN.search(path.name)
            and CAPTURED_OUTPUT_CALL.search(text)
        ):
            domain_tests_reading_output += 1

    if domain_tests_reading_output == 0:
        violations.append(
            f"{shell_files.DOMAIN_TEST_DIRECTORY}/: no test calls"
            f" {shell_files.CAPTURED_OUTPUT_READER}()"
            " from test/support/captured-output"
        )

    return violations


def main() -> int:
    for output_file in (sys.stdout, sys.stderr):
        if isinstance(output_file, io.TextIOWrapper):
            output_file.reconfigure(encoding="utf-8")

    program_name = pathlib.Path(__file__).name

    if len(sys.argv) != EXPECTED_ARGUMENT_COUNT:
        print(f"usage: {program_name} <web-directory>", file=sys.stderr)
        return EXIT_USAGE

    web_directory = pathlib.Path(sys.argv[1]).resolve()

    if not shell_files.is_release_web_directory(web_directory):
        print(
            f"{program_name}: error: {web_directory}"
            " is not releases/<release>/web",
            file=sys.stderr,
        )
        return EXIT_USAGE

    if not (web_directory / SOURCE_DIRECTORY).is_dir():
        print(
            f"{program_name}: error: {web_directory}"
            f" has no {SOURCE_DIRECTORY}/",
            file=sys.stderr,
        )
        return EXIT_USAGE

    violations = find_changed_copies(web_directory)
    violations += find_changed_renders(web_directory)
    violations += find_misplaced_files(web_directory)
    violations += find_untouched_stubs(web_directory)
    violations += find_offending_lines(web_directory)
    violations += find_release_violations(web_directory)

    for violation in violations:
        print(violation)

    if violations:
        print(f"{program_name}: {len(violations)} violations", file=sys.stderr)
        return EXIT_VIOLATION

    print("ok")
    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.exit(main())
