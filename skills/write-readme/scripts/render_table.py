import argparse
import json
import math
import pathlib
import statistics
import sys

EXIT_SUCCESS = 0
EXIT_INVALID_REPORT = 1
EXIT_USAGE = 2

SIGNIFICANT_FIGURES = 3
SECONDS_PER_MINUTE = 60.0
MILLISECONDS_PER_SECOND = 1000.0
MINUTE_THRESHOLD_SECONDS = 600.0
BYTES_PER_MEBIBYTE = 1024.0**2
BYTES_PER_GIBIBYTE = 1024.0**3
MISSING = "—"
MACHINES_FILE = (
    pathlib.Path(__file__).resolve().parent.parent / "assets" / "machines.json"
)
THROUGHPUT_COLUMNS = [
    ("real_time_factor", "RTF"),
    ("output_real_time_factor", "Output RTF"),
    ("output_tokens_per_second", "Tokens/s"),
    ("output_characters_per_second", "Characters/s"),
]
CHARACTER_COLUMN = "output_characters_per_second"
TOKEN_COLUMN = "output_tokens_per_second"
CONDITION_COLUMNS = [
    ("runtime", "Runtime"),
    ("build", "Build"),
    ("numerics", "Numerics"),
]
LANGUAGES = ("en", "ko", "zh-cn")
TEXT = {
    "en": {
        "Machine": "Machine",
        "Runtime": "Runtime",
        "Build": "Build",
        "Numerics": "Numerics",
        "Items": "Items",
        "Cold start": "Cold start ({unit})",
        "First output": "First output per item ({unit})",
        "End to end": "End to end per item ({unit})",
        "Total": "Total ({unit})",
        "RTF": "RTF",
        "Output RTF": "Output RTF",
        "Tokens/s": "Tokens/s",
        "Characters/s": "Characters/s",
        "Peak VRAM": "Peak VRAM ({unit})",
        "Peak RSS": "Peak RSS ({unit})",
        "Ratio": "vs {machine}",
        "Accuracy": "Accuracy",
        "Verdict": "Verdict",
        "baseline": "baseline",
        "pass": "pass",
        "fail": "fail",
        "medians": (
            "Per-item figures are medians; the total runs from ready to the "
            "last item."
        ),
        "ratio": (
            "The ratio divides each row's end to end per item by the fastest "
            "row's."
        ),
        "item counts": (
            "Rows ran different numbers of items, so the total is not "
            "comparable across rows."
        ),
        "mixed": (
            "Rows also differ in {names}, so the speed gap is not hardware "
            "alone."
        ),
        "blank throughput": (
            "A blank throughput cell means that machine's result recorded no "
            "such length."
        ),
        "blank memory": (
            "A blank VRAM cell means the runner could not read that machine's "
            "accelerator, not that the run used none."
        ),
        "unified": (
            "{machines} shares one memory pool between processor and "
            "accelerator, so its VRAM and RSS peaks count the same bytes "
            "twice."
        ),
        "unified plural": (
            "{machines} each share one memory pool between processor and "
            "accelerator, so their VRAM and RSS peaks count the same bytes "
            "twice."
        ),
    },
    "ko": {
        "Machine": "기기",
        "Runtime": "런타임",
        "Build": "빌드",
        "Numerics": "수치 형식",
        "Items": "항목 수",
        "Cold start": "콜드 스타트 ({unit})",
        "First output": "항목당 첫 출력 ({unit})",
        "End to end": "항목당 전체 ({unit})",
        "Total": "합계 ({unit})",
        "RTF": "RTF",
        "Output RTF": "출력 RTF",
        "Tokens/s": "토큰/s",
        "Characters/s": "글자/s",
        "Peak VRAM": "최대 VRAM ({unit})",
        "Peak RSS": "최대 RSS ({unit})",
        "Ratio": "{machine} 대비",
        "Accuracy": "정확도",
        "Verdict": "판정",
        "baseline": "기준",
        "pass": "통과",
        "fail": "미통과",
        "medians": (
            "항목당 값은 중앙값이며 합계는 준비 완료 시점부터 "
            "마지막 항목까지의 시간입니다."
        ),
        "ratio": (
            "비율은 각 행의 항목당 전체 시간을 가장 빠른 행의 값으로 "
            "나눈 것입니다."
        ),
        "item counts": (
            "행마다 실행한 항목 수가 달라 합계는 행끼리 비교할 수 없습니다."
        ),
        "mixed": (
            "속도 차이에는 행마다 다른 {names}의 영향이 "
            "하드웨어 차이와 함께 섞여 있습니다."
        ),
        "blank throughput": (
            "빈 처리량 칸은 그 기기의 결과에 "
            "해당 길이가 기록되지 않았다는 뜻입니다."
        ),
        "blank memory": (
            "빈 VRAM 칸은 러너가 그 기기의 가속기를 읽지 못했다는 "
            "뜻입니다. 사용량이 0이었다는 뜻은 아닙니다."
        ),
        "unified": (
            "{machines}에서는 프로세서와 가속기가 메모리 하나를 "
            "함께 쓰므로 VRAM과 RSS 최대값에 같은 바이트가 "
            "두 번 들어갑니다."
        ),
        "unified plural": (
            "{machines}에서는 프로세서와 가속기가 메모리 하나를 "
            "함께 쓰므로 VRAM과 RSS 최대값에 같은 바이트가 "
            "두 번 들어갑니다."
        ),
    },
    "zh-cn": {
        "Machine": "设备",
        "Runtime": "运行时",
        "Build": "构建",
        "Numerics": "数值格式",
        "Items": "条目数",
        "Cold start": "冷启动 ({unit})",
        "First output": "单项首个输出 ({unit})",
        "End to end": "单项端到端 ({unit})",
        "Total": "总计 ({unit})",
        "RTF": "RTF",
        "Output RTF": "输出 RTF",
        "Tokens/s": "令牌/s",
        "Characters/s": "字符/s",
        "Peak VRAM": "峰值 VRAM ({unit})",
        "Peak RSS": "峰值 RSS ({unit})",
        "Ratio": "相对 {machine}",
        "Accuracy": "准确度",
        "Verdict": "判定",
        "baseline": "基准",
        "pass": "通过",
        "fail": "未通过",
        "medians": "单项数值为中位数，总计为从就绪到最后一个条目的时间。",
        "ratio": "比值为各行单项端到端时间除以最快一行的值。",
        "item counts": "各行运行的条目数不同，因此总计不能在行之间比较。",
        "mixed": "速度差异中除硬件外，还混有各行不同的{names}的影响。",
        "blank throughput": "吞吐量为空表示该设备的结果未记录此长度。",
        "blank memory": (
            "VRAM 为空表示运行器无法读取该设备的加速器，并不代表未使用显存。"
        ),
        "unified": (
            "{machines} 的处理器与加速器共用同一内存池，"
            "因此其 VRAM 与 RSS 峰值会把同一部分内存计算两次。"
        ),
        "unified plural": (
            "{machines} 的处理器与加速器各自共用同一内存池，"
            "因此其 VRAM 与 RSS 峰值会把同一部分内存计算两次。"
        ),
    },
}


