import argparse
import json
import pathlib
import sys

from resolve_metric import metric_url

EXIT_SUCCESS = 0
EXIT_INVALID_RESULTS = 1
EXIT_USAGE = 2
ITEM_RECORDS_KEY = "items"
PASSING_VERDICTS = ("pass", "baseline")
UNMEASURED_DIRECTORY = "unmeasured"


class ReportError(Exception):
    pass


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ReportError(f"{path}: {error}") from error


def read_results(results_directory):
    return [
        (path, read_json(path))
        for path in sorted(results_directory.glob("*.json"))
    ]


def read_unmeasured_machines(unmeasured_directory):
    return {
        read_json(path).get("machine") or path.stem
        for path in sorted(unmeasured_directory.glob("*.json"))
    }


def find_coverage_gaps(benchmark, results, unmeasured_machines):
    if "machines" not in benchmark:
        return ["benchmark.json has no machines; nothing says which to report"]

    planned = set(benchmark["machines"])
    measured = {result.get("machine") for _, result in results}
    gaps = []

    for machine in sorted(planned - measured - unmeasured_machines):
        gaps.append(
            f"{machine}: in machines but has neither a result nor an "
            f"{UNMEASURED_DIRECTORY} record"
        )

    for machine in sorted((measured | unmeasured_machines) - planned):
        gaps.append(f"{machine}: has a record but is not in machines")

    for machine in sorted(measured & unmeasured_machines):
        gaps.append(
            f"{machine}: has both a result and an {UNMEASURED_DIRECTORY} "
            "record; delete the stale one"
        )

    return gaps


def read_accuracy(accuracy_directory, machine):
    if accuracy_directory is None:
        return None

    path = accuracy_directory / f"{machine}.json"

    return read_json(path) if path.is_file() else None


def find_invalid(results, accuracy_directory):
    invalid = []

    for path, result in results:
        if not result.get("valid"):
            invalid.append(
                f"{path.name}: valid is false: "
                f"{result.get('errors') or 'no reason recorded'}"
            )

        machine = result.get("machine")
        accuracy = read_accuracy(accuracy_directory, machine)

        if accuracy_directory is not None and accuracy is None:
            invalid.append(
                f"{machine}: no accuracy file; its timings stand on nothing"
            )
        elif (
            accuracy is not None
            and accuracy.get("verdict") not in PASSING_VERDICTS
        ):
            invalid.append(
                f"{machine}.json: verdict is {accuracy.get('verdict')!r}, "
                f"not one of {', '.join(PASSING_VERDICTS)}"
            )

    digests = {
        result.get("conditions", {}).get("inputs_sha256")
        for _, result in results
    }

    if len(digests) > 1:
        invalid.append(
            "results were measured on different inputs.jsonl files; "
            "rows are not comparable"
        )

    return invalid


def machine_report(result, accuracy_directory):
    machine = result.get("machine")
    reported = {
        key: value for key, value in result.items() if key != ITEM_RECORDS_KEY
    }
    reported["accuracy"] = read_accuracy(accuracy_directory, machine)

    return machine, reported


def build_report(benchmark, results, accuracy_directory):
    machines = dict(
        machine_report(result, accuracy_directory) for _, result in results
    )

    return {
        "benchmark": benchmark,
        "metric_url": metric_url(benchmark.get("metric")),
        "machines": machines,
    }


def parse_arguments(argv=None):
    parser = argparse.ArgumentParser(prog=pathlib.Path(__file__).name)
    parser.add_argument("results_directory", type=pathlib.Path)
    parser.add_argument("--benchmark", required=True, type=pathlib.Path)
    parser.add_argument(
        "--accuracy-directory", type=pathlib.Path, default=None
    )

    return parser.parse_args(argv)


def main():
    program_name = pathlib.Path(__file__).name
    arguments = parse_arguments()

    if not arguments.results_directory.is_dir():
        print(
            f"{program_name}: error: not a directory: "
            f"{arguments.results_directory}",
            file=sys.stderr,
        )

        return EXIT_USAGE

    try:
        benchmark = read_json(arguments.benchmark)
        results = read_results(arguments.results_directory)
        unmeasured_machines = read_unmeasured_machines(
            arguments.results_directory.parent / UNMEASURED_DIRECTORY
        )

        if not results:
            print(
                f"{program_name}: error: no result files in "
                f"{arguments.results_directory}",
                file=sys.stderr,
            )

            return EXIT_INVALID_RESULTS

        invalid = [
            *find_coverage_gaps(benchmark, results, unmeasured_machines),
            *find_invalid(results, arguments.accuracy_directory),
        ]

        if invalid:
            for message in invalid:
                print(f"{program_name}: error: {message}", file=sys.stderr)

            return EXIT_INVALID_RESULTS

        report = build_report(benchmark, results, arguments.accuracy_directory)
    except ReportError as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)

        return EXIT_USAGE

    print(json.dumps(report, indent=2, ensure_ascii=False))

    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main())
