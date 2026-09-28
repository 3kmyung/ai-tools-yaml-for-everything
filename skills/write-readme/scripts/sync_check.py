import dataclasses
import difflib
import io
import pathlib
import re
import sys

DEFAULT_CANONICAL_NAME = "README.ko.md"
README_GLOB = "README*.md"
FENCE_PATTERN = re.compile(r"^\s*(`{3,}|~{3,})")
HEADING_PATTERN = re.compile(r"^(#{1,6})\s")
TABLE_SEPARATOR_PATTERN = re.compile(r"^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-*:?\s*$")
DASH_RUN_PATTERN = re.compile(r"-+")
CODE_SPAN_PATTERN = re.compile(r"(`+)(.+?)\1")
LINK_PATTERN = re.compile(r"\]\(([^)\s]+)")
REFERENCE_LINK_PATTERN = re.compile(r"^ {0,3}\[[^\]]+\]:\s*(\S+)")
URL_SCHEME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")
MINIMUM_ARGUMENT_COUNT = 2
MAXIMUM_ARGUMENT_COUNT = 3
EXIT_SUCCESS = 0
EXIT_STRUCTURE_DIFFERENCE = 1
EXIT_USAGE = 2
EXIT_CONTENT_DIFFERENCE = 3
SECTION_HEADING_LEVEL = "##"
SECTION_HEADINGS = {
    "README.md": (
        "Model",
        "Demo",
        "Quick Start",
        "Performance",
        "Limits",
        "License",
    ),
    "README.ko.md": ("모델", "데모", "빠른 시작", "성능", "한계", "라이선스"),
    "README.zh-cn.md": ("模型", "演示", "快速开始", "性能", "限制", "许可证"),
}


@dataclasses.dataclass
class Table:
    number: int
    separator: list[str] = dataclasses.field(default_factory=list)
    rows: list[tuple[int, list[str]]] = dataclasses.field(default_factory=list)


@dataclasses.dataclass
class CodeBlock:
    number: int
    language: str
    lines: list[str] = dataclasses.field(default_factory=list)


@dataclasses.dataclass
class Document:
    path: pathlib.Path
    outline: list[tuple[str, int]] = dataclasses.field(default_factory=list)
    tables: list[Table] = dataclasses.field(default_factory=list)
    code_blocks: list[CodeBlock] = dataclasses.field(default_factory=list)
    links: list[tuple[int, str]] = dataclasses.field(default_factory=list)
    section_headings: list[str] = dataclasses.field(default_factory=list)


def is_closing_fence(line: str, fence: str) -> bool:
    stripped = line.strip()
    return len(stripped) >= len(fence) and set(stripped) == {fence[0]}


def separator_cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def separator_alignments(separator: list[str]) -> list[str]:
    return [DASH_RUN_PATTERN.sub("-", cell) for cell in separator]


def code_spans(line: str) -> list[str]:
    return [code_span for _, code_span in CODE_SPAN_PATTERN.findall(line)]


def parse(path: pathlib.Path) -> Document:
    document = Document(path)
    fence = None
    code_block = CodeBlock(0, "")
    table = None
    lines = path.read_text(encoding="utf-8-sig").splitlines()

    for number, line in enumerate(lines, start=1):
        if fence:
            if is_closing_fence(line, fence):
                fence = None
            else:
                code_block.lines.append(line)

            continue

        fence_match = FENCE_PATTERN.match(line)

        if fence_match:
            fence = fence_match.group(1)
            fence_words = line[fence_match.end() :].split()
            code_block = CodeBlock(
                number, fence_words[0].lower() if fence_words else ""
            )
            document.code_blocks.append(code_block)
            table = None
            document.outline.append(("code block", number))
            continue

        if line.lstrip().startswith("|"):
            if table is None:
                table = Table(number)
                document.tables.append(table)
                document.outline.append(("table", number))

            if (
                len(table.rows) == 1
                and not table.separator
                and TABLE_SEPARATOR_PATTERN.match(line)
            ):
                table.separator = separator_cells(line)
            else:
                table.rows.append((number, code_spans(line)))
        else:
            table = None

        heading_match = HEADING_PATTERN.match(line)

        if heading_match:
            document.outline.append(
                (f"{heading_match.group(1)} heading", number)
            )

            if heading_match.group(1) == SECTION_HEADING_LEVEL:
                document.section_headings.append(
                    line[heading_match.end() :].strip()
                )

        text_without_code = CODE_SPAN_PATTERN.sub("", line)
        document.links.extend(
            (number, url) for url in LINK_PATTERN.findall(text_without_code)
        )
        reference_match = REFERENCE_LINK_PATTERN.match(line)

        if reference_match:
            document.links.append((number, reference_match.group(1)))

    return document