def to_significant_figures(value):
    if value == 0:
        return "0"

    exponent = math.floor(math.log10(abs(value)))
    decimals = max(0, SIGNIFICANT_FIGURES - 1 - exponent)

    return f"{value:.{decimals}f}"


def choose_time_unit(values_in_seconds):
    present = [value for value in values_in_seconds if value is not None]

    if not present:
        return "s", 1.0

    median = statistics.median(present)

    if median < 1.0:
        return "ms", MILLISECONDS_PER_SECOND

    if median < MINUTE_THRESHOLD_SECONDS:
        return "s", 1.0

    return "min", 1.0 / SECONDS_PER_MINUTE


def choose_memory_unit(values_in_bytes):
    present = [value for value in values_in_bytes if value]

    if not present or statistics.median(present) < BYTES_PER_GIBIBYTE:
        return "MiB", 1.0 / BYTES_PER_MEBIBYTE

    return "GiB", 1.0 / BYTES_PER_GIBIBYTE


def read_metric(source, *keys):
    value = source

    for key in keys:
        if not isinstance(value, dict):
            return None

        value = value.get(key)

    return value if isinstance(value, (int, float)) else None


def build_rows(machines, display_names):
    rows = []

    for machine, measured in machines.items():
        conditions = measured.get("conditions", {})
        accuracy = measured.get("accuracy") or {}
        rows.append(
            {
                "machine": display_names[machine],
                "conditions": {
                    key: conditions.get(key) or MISSING
                    for key, _ in CONDITION_COLUMNS
                },
                "item_count": read_metric(measured, "item_count"),
                "cold_start_seconds": read_metric(
                    measured, "cold_start_seconds"
                ),
                "time_to_first_output_seconds": read_metric(
                    measured, "item_time_to_first_output_seconds", "median"
                ),
                "end_to_end_seconds": read_metric(
                    measured, "item_end_to_end_seconds", "median"
                ),
                "total_seconds": read_metric(measured, "total_seconds"),
                "throughput": {
                    key: read_metric(measured, "throughput", key)
                    for key, _ in THROUGHPUT_COLUMNS
                },
                "peak_video_memory_bytes": read_metric(
                    measured, "vram", "peak_bytes"
                ),
                "peak_resident_bytes": read_metric(
                    measured, "rss", "peak_bytes"
                ),
                "unified_memory": conditions.get("unified_memory") is True,
                "score": read_metric(accuracy, "local_score"),
                "verdict": accuracy.get("verdict", MISSING),
            }
        )

    return sorted(rows, key=lambda row: row["end_to_end_seconds"] or math.inf)


