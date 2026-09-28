import argparse
import json
import pathlib
import sys

from read_inputs import INPUT_PLACEHOLDER
from resolve_metric import (
    MACHINE_DISTANCE_METRICS,
    METRICS,
    OUTPUT_KINDS,
    PUBLISHED_SCORE_METRICS,
)

EXIT_SUCCESS = 0
EXIT_INVALID = 1
EXIT_USAGE = 2
PUBLISHED_SAMPLE_CAP = 300
DISTANCE_SAMPLE_MINIMUM = 20
PERSON_JUDGED_SAMPLE_MINIMUM = 1
PUBLISHED_SCORE = "published_score"
MACHINE_DISTANCE = "machine_distance"
PERSON_JUDGED = "person_judged"
CHECK_NAMES = [
    "scorable",
    "published_score",
    "reproducible_dataset",
    "published_harness",
]
PUBLISHED_SCORE_CHECKS = [
    "published_score",
    "reproducible_dataset",
]
HUB_SOURCE = "huggingface"
FILES_SOURCE = "files"
DATASET_SOURCES = [HUB_SOURCE, FILES_SOURCE]


def derived_method(checks):
    if not checks["scorable"]:
        return PERSON_JUDGED

    if not all(checks[name] for name in PUBLISHED_SCORE_CHECKS):
        return MACHINE_DISTANCE

    return PUBLISHED_SCORE


def accuracy_problems(benchmark):
    accuracy = benchmark.get("accuracy")

    if not isinstance(accuracy, dict):
        return ["accuracy is missing"]

    checks = accuracy.get("checks")

    if not isinstance(checks, dict):
        return ["accuracy.checks is missing"]

    unanswered = [
        name for name in CHECK_NAMES if not isinstance(checks.get(name), bool)
    ]

    if unanswered:
        return [
            f"accuracy.checks needs true or false for {', '.join(unanswered)}"
        ]

    expected = derived_method(checks)

    if accuracy.get("method") != expected:
        return [
            (
                f"accuracy.method is {accuracy.get('method')!r} but "
                f"accuracy.checks give {expected!r}"
            )
        ]

    return []


def machines_problems(benchmark):
    if "machines" not in benchmark:
        return []

    machines = benchmark["machines"]

    if not isinstance(machines, list) or not machines:
        return ["machines must be a list holding at least one machine name"]

    if any(not isinstance(name, str) or not name for name in machines):
        return ["machines must hold non-empty machine names"]

    if len(set(machines)) != len(machines):
        return ["machines names the same machine more than once"]

    return []


def workflow_problems(benchmark):
    problems = []

    if not benchmark.get("workflow"):
        problems.append("workflow is empty")

    workflow_input = benchmark.get("workflow_input")

    if (
        not isinstance(workflow_input, dict)
        or INPUT_PLACEHOLDER not in workflow_input.values()
    ):
        problems.append(
            f"workflow_input needs one value of {INPUT_PLACEHOLDER!r}"
        )

    if "output_field" not in benchmark:
        problems.append(
            "output_field is missing; use null when the output itself is "
            "the text"
        )

    if benchmark.get("output_kind") not in OUTPUT_KINDS:
        problems.append(
            f"output_kind must be one of {', '.join(OUTPUT_KINDS)}"
        )

    if "metric" not in benchmark:
        problems.append(
            f"metric is missing; use null only for {PERSON_JUDGED}"
        )

    return problems


def dataset_problems(dataset):
    source = dataset.get("source")

    if source not in DATASET_SOURCES:
        return [f"dataset.source must be one of {', '.join(DATASET_SOURCES)}"]

    if source == FILES_SOURCE:
        return [] if dataset.get("path") else ["dataset.path is empty"]

    problems = [
        f"dataset.{key} is empty"
        for key in ("name", "split")
        if not dataset.get(key)
    ]

    if not isinstance(dataset.get("seed"), int):
        problems.append("dataset.seed must be an integer")

    return problems


def reported_field_problems(benchmark):
    dataset = benchmark.get("dataset") or {}
    problems = dataset_problems(dataset)

    if not (benchmark.get("checkpoint") or {}).get("id"):
        problems.append("checkpoint.id is empty")

    return problems


def package_name(requirement):
    return requirement.split("==", 1)[0].strip().lower().replace("_", "-")