def compare_outline(canonical: Document, translation: Document) -> list[str]:
    for index, (expected, actual) in enumerate(
        zip(canonical.outline, translation.outline)
    ):
        if expected[0] != actual[0]:
            return [
                (
                    f"{translation.path.name}:{actual[1]}: "
                    f"element {index + 1} is {actual[0]}, "
                    f"{canonical.path.name}:{expected[1]} has {expected[0]}"
                ),
            ]

    if len(canonical.outline) != len(translation.outline):
        return [
            (
                f"{translation.path.name}: "
                f"{len(translation.outline)} elements, "
                f"{canonical.path.name} has {len(canonical.outline)}"
            ),
        ]

    return []


def compare_table_structure(
    canonical: Document, translation: Document
) -> list[str]:
    differences = []

    for expected, actual in zip(canonical.tables, translation.tables):
        if len(expected.rows) != len(actual.rows):
            differences.append(
                f"{translation.path.name}:{actual.number}: "
                f"table has {len(actual.rows)} rows, "
                f"{canonical.path.name}:{expected.number} has "
                f"{len(expected.rows)}",
            )

        if separator_alignments(expected.separator) != separator_alignments(
            actual.separator
        ):
            differences.append(
                f"{translation.path.name}:{actual.number}: "
                f"table separator {actual.separator}, "
                f"{canonical.path.name}:{expected.number} has "
                f"{expected.separator}",
            )

    return differences


def compare_table_code_spans(
    canonical: Document, translation: Document
) -> list[str]:
    return [
        (
            f"{translation.path.name}:{number}: row code spans "
            f"{actual_code_spans}, "
            f"{canonical.path.name} has {expected_code_spans}"
        )
        for expected, actual in zip(canonical.tables, translation.tables)
        for (_, expected_code_spans), (number, actual_code_spans) in zip(
            expected.rows, actual.rows
        )
        if expected_code_spans != actual_code_spans
    ]


def compare_code_languages(
    canonical: Document, translation: Document
) -> list[str]:
    return [
        (
            f"{translation.path.name}:{actual.number}: "
            f"code block language '{actual.language}', "
            f"{canonical.path.name}:{expected.number} has "
            f"'{expected.language}'"
        )
        for expected, actual in zip(
            canonical.code_blocks, translation.code_blocks
        )
        if expected.language != actual.language
    ]


def line_range(code_block: CodeBlock, start: int, end: int) -> str:
    first = code_block.number + start + 1
    last = code_block.number + end

    if last <= first:
        return str(first)

    return f"{first}-{last}"


def compare_code_block_lines(
    canonical: Document, translation: Document
) -> list[str]:
    differences = []

    for expected, actual in zip(
        canonical.code_blocks, translation.code_blocks
    ):
        matcher = difflib.SequenceMatcher(
            None, expected.lines, actual.lines, autojunk=False
        )

        for (
            tag,
            expected_start,
            expected_end,
            actual_start,
            actual_end,
        ) in matcher.get_opcodes():
            if tag == "equal":
                continue

            header = (
                f"{translation.path.name}:"
                f"{line_range(actual, actual_start, actual_end)}: "
                f"code block differs from {canonical.path.name}:"
                f"{line_range(expected, expected_start, expected_end)}"
            )
            differences.append(
                "\n".join(
                    [
                        header,
                        *(
                            f"- {line}"
                            for line in expected.lines[
                                expected_start:expected_end
                            ]
                        ),
                        *(
                            f"+ {line}"
                            for line in actual.lines[actual_start:actual_end]
                        ),
                    ]
                )
            )

    return differences


