import argparse
import json
import pathlib
import sys

from check_benchmark import PERSON_JUDGED, PUBLISHED_SCORE, validation_problems
from read_inputs import read_benchmark, read_inputs
from resolve_metric import TEXT, MetricError, load_scorer
from save_outputs import read_output_records
from select_output import select_field, text_of

EXIT_PASS = 0
EXIT_NOT_PASSED = 1
EXIT_USAGE = 2
PUBLISHED_HARNESS_TOLERANCE = 0.05
UNPUBLISHED_HARNESS_TOLERANCE = 0.10
STANDARD_ERROR_MULTIPLIER = 2
BOOTSTRAP_ROUNDS = 200
BOOTSTRAP_SEED = 0
SAME_MAGNITUDE_FACTOR = 10


class ScoringError(Exception):
    pass


def parse_arguments(argv=None):
    parser = argparse.ArgumentParser(prog=pathlib.Path(__file__).name)
    parser.add_argument("--benchmark", required=True, type=pathlib.Path)
    parser.add_argument("--inputs", required=True, type=pathlib.Path)
    parser.add_argument(
        "--outputs",
        required=True,
        type=pathlib.Path,
        help="The machine's output directory that the runner wrote.",
    )
    parser.add_argument("--machine", required=True)
    parser.add_argument(
        "--accuracy-directory", required=True, type=pathlib.Path
    )
    parser.add_argument(
        "--baseline-outputs",
        type=pathlib.Path,
        default=None,
        help="machine_distance: the baseline machine's output directory.",
    )
    parser.add_argument(
        "--repeat-outputs",
        type=pathlib.Path,
        default=None,
        help=(
            "machine_distance: the baseline machine's second run of the "
            "same inputs."
        ),
    )

    return parser.parse_args(argv)


def output_value(record, directory, field_path, wants_text):
    value = select_field(record["output"], field_path)

    if wants_text:
        return text_of(value)

    name = value.get("file") if isinstance(value, dict) else None

    return None if name is None else directory / name


def read_output_values(directory, benchmark):
    field_path = benchmark.get("output_field")
    kind = benchmark["output_kind"]
    wants_text = kind == TEXT
    values = {}

    for record in read_output_records(directory):
        value = output_value(record, directory, field_path, wants_text)

        if value is None:
            raise ScoringError(
                f"item {record['id']} in {directory} has no {kind} at "
                f"output_field {field_path!r}"
            )

        values[str(record["id"])] = value

    return values


def paired_values(predictions, references):
    ids = sorted(references)
    missing = [item_id for item_id in ids if item_id not in predictions]

    if missing:
        raise ScoringError(
            f"{len(missing)} items have no prediction, first {missing[0]}"
        )

    return (
        [predictions[item_id] for item_id in ids],
        [references[item_id] for item_id in ids],
    )


def paired_values_in_common(predictions, references):
    unknown = [
        item_id for item_id in sorted(predictions) if item_id not in references
    ]

    if unknown:
        raise ScoringError(
            f"{len(unknown)} items are missing from the baseline, first "
            f"{unknown[0]}; the two sides were given different inputs"
        )

    ids = sorted(predictions)

    if not ids:
        raise ScoringError("no item has an output on both sides")

    return (
        [predictions[item_id] for item_id in ids],
        [references[item_id] for item_id in ids],
    )


def bootstrap_standard_error(score, predictions, references):
    import numpy
    from scipy.stats import bootstrap

    def resampled_score(indices):
        return score(
            [predictions[index] for index in indices],
            [references[index] for index in indices],
        )

    result = bootstrap(
        (numpy.arange(len(predictions)),),
        resampled_score,
        vectorized=False,
        n_resamples=BOOTSTRAP_ROUNDS,
        method="percentile",
        rng=numpy.random.default_rng(BOOTSTRAP_SEED),
    )

    return float(result.standard_error)


def rounding_tolerance(published):
    return 0.5 * 10 ** -published["decimals"] / published["score"]


def base_tolerance(checks):
    return (
        PUBLISHED_HARNESS_TOLERANCE
        if checks["published_harness"]
        else UNPUBLISHED_HARNESS_TOLERANCE
    )


