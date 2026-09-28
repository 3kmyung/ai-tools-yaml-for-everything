import argparse
import json
import pathlib
import sys

EXIT_SUCCESS = 0
EXIT_USAGE = 2
EXIT_UNTRANSLATED = 3

BENCHMARK_FILE = "benchmark.json"
UNMEASURED_DIRECTORY = "unmeasured"
MACHINES_FILE = (
    pathlib.Path(__file__).resolve().parent.parent / "assets" / "machines.json"
)
SOURCE_LANGUAGE = "en"
LANGUAGES = ("en", "ko", "zh-cn")
TEXT = {
    "en": {
        "unmeasured": "{machine} was not measured. {reason}",
        "methods": {
            "machine_distance": (
                "Accuracy was only checked as agreement between machines, "
                "and no published score was compared."
            ),
            "published_score": (
                "Accuracy was compared with the published score in "
                "Measurement conditions."
            ),
            "person_judged": (
                "Accuracy was judged by a person comparing outputs, and no "
                "metric was computed."
            ),
        },
    },
    "ko": {
        "unmeasured": "{machine} 기기는 측정하지 못했습니다. {reason}",
        "methods": {
            "machine_distance": (
                "정확도는 기기 간 일치로만 확인했으며 공개 점수와는 "
                "비교하지 않았습니다."
            ),
            "published_score": (
                "정확도는 측정 조건에 적힌 공개 점수와 비교했습니다."
            ),
            "person_judged": (
                "정확도는 사람이 출력을 비교해 판정했으며 지표는 "
                "계산하지 않았습니다."
            ),
        },
    },
    "zh-cn": {
        "unmeasured": "{machine} 未能测量。{reason}",
        "methods": {
            "machine_distance": (
                "准确度仅检查了设备之间是否一致，未与公开分数比较。"
            ),
            "published_score": "准确度已与测量条件中列出的公开分数比较。",
            "person_judged": "准确度由人工比较输出判定，未计算指标。",
        },
    },
}


class LimitsError(Exception):
    def __init__(self, message, exit_code):
        super().__init__(message)
        self.exit_code = exit_code


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise LimitsError(f"{path}: {error}", EXIT_USAGE) from error


def translated_reason(path, unmeasured, language):
    if language == SOURCE_LANGUAGE:
        reason = unmeasured.get("reason")
    else:
        reason = (unmeasured.get("reasons") or {}).get(language)

    if reason:
        return reason.strip()

    if language == SOURCE_LANGUAGE:
        raise LimitsError(f"{path} has no reason", EXIT_USAGE)

    raise LimitsError(
        f"{path} has no reasons.{language}, the translation of its reason",
        EXIT_UNTRANSLATED,
    )


def unmeasured_lines(analysis_directory, display_names, text, language):
    lines = []
    paths = sorted(
        (analysis_directory / UNMEASURED_DIRECTORY).glob("*.json")
    )

    for path in paths:
        unmeasured = read_json(path)
        machine = unmeasured.get("machine") or path.stem

        if machine not in display_names:
            raise LimitsError(
                f"{MACHINES_FILE} has no display name for {machine}",
                EXIT_USAGE,
            )

        lines.append(
            text["unmeasured"].format(
                machine=display_names[machine],
                reason=translated_reason(path, unmeasured, language),
            )
        )

    return lines


def accuracy_line(analysis_directory, text):
    benchmark_path = analysis_directory / BENCHMARK_FILE
    benchmark = read_json(benchmark_path)
    method = (benchmark.get("accuracy") or {}).get("method")

    if method not in text["methods"]:
        raise LimitsError(
            f"{benchmark_path} has an unknown accuracy.method {method!r}",
            EXIT_USAGE,
        )

    return text["methods"][method]


def render_limits(analysis_directory, language):
    text = TEXT[language]
    display_names = read_json(MACHINES_FILE)

    return [
        *unmeasured_lines(analysis_directory, display_names, text, language),
        accuracy_line(analysis_directory, text),
    ]


def main():
    program_name = pathlib.Path(__file__).name
    parser = argparse.ArgumentParser(prog=program_name)
    parser.add_argument(
        "analysis_directory",
        type=pathlib.Path,
        help="workspaces/<example>/analysis",
    )
    parser.add_argument(
        "--language",
        choices=LANGUAGES,
        default=SOURCE_LANGUAGE,
        help="The language of the README the lines go into.",
    )
    arguments = parser.parse_args()

    try:
        lines = render_limits(
            arguments.analysis_directory, arguments.language
        )
    except LimitsError as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)

        return error.exit_code

    for line in lines:
        print(line)

    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main())