def varying_item_counts(rows):
    return len({row["item_count"] for row in rows}) > 1


def varying_conditions(rows):
    return [
        (key, header)
        for key, header in CONDITION_COLUMNS
        if len({row["conditions"][key] for row in rows}) > 1
    ]


def throughput_columns(rows):
    present = [
        (key, header)
        for key, header in THROUGHPUT_COLUMNS
        if any(row["throughput"][key] is not None for row in rows)
    ]
    has_tokens = any(key == TOKEN_COLUMN for key, _ in present)

    return [
        (key, header)
        for key, header in present
        if not (key == CHARACTER_COLUMN and has_tokens)
    ]


def format_value(value, scale=1.0):
    return MISSING if value is None else to_significant_figures(value * scale)


def format_ratio(value, baseline):
    if value is None or not baseline:
        return MISSING

    return f"{to_significant_figures(value / baseline)}×"


def translate_verdict(verdict, text):
    return text.get(verdict, verdict) if verdict != MISSING else MISSING


def render_table(rows, conditions, show_accuracy, text):
    cold_unit, cold_scale = choose_time_unit(
        [row["cold_start_seconds"] for row in rows]
    )
    first_unit, first_scale = choose_time_unit(
        [row["time_to_first_output_seconds"] for row in rows]
    )
    end_unit, end_scale = choose_time_unit(
        [row["end_to_end_seconds"] for row in rows]
    )
    total_unit, total_scale = choose_time_unit(
        [row["total_seconds"] for row in rows]
    )
    video_unit, video_scale = choose_memory_unit(
        [row["peak_video_memory_bytes"] for row in rows]
    )
    resident_unit, resident_scale = choose_memory_unit(
        [row["peak_resident_bytes"] for row in rows]
    )
    throughput = throughput_columns(rows)
    show_item_count = varying_item_counts(rows)

    baseline = rows[0]
    baseline_seconds = baseline["end_to_end_seconds"]

    headers = [
        text["Machine"],
        *[text[header] for _, header in conditions],
        *([text["Items"]] if show_item_count else []),
        text["Cold start"].format(unit=cold_unit),
        text["First output"].format(unit=first_unit),
        text["End to end"].format(unit=end_unit),
        text["Total"].format(unit=total_unit),
        *[text[header] for _, header in throughput],
        text["Peak VRAM"].format(unit=video_unit),
        text["Peak RSS"].format(unit=resident_unit),
        text["Ratio"].format(machine=baseline["machine"]),
    ]

    if show_accuracy:
        headers += [text["Accuracy"], text["Verdict"]]

    lines = [
        "| " + " | ".join(headers) + " |",
        "| :---: |" + " --- |" * (len(headers) - 1),
    ]

    for row in rows:
        cells = [
            row["machine"],
            *[row["conditions"][key] for key, _ in conditions],
            *(
                [
                    MISSING
                    if row["item_count"] is None
                    else str(row["item_count"])
                ]
                if show_item_count
                else []
            ),
            format_value(row["cold_start_seconds"], cold_scale),
            format_value(row["time_to_first_output_seconds"], first_scale),
            format_value(row["end_to_end_seconds"], end_scale),
            format_value(row["total_seconds"], total_scale),
            *[format_value(row["throughput"][key]) for key, _ in throughput],
            format_value(row["peak_video_memory_bytes"], video_scale),
            format_value(row["peak_resident_bytes"], resident_scale),
            format_ratio(row["end_to_end_seconds"], baseline_seconds),
        ]

        if show_accuracy:
            cells += [
                format_value(row["score"]),
                translate_verdict(row["verdict"], text),
            ]

        lines.append("| " + " | ".join(cells) + " |")

    return lines