def score_against_published(benchmark, predictions, items):
    published = benchmark["published"]
    references = {
        str(item["id"]): item["reference"]
        for item in items
        if item.get("reference") is not None
    }

    if len(references) != len(items):
        raise ScoringError(
            "every item in inputs.jsonl needs a 'reference' for "
            f"{PUBLISHED_SCORE}"
        )

    prediction_texts, reference_texts = paired_values(predictions, references)
    score = load_scorer(benchmark["metric"])
    local_score = score(prediction_texts, reference_texts)
    standard_error = bootstrap_standard_error(
        score, prediction_texts, reference_texts
    )
    relative_error = abs(local_score - published["score"]) / published["score"]
    sampling_tolerance = (
        STANDARD_ERROR_MULTIPLIER * standard_error / published["score"]
    )
    allowed = max(
        base_tolerance(benchmark["accuracy"]["checks"]),
        sampling_tolerance,
    ) + rounding_tolerance(published)

    return {
        "local_score": round(local_score, 6),
        "published_score": published["score"],
        "standard_error": round(standard_error, 6),
        "relative_error": round(relative_error, 6),
        "allowed_relative_error": round(allowed, 6),
        "verdict": "pass" if relative_error <= allowed else "fail",
    }


def distance_verdict(self_distance, cross_distance):
    if cross_distance is None:
        return "baseline"

    if self_distance == 0 and cross_distance > 0:
        return "review"

    return (
        "pass"
        if cross_distance <= SAME_MAGNITUDE_FACTOR * self_distance
        else "fail"
    )


def score_against_machines(arguments, benchmark, predictions):
    if arguments.repeat_outputs is None:
        raise ScoringError(
            "machine_distance needs --repeat-outputs, the baseline machine's "
            "second run, or no distance has a floor to stand on"
        )

    reference_directory = arguments.baseline_outputs or arguments.outputs
    baseline = read_output_values(reference_directory, benchmark)
    score = load_scorer(benchmark["metric"])
    cross_distance = (
        score(*paired_values_in_common(predictions, baseline))
        if arguments.baseline_outputs
        else None
    )
    self_distance = score(
        *paired_values_in_common(
            read_output_values(arguments.repeat_outputs, benchmark),
            baseline,
        )
    )

    return {
        "self_distance": round(self_distance, 6),
        "cross_distance": (
            None if cross_distance is None else round(cross_distance, 6)
        ),
        "verdict": distance_verdict(self_distance, cross_distance),
    }


def main():
    program_name = pathlib.Path(__file__).name
    arguments = parse_arguments()
    benchmark = read_benchmark(arguments.benchmark)
    problems = validation_problems(benchmark)

    if problems:
        for problem in problems:
            print(
                f"{program_name}: error: benchmark.json: {problem}",
                file=sys.stderr,
            )

        return EXIT_USAGE

    method = benchmark["accuracy"]["method"]
    metric = benchmark.get("metric")

    try:
        items = read_inputs(arguments.inputs)

        if method == PERSON_JUDGED:
            scored = {"verdict": None, "verdict_note": None}
        else:
            predictions = read_output_values(arguments.outputs, benchmark)
            scored = (
                score_against_published(benchmark, predictions, items)
                if method == PUBLISHED_SCORE
                else score_against_machines(arguments, benchmark, predictions)
            )
    except (ScoringError, MetricError, OSError, KeyError) as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)

        return EXIT_USAGE

    if method == PERSON_JUDGED:
        print(
            f"{program_name}: {PERSON_JUDGED} leaves verdict empty for a "
            f"person to fill in after reading {arguments.outputs}",
            file=sys.stderr,
        )

    accuracy = {
        "machine": arguments.machine,
        "method": method,
        "metric": metric["name"] if metric is not None else None,
        "item_count": len(items),
        **scored,
    }
    path = arguments.accuracy_directory / f"{arguments.machine}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(accuracy, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(accuracy, indent=2, ensure_ascii=False))

    return (
        EXIT_PASS
        if scored["verdict"] in ("pass", "baseline")
        else EXIT_NOT_PASSED
    )


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main())
