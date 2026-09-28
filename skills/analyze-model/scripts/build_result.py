import json
from pathlib import Path

from probe import content_duration_seconds
from read_inputs import item_input_duration_seconds
from select_output import media_bytes_of, select_field, text_of

QUANTIZATION_CHOICES = ["none", "int8", "int4", "nf4"]
QUANTIZATION_BACKEND_CHOICES = ["bitsandbytes", "quanto", "torchao"]


def add_condition_arguments(parser):
    parser.add_argument(
        "--benchmark",
        required=True,
        type=Path,
        help=(
            "workspaces/<example>/analysis/benchmark.json, which names the "
            "workflow, its input template, the output field and the tokenizer."
        ),
    )
    parser.add_argument(
        "--inputs",
        required=True,
        type=Path,
        help=(
            "The inputs.jsonl that prepare.py wrote. Every machine is given "
            "the same file, so every row times the same items."
        ),
    )
    parser.add_argument(
        "--output-directory",
        required=True,
        type=Path,
        help="Where each item's output is saved for score_outputs.py.",
    )
    parser.add_argument("--target", required=True)
    parser.add_argument("--machine", required=True)
    parser.add_argument("--build", required=True)
    parser.add_argument("--precision", required=True)
    parser.add_argument(
        "--quantization", required=True, choices=QUANTIZATION_CHOICES
    )
    parser.add_argument(
        "--quantization-backend",
        choices=QUANTIZATION_BACKEND_CHOICES,
        default=None,
    )
    parser.add_argument(
        "--quantization-skip-modules",
        default="",
        help=(
            "Comma-separated module names left at full precision. For a "
            "converted build this is a property of the conversion, not a "
            "choice made here — read it from the build's own config rather "
            "than leaving it empty, which labels the row 'scope unstated'."
        ),
    )
    parser.add_argument("--batch", required=True, type=int)
    parser.add_argument(
        "--condition",
        action="append",
        default=[],
        metavar="NAME=VALUE",
        help=(
            "A setting this model exposes that the shared arguments do not "
            "name. It is recorded in conditions verbatim and compared by "
            "nothing, so a figure measured under a different value states it."
        ),
    )
    parser.add_argument("--results-directory", required=True, type=Path)

    return parser


def validate_condition_arguments(parser, arguments):
    if (
        arguments.quantization == "none"
        and arguments.quantization_backend is not None
    ):
        parser.error(
            "--quantization-backend is meaningless with --quantization none"
        )

    if (
        arguments.quantization != "none"
        and arguments.quantization_backend is None
    ):
        parser.error(
            "--quantization-backend is required whenever --quantization "
            "is not none"
        )

    named = [
        *arguments.condition,
        *getattr(arguments, "device", []),
        *getattr(arguments, "option", []),
    ]

    for entry in named:
        if "=" not in entry or not entry.split("=", 1)[0].strip():
            parser.error(
                "--condition, --device and --option take NAME=VALUE, not "
                f"{entry!r}"
            )

    return arguments


def split_conditions(entries):
    pairs = (entry.split("=", 1) for entry in entries)

    return {name.strip(): value.strip() for name, value in pairs}


def split_skip_modules(value):
    return [name.strip() for name in value.split(",") if name.strip()]


def numerics_label(precision, quantization, backend, skip_modules):
    if quantization == "none":
        return precision

    scope = (
        f"all but {' and '.join(skip_modules)}"
        if skip_modules
        else "scope unstated"
    )

    return f"{quantization}/{backend}, {scope}, compute {precision}"


def load_tokenizer(name):
    if not name:
        return None

    from transformers import AutoTokenizer

    return AutoTokenizer.from_pretrained(name)


def output_token_count(text, tokenizer):
    if text is None or tokenizer is None:
        return None

    return len(tokenizer.encode(text, add_special_tokens=False))


def measure_output(output, field_path, tokenizer):
    value = select_field(output, field_path)
    text = text_of(value)
    content = media_bytes_of(value)

    return {
        "output_duration_seconds": (
            content_duration_seconds(content) if content is not None else None
        ),
        "output_tokens": output_token_count(text, tokenizer),
        "output_characters": len(text) if text is not None else None,
    }


def total_of(items, key):
    values = [item.get(key) for item in items]

    if not values or any(value is None for value in values):
        return None

    return sum(values)


def throughput_of(items):
    seconds = total_of(items, "end_to_end_seconds")

    if not seconds:
        return {}

    input_duration = total_of(items, "input_duration_seconds")
    output_duration = total_of(items, "output_duration_seconds")
    output_tokens = total_of(items, "output_tokens")
    output_characters = total_of(items, "output_characters")
    candidates = {
        "real_time_factor": (
            seconds / input_duration if input_duration else None
        ),
        "output_real_time_factor": (
            seconds / output_duration if output_duration else None
        ),
        "output_tokens_per_second": (
            output_tokens / seconds if output_tokens is not None else None
        ),
        "output_characters_per_second": (
            output_characters / seconds
            if output_characters is not None
            else None
        ),
    }

    return {
        name: round(value, 4)
        for name, value in candidates.items()
        if value is not None
    }


def item_records(items, item_seconds, output_measures):
    records = []

    for item in items:
        item_id = str(item["id"])
        records.append(
            {
                "id": item_id,
                **item_seconds.get(item_id, {}),
                "input_duration_seconds": item_input_duration_seconds(item),
                **output_measures.get(item_id, {}),
            }
        )

    return records


def results_file_path(results_directory, machine):
    return results_directory / f"{machine}.json"


def build_result(
    *,
    target,
    machine,
    runtime,
    build,
    precision,
    quantization,
    quantization_backend,
    quantization_skip_modules,
    batch,
    inputs_sha256,
    extra_conditions,
    cold_start_seconds,
    items,
    summary,
    valid,
    errors,
):
    throughput = throughput_of(items) if valid else {}

    result = {
        "target": target,
        "machine": machine,
        "conditions": {
            "runtime": runtime,
            "build": build,
            "precision": precision,
            "quantization": quantization,
            "quantization_backend": quantization_backend,
            "quantization_skip_modules": quantization_skip_modules,
            "numerics": numerics_label(
                precision,
                quantization,
                quantization_backend,
                quantization_skip_modules,
            ),
            "batch": batch,
            "inputs_sha256": inputs_sha256,
            "input_duration_seconds": total_of(
                items, "input_duration_seconds"
            ),
            **extra_conditions,
        },
        "cold_start_seconds": cold_start_seconds,
        "throughput": throughput,
        "items": items,
        "valid": valid,
        "errors": errors,
    }
    result.update(summary)

    return result


def write_result(arguments, result):
    path = results_file_path(arguments.results_directory, arguments.machine)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    print(json.dumps(result, indent=2, ensure_ascii=False))

    return path
