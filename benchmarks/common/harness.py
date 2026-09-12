"""Scaffolding shared by every per-machine benchmark runner.

One machine's row is produced by whichever runner can actually load the model
there, and those runners do not share an inference stack: the `model-compose`
runner drives PyTorch through a `ComposeManager`, while a machine with no
PyTorch build of the checkpoint runs it through another runtime entirely. What
they do share is this file — the same resource sampling, the same
`benchmarks/common/metrics.py` event contract, and the same result shape — so
that rows produced by different runners land in one table with the difference
between them stated in `conditions.runtime` and `conditions.build` rather than
hidden.

    {"t": <float>, "stage": "runtime",  "event": "ready"}
    {"t": <float>, "stage": "pipeline", "event": "first_output"}
    {"t": <float>, "stage": "pipeline", "event": "done"}

Cold start is not part of that contract. Each runner times its own launch
against the `runtime.ready` timestamp it emits, because `MetricsCollector`
only starts its own clock once that event has already arrived.
"""
from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path

import psutil

from .metrics import SystemSample, sample_vram_bytes

QUANTIZATION_CHOICES = ["none", "int8", "int4", "nf4"]
QUANTIZATION_BACKEND_CHOICES = ["bitsandbytes", "quanto", "torchao", "mlx"]


def add_condition_arguments(parser):
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--example", required=True)
    parser.add_argument("--machine", required=True)
    parser.add_argument("--build", required=True)
    parser.add_argument("--precision", required=True)
    parser.add_argument("--quantization", required=True, choices=QUANTIZATION_CHOICES)
    parser.add_argument("--quantization-backend", choices=QUANTIZATION_BACKEND_CHOICES, default=None)
    parser.add_argument("--quantization-skip-modules", default="",
                        help="Comma-separated module names left at full precision. For a "
                             "converted build this is a property of the conversion, not a "
                             "choice made here — read it from the build's own config rather "
                             "than leaving it empty, which labels the row 'scope unstated'.")
    parser.add_argument("--batch", required=True, type=int)
    parser.add_argument("--acoustic-tokenizer-chunk-size", required=True, type=int)
    parser.add_argument("--results-directory", type=Path, default=None)

    return parser


def validate_condition_arguments(parser, arguments):
    if arguments.quantization == "none" and arguments.quantization_backend is not None:
        parser.error("--quantization-backend is meaningless with --quantization none")

    if arguments.quantization != "none" and arguments.quantization_backend is None:
        parser.error("--quantization-backend is required whenever --quantization is not none")

    return arguments


def split_skip_modules(value):
    return [name.strip() for name in value.split(",") if name.strip()]


def numerics_label(precision, quantization, backend, skip_modules):
    if quantization == "none":
        return precision

    scope = f"all but {' and '.join(skip_modules)}" if skip_modules else "scope unstated"

    return f"{quantization}/{backend}, {scope}, compute {precision}"


def emit(stage, event, t=None, **detail):
    payload = {"t": t if t is not None else time.time(), "stage": stage, "event": event}

    if detail:
        payload["detail"] = detail

    line = json.dumps(payload)
    print(line, flush=True)

    return line


def audio_duration_seconds(path):
    output = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )

    return round(float(output.stdout.strip()), 4)


def snapshot_system():
    process = psutil.Process()

    with process.oneshot():
        rss_bytes = process.memory_info().rss
        cpu_percent = process.cpu_percent(None)
        num_threads = process.num_threads()

    for child in process.children(recursive=True):
        try:
            with child.oneshot():
                rss_bytes += child.memory_info().rss
                cpu_percent += child.cpu_percent(None)
                num_threads += child.num_threads()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    return SystemSample(t=time.time(), rss_bytes=rss_bytes, cpu_percent=cpu_percent,
                        num_threads=num_threads, vram_bytes=sample_vram_bytes())


def sample_resources(collector, stop):
    psutil.Process().cpu_percent(None)

    while not stop.is_set():
        sample = snapshot_system()
        collector.add_sample(sample.rss_bytes, sample.cpu_percent, sample.num_threads,
                             vram_bytes=sample.vram_bytes)
        stop.wait(0.1)


def results_file_path(results_directory, example, machine):
    base = results_directory if results_directory is not None else Path("benchmarks") / example / "results"

    return base / f"{machine}.json"


def build_result(*, example, machine, runtime, build, precision, quantization,
                 quantization_backend, quantization_skip_modules, batch,
                 audio_duration_seconds, acoustic_tokenizer_chunk_size,
                 cold_start_seconds, summary, valid, errors):
    e2e_seconds = summary.get("e2e_seconds")
    real_time_factor = (
        round(e2e_seconds / audio_duration_seconds, 4)
        if e2e_seconds is not None and audio_duration_seconds
        else None
    )

    result = {
        "example": example,
        "machine": machine,
        "conditions": {
            "runtime": runtime,
            "build": build,
            "precision": precision,
            "quantization": quantization,
            "quantization_backend": quantization_backend,
            "quantization_skip_modules": quantization_skip_modules,
            "numerics": numerics_label(precision, quantization, quantization_backend,
                                       quantization_skip_modules),
            "batch": batch,
            "audio_duration_seconds": audio_duration_seconds,
            "acoustic_tokenizer_chunk_size": acoustic_tokenizer_chunk_size,
        },
        "cold_start_seconds": cold_start_seconds,
        "real_time_factor": real_time_factor,
        "valid": valid,
        "errors": errors,
    }
    result.update(summary)

    return result


def write_result(arguments, result):
    path = results_file_path(arguments.results_directory, arguments.example, arguments.machine)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2))

    print(json.dumps(result, indent=2))

    return path