def method_metric_problems(benchmark, method):
    kind = benchmark["output_kind"]
    metric = benchmark.get("metric")

    if method == PERSON_JUDGED:
        return (
            []
            if metric is None
            else [f"metric must be null for {PERSON_JUDGED}"]
        )

    if metric is None:
        return [f"{method} needs a metric"]

    name = metric.get("name")

    if method == PUBLISHED_SCORE:
        allowed = PUBLISHED_SCORE_METRICS.get(kind, ())

        if not allowed:
            return [f"{PUBLISHED_SCORE} has no scorer for {kind} output"]

        if name not in allowed:
            return [
                f"{PUBLISHED_SCORE} on {kind} output takes one of "
                f"{', '.join(allowed)}, not {name!r}; "
                "a metric outside this list has no scorer"
            ]
    elif name != MACHINE_DISTANCE_METRICS[kind]:
        return [
            f"{MACHINE_DISTANCE} on {kind} output takes metric "
            f"{MACHINE_DISTANCE_METRICS[kind]}, not {name!r}"
        ]

    return metric_problems(metric)


def metric_problems(metric):
    name = metric["name"]
    registered = METRICS[name]
    problems = []

    if not isinstance(metric.get("scale"), (int, float)):
        problems.append("metric.scale must be a number")

    if len(registered.keys) > 1 and metric.get("key") not in registered.keys:
        problems.append(
            f"metric.key must be one of {', '.join(registered.keys)} "
            f"for {name}"
        )

    requirements = metric.get("requirements") or []
    pinned = {
        package_name(requirement)
        for requirement in requirements
        if "==" in requirement
    }
    unpinned = [
        package
        for package in registered.packages
        if package_name(package) not in pinned
    ]

    if unpinned:
        problems.append(
            f"metric.requirements needs a pinned version of "
            f"{', '.join(unpinned)} for {name}"
        )

    return problems


def published_score_problems(benchmark):
    problems = []
    dataset = benchmark.get("dataset") or {}
    published = benchmark.get("published") or {}

    if dataset.get("source") != HUB_SOURCE:
        problems.append(
            f"{PUBLISHED_SCORE} needs dataset.source {HUB_SOURCE!r}"
        )

    for key in ("input_column", "reference_column"):
        if not dataset.get(key):
            problems.append(f"dataset.{key} is empty")

    if (
        not isinstance(dataset.get("sample_count"), int)
        or not 0 < dataset["sample_count"] <= PUBLISHED_SAMPLE_CAP
    ):
        problems.append(
            f"dataset.sample_count must be 1 to {PUBLISHED_SAMPLE_CAP} "
            f"for {PUBLISHED_SCORE}"
        )

    if (
        not published.get("score")
        or not published.get("source_url")
        or not isinstance(published.get("decimals"), int)
    ):
        problems.append(
            "published needs a nonzero score, decimals and source_url"
        )

    return problems


def unpublished_problems(benchmark, method):
    problems = []
    dataset = benchmark.get("dataset") or {}
    sample_minimum = (
        PERSON_JUDGED_SAMPLE_MINIMUM
        if method == PERSON_JUDGED
        else DISTANCE_SAMPLE_MINIMUM
    )

    if benchmark.get("published") is not None:
        problems.append(f"published must be null for {method}")

    if (
        not isinstance(dataset.get("sample_count"), int)
        or dataset["sample_count"] < sample_minimum
    ):
        problems.append(
            f"dataset.sample_count must be at least {sample_minimum} "
            f"for {method}"
        )

    return problems


def validation_problems(benchmark):
    problems = [
        *workflow_problems(benchmark),
        *machines_problems(benchmark),
        *accuracy_problems(benchmark),
    ]

    if problems:
        return problems

    method = benchmark["accuracy"]["method"]
    problems = [
        *reported_field_problems(benchmark),
        *method_metric_problems(benchmark, method),
    ]

    if method == PUBLISHED_SCORE:
        return [*problems, *published_score_problems(benchmark)]

    return [*problems, *unpublished_problems(benchmark, method)]


def main():
    program_name = pathlib.Path(__file__).name
    parser = argparse.ArgumentParser(prog=program_name)
    parser.add_argument("benchmark", type=pathlib.Path)
    arguments = parser.parse_args()

    try:
        benchmark = json.loads(arguments.benchmark.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(
            f"{program_name}: error: {arguments.benchmark}: {error}",
            file=sys.stderr,
        )

        return EXIT_USAGE

    problems = validation_problems(benchmark)

    for problem in problems:
        print(f"{program_name}: error: {problem}", file=sys.stderr)

    if problems:
        return EXIT_INVALID

    print(f"ok: {benchmark['accuracy']['method']}")

    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main())