def link_target(url: str) -> str:
    if URL_SCHEME_PATTERN.match(url):
        return url

    return url.partition("#")[0]


def compare_links(canonical: Document, translation: Document) -> list[str]:
    expected_urls = [url for _, url in canonical.links]
    actual_urls = [url for _, url in translation.links]

    differences = [
        (
            f"{translation.path.name}:{number}: link '{actual}', "
            f"{canonical.path.name} has '{expected}'"
        )
        for expected, (number, actual) in zip(expected_urls, translation.links)
        if link_target(expected) != link_target(actual)
    ]

    if len(expected_urls) != len(actual_urls):
        return differences[:1] + [
            (
                f"{translation.path.name}: {len(actual_urls)} links, "
                f"{canonical.path.name} has {len(expected_urls)}"
            ),
        ]

    return differences


def check_section_headings(document: Document) -> list[str]:
    expected = SECTION_HEADINGS.get(document.path.name)

    if expected is None:
        return []

    missing = [
        heading
        for heading in expected
        if heading not in document.section_headings
    ]

    if missing:
        return [
            (
                f"{document.path.name}: missing section headings "
                f"{[f'{SECTION_HEADING_LEVEL} {heading}' for heading in missing]}"
                f", its {SECTION_HEADING_LEVEL} headings are "
                f"{document.section_headings}"
            ),
        ]

    present = [
        heading for heading in document.section_headings if heading in expected
    ]

    if present != list(expected):
        return [
            (
                f"{document.path.name}: section headings in order {present}, "
                f"expected {list(expected)}"
            ),
        ]

    return []


def compare_structure(canonical: Document, translation: Document) -> list[str]:
    outline_differences = compare_outline(canonical, translation)

    if outline_differences:
        return outline_differences

    return compare_table_structure(
        canonical, translation
    ) + compare_code_languages(canonical, translation)


def compare_content(canonical: Document, translation: Document) -> list[str]:
    return (
        compare_table_code_spans(canonical, translation)
        + compare_links(canonical, translation)
        + compare_code_block_lines(canonical, translation)
    )


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8")

    program_name = pathlib.Path(__file__).name

    if not MINIMUM_ARGUMENT_COUNT <= len(sys.argv) <= MAXIMUM_ARGUMENT_COUNT:
        print(
            f"usage: {program_name} <directory> [canonical]",
            file=sys.stderr,
        )
        return EXIT_USAGE

    directory = pathlib.Path(sys.argv[1]).expanduser().resolve()

    if not directory.is_dir():
        print(
            f"{program_name}: error: {directory}: not a directory",
            file=sys.stderr,
        )
        return EXIT_USAGE

    canonical_name = (
        sys.argv[2]
        if len(sys.argv) == MAXIMUM_ARGUMENT_COUNT
        else DEFAULT_CANONICAL_NAME
    )
    canonical_path = directory / canonical_name

    if not canonical_path.is_file():
        print(
            f"{program_name}: error: {canonical_path}: not a file",
            file=sys.stderr,
        )
        return EXIT_USAGE

    translation_paths = sorted(
        path
        for path in directory.glob(README_GLOB)
        if path.name != canonical_name
    )

    if not translation_paths:
        print(
            f"{program_name}: error: {directory}: no translated {README_GLOB}",
            file=sys.stderr,
        )
        return EXIT_USAGE

    try:
        canonical = parse(canonical_path)
        translations = [parse(path) for path in translation_paths]
    except (OSError, UnicodeDecodeError) as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)
        return EXIT_USAGE

    structure_differences = [
        message
        for document in [canonical, *translations]
        for message in check_section_headings(document)
    ] + [
        message
        for translation in translations
        for message in compare_structure(canonical, translation)
    ]

    for message in structure_differences:
        print(message)

    if structure_differences:
        return EXIT_STRUCTURE_DIFFERENCE

    content_differences = [
        message
        for translation in translations
        for message in compare_content(canonical, translation)
    ]

    for message in content_differences:
        print(message)

    if content_differences:
        return EXIT_CONTENT_DIFFERENCE

    print(f"ok: {directory.name}")
    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.exit(main())
