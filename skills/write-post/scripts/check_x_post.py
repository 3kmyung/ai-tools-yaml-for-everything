import argparse
import pathlib
import sys
import unicodedata

import regex

EXIT_SUCCESS = 0
EXIT_THREAD_REJECTED = 1
EXIT_USAGE = 2
WEIGHTED_LIMIT = 280
URL_WEIGHT = 23
DEFAULT_WEIGHT = 2
HALF_WEIGHT = 1
EMOJI_WEIGHT = 2
HALF_WEIGHT_RANGES = [
    (0x0000, 0x10FF),
    (0x2000, 0x200D),
    (0x2010, 0x201F),
    (0x2032, 0x2037),
]
TRAILING_PUNCTUATION = ".,;:!?'\"‘’“”"
VARIATION_SELECTOR = chr(0xFE0F)
COMBINING_ENCLOSING_KEYCAP = chr(0x20E3)
MAXIMUM_LABEL_LENGTH = 32
GENERIC_TOP_LEVEL_DOMAINS = {
    "app", "biz", "blog", "cloud", "com", "dev", "edu", "gov", "info", "int",
    "mil", "net", "news", "online", "org", "site", "store", "tech", "wiki",
    "xyz",
}
URL_PATH_CHARACTERS = r"[\w\-./%#?=&:~+@,;!$()]"
URL_PATTERN = regex.compile(
    rf"(?<![\w@.])(?:https?://)?[\w-]+(?:\.[\w-]+)*"
    rf"\.[A-Za-z][\w-]*(?:[/?#]{URL_PATH_CHARACTERS}*)?"
)
HOST_PATTERN = regex.compile(r"(?:https?://)?(?P<host>[^/?#]*)")
KEYCAP_PATTERN = regex.compile(
    f"[#*0-9]{VARIATION_SELECTOR}?{COMBINING_ENCLOSING_KEYCAP}"
)
FLAG_PATTERN = regex.compile(r"\p{Regional_Indicator}{2}")
EMOJI_MODIFIER_SEQUENCE_PATTERN = regex.compile(
    r"\p{Emoji_Modifier_Base}\p{Emoji_Modifier}"
)
EMOJI_PRESENTATION_PATTERN = regex.compile(r"\p{Emoji_Presentation}")
GRAPHEME_PATTERN = regex.compile(r"\X")


def code_point_weight(code_point):
    for start, end in HALF_WEIGHT_RANGES:
        if start <= code_point <= end:
            return HALF_WEIGHT

    return DEFAULT_WEIGHT


def is_emoji(grapheme):
    if KEYCAP_PATTERN.fullmatch(grapheme) or FLAG_PATTERN.fullmatch(grapheme):
        return True

    if VARIATION_SELECTOR in grapheme:
        return True

    if EMOJI_MODIFIER_SEQUENCE_PATTERN.match(grapheme):
        return True

    return bool(EMOJI_PRESENTATION_PATTERN.match(grapheme))


def grapheme_weight(grapheme):
    if is_emoji(grapheme):
        return EMOJI_WEIGHT

    return sum(code_point_weight(ord(character)) for character in grapheme)


def strip_trailing_punctuation(url):
    while url:
        if url[-1] in TRAILING_PUNCTUATION:
            url = url[:-1]
        elif url[-1] == ")" and url.count("(") < url.count(")"):
            url = url[:-1]
        else:
            break

    return url


def has_oversized_label(url):
    host = HOST_PATTERN.match(url).group("host")

    return any(len(label) > MAXIMUM_LABEL_LENGTH for label in host.split("."))


def has_known_top_level_domain(url):
    host = HOST_PATTERN.match(url).group("host")
    top_level_domain = host.rsplit(".", 1)[-1].lower()

    return (
        len(top_level_domain) == 2
        or top_level_domain in GENERIC_TOP_LEVEL_DOMAINS
    )


def weighted_length(text):
    normalized = unicodedata.normalize("NFC", text)
    without_urls = []
    url_count = 0
    position = 0

    for match in URL_PATTERN.finditer(normalized):
        url = strip_trailing_punctuation(match.group())

        if (
            not url
            or has_oversized_label(url)
            or not has_known_top_level_domain(url)
        ):
            continue

        without_urls.append(normalized[position:match.start()])
        url_count += 1
        position = match.start() + len(url)

    without_urls.append(normalized[position:])
    graphemes = GRAPHEME_PATTERN.findall("".join(without_urls))
    weight = sum(grapheme_weight(grapheme) for grapheme in graphemes)

    return weight + url_count * URL_WEIGHT


def main():
    program_name = pathlib.Path(__file__).name
    parser = argparse.ArgumentParser(prog=program_name)
    parser.add_argument("posts", nargs="*", type=pathlib.Path)
    arguments = parser.parse_args()

    if not arguments.posts:
        print(
            f"{program_name}: error: pass one file per post, in thread order",
            file=sys.stderr,
        )

        return EXIT_USAGE

    failures = []

    for number, path in enumerate(arguments.posts, start=1):
        try:
            text = path.read_text(encoding="utf-8-sig").rstrip()
        except (OSError, UnicodeDecodeError) as error:
            print(f"{program_name}: error: {path}: {error}", file=sys.stderr)

            return EXIT_USAGE

        length = weighted_length(text)

        print(f"{number}. {path}: {length}/{WEIGHTED_LIMIT}")

        if length > WEIGHTED_LIMIT:
            failures.append(
                f"post {number} is {length - WEIGHTED_LIMIT} "
                "weighted characters over the limit"
            )

    for failure in failures:
        print(failure, file=sys.stderr)

    return EXIT_THREAD_REJECTED if failures else EXIT_SUCCESS


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    sys.stderr.reconfigure(encoding="utf-8", line_buffering=True)
    sys.exit(main())
