import argparse
import json
import pathlib
import sys

EXIT_SUCCESS = 0
EXIT_USAGE = 2

DATASET_URL = "https://huggingface.co/datasets/{name}"
CHECKPOINT_URL = "https://huggingface.co/{identifier}"
CHECKPOINT_REVISION_URL = "https://huggingface.co/{identifier}/tree/{revision}"
FILES_SOURCE = "files"
PERSON_JUDGED = "person_judged"
LANGUAGES = ("en", "ko", "zh-cn")
TEXT = {
    "en": {
        "heading": "### Measurement conditions",
        "header": "| Item | Value |",
        "Dataset": "Dataset",
        "Metric": "Metric",
        "Checkpoint": "Checkpoint",
        "Accuracy": "Accuracy",
        "Published score": "Published score",
        "files dataset": "{count} items written for this benchmark",
        "hub dataset": "{count} items from [{name}]({location}), seed {seed}",
        "person metric": "a person compared the outputs",
        "scaled": "scaled to {scale}",
        "normalized": "normalized by {normalizer}",
        "no published": (
            "no published score was compared; this checks equivalence "
            "between machines only"
        ),
        "source": "source",
        "methods": {
            "published_score": "published score",
            "machine_distance": "machine distance",
            PERSON_JUDGED: "person judged",
        },
    },
    "ko": {
        "heading": "### 측정 조건",
        "header": "| 항목 | 값 |",
        "Dataset": "데이터셋",
        "Metric": "지표",
        "Checkpoint": "체크포인트",
        "Accuracy": "정확도",
        "Published score": "공개 점수",
        "files dataset": "이 벤치마크를 위해 쓴 항목 {count}개",
        "hub dataset": "[{name}]({location})의 항목 {count}개, 시드 {seed}",
        "person metric": "사람이 출력을 직접 비교",
        "scaled": "{scale} 척도",
        "normalized": "{normalizer}로 정규화",
        "no published": "공개 점수와 비교하지 않았으며 기기 간 일치만 확인",
        "source": "출처",
        "methods": {
            "published_score": "공개 점수 비교",
            "machine_distance": "기기 간 거리",
            PERSON_JUDGED: "사람 판정",
        },
    },
    "zh-cn": {
        "heading": "### 测量条件",
        "header": "| 项目 | 值 |",
        "Dataset": "数据集",
        "Metric": "指标",
        "Checkpoint": "检查点",
        "Accuracy": "准确度",
        "Published score": "公开分数",
        "files dataset": "为本基准编写的 {count} 个条目",
        "hub dataset": "[{name}]({location}) 中的 {count} 个条目，种子 {seed}",
        "person metric": "由人工比较输出",
        "scaled": "缩放到 {scale}",
        "normalized": "由 {normalizer} 归一化",
        "no published": "未与公开分数比较，只检查设备之间是否一致",
        "source": "来源",
        "methods": {
            "published_score": "公开分数比较",
            "machine_distance": "设备间距离",
            PERSON_JUDGED: "人工判定",
        },
    },
}


def dataset_condition(dataset, text):
    if dataset.get("source") == FILES_SOURCE:
        return text["files dataset"].format(count=dataset["sample_count"])

    location = DATASET_URL.format(name=dataset["name"])
    parts = [dataset["name"]]

    if dataset.get("config"):
        parts.append(dataset["config"])

    parts.append(dataset["split"])

    return text["hub dataset"].format(
        count=dataset["sample_count"],
        name=" / ".join(parts),
        location=location,
        seed=dataset["seed"],
    )


def metric_condition(metric, location, text):
    if metric is None:
        return text["person metric"]

    parts = [
        f"[{metric['name']}]({location})",
        text["scaled"].format(scale=metric["scale"]),
    ]

    if metric.get("normalizer"):
        parts.append(
            text["normalized"].format(normalizer=metric["normalizer"])
        )

    parts += metric.get("requirements", [])

    return ", ".join(parts)


def checkpoint_condition(checkpoint):
    identifier = checkpoint["id"]
    revision = checkpoint.get("revision")

    if revision:
        location = CHECKPOINT_REVISION_URL.format(
            identifier=identifier, revision=revision
        )

        return f"[{identifier}@{revision}]({location})"

    return f"[{identifier}]({CHECKPOINT_URL.format(identifier=identifier)})"


def accuracy_condition(accuracy, text):
    return text["methods"].get(accuracy["method"], accuracy["method"])


def published_condition(published, text):
    if published is None:
        return text["no published"]

    return (
        f"{published['score']} ([{text['source']}]({published['source_url']}))"
    )


def render_conditions(benchmark, metric_url, text):
    metric = benchmark.get("metric")

    return [
        "",
        text["heading"],
        "",
        text["header"],
        "| :---: | --- |",
        (
            f"| {text['Dataset']} | "
            f"{dataset_condition(benchmark['dataset'], text)} |"
        ),
        (
            f"| {text['Metric']} | "
            f"{metric_condition(metric, metric_url, text)} |"
        ),
        (
            f"| {text['Checkpoint']} | "
            f"{checkpoint_condition(benchmark['checkpoint'])} |"
        ),
        (
            f"| {text['Accuracy']} | "
            f"{accuracy_condition(benchmark['accuracy'], text)} |"
        ),
        (
            f"| {text['Published score']} | "
            f"{published_condition(benchmark.get('published'), text)} |"
        ),
    ]


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
        help="The language of the README the block goes into.",
    )
    arguments = parser.parse_args()

    try:
        report = json.loads(arguments.report.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(
            f"{program_name}: error: {arguments.report}: {error}",
            file=sys.stderr,
        )

        return EXIT_USAGE

    try:
        lines = render_conditions(
            report["benchmark"], report["metric_url"], TEXT[arguments.language]
        )
    except KeyError as error:
        print(
            f"{program_name}: error: the report has no {error}",
            file=sys.stderr,
        )

        return EXIT_USAGE

    for line in lines:
        print(line)

    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main())