def render_notes(rows, conditions, text):
    notes = ["", text["medians"], text["ratio"]]

    if varying_item_counts(rows):
        notes.append(text["item counts"])

    if conditions:
        names = ", ".join(text[header] for _, header in conditions)
        notes.append(text["mixed"].format(names=names))

    columns = throughput_columns(rows)

    if any(
        row["throughput"][key] is None for row in rows for key, _ in columns
    ):
        notes.append(text["blank throughput"])

    if any(not row["peak_video_memory_bytes"] for row in rows):
        notes.append(text["blank memory"])

    unified = [row["machine"] for row in rows if row["unified_memory"]]

    if unified:
        key = "unified plural" if len(unified) > 1 else "unified"
        notes.append(text[key].format(machines=", ".join(unified)))

    return notes


def main():
    program_name = pathlib.Path(__file__).name
    parser = argparse.ArgumentParser(prog=program_name)
    parser.add_argument(
        "report",
        type=pathlib.Path,
        help="The JSON that analyze-model's validate_results.py printed.",
    )
    parser.add_argument(
        "--language",
        choices=LANGUAGES,
        default="en",
        help="The language of the README the table goes into.",
    )
    arguments = parser.parse_args()
    text = TEXT[arguments.language]

    try:
        report = json.loads(arguments.report.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(
            f"{program_name}: error: {arguments.report}: {error}",
            file=sys.stderr,
        )

        return EXIT_USAGE

    try:
        display_names = json.loads(MACHINES_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(
            f"{program_name}: error: {MACHINES_FILE}: {error}",
            file=sys.stderr,
        )

        return EXIT_USAGE

    machines = report.get("machines") or {}
    unnamed = [machine for machine in machines if machine not in display_names]

    if unnamed:
        print(
            f"{program_name}: error: {MACHINES_FILE} has no display name for "
            f"{', '.join(unnamed)}",
            file=sys.stderr,
        )

        return EXIT_USAGE

    rows = build_rows(machines, display_names)

    if not rows:
        print(
            f"{program_name}: error: the report carries no machines",
            file=sys.stderr,
        )

        return EXIT_INVALID_REPORT

    show_accuracy = any(
        row["score"] is not None or row["verdict"] != MISSING for row in rows
    )
    conditions = varying_conditions(rows)

    for line in render_table(
        rows, conditions, show_accuracy, text
    ) + render_notes(rows, conditions, text):
        print(line)

    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main())
