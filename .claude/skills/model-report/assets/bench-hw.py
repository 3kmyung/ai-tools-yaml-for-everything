"""Measure the hardware axis for one showcase example.

    python bench-hw.py \\
        --compose-file examples/showcase/transcribe-long-meeting/model-compose.yml \\
        --workflow-id transcribe-meeting \\
        --workflow-input '{"audio": "meeting.wav", "context_info": "Microsoft,VibeVoice"}' \\
        --audio meeting.wav \\
        --example transcribe-long-meeting \\
        --machine rtx-4090 \\
        --precision float16 \\
        --quantization none \\
        --batch 1 \\
        --acoustic-tokenizer-chunk-size 1440000

A quantized run states its own quantization instead:

    python bench-hw.py \\
        ... \\
        --machine rtx-4050-laptop \\
        --precision float16 \\
        --quantization nf4 \\
        --quantization-backend bitsandbytes \\
        --quantization-skip-modules acoustic_tokenizer,semantic_tokenizer \\
        --batch 1 \\
        --acoustic-tokenizer-chunk-size 1440000

Drives the example's own `model-compose.yml` through an in-process
`ComposeManager`, the same mechanism
`benchmarks/stt-embed-streaming/model-compose/pipeline.py` already uses, and
emits the three-event contract `benchmarks/common/metrics.py` understands:

    {"t": <float>, "stage": "runtime",  "event": "ready"}
    {"t": <float>, "stage": "pipeline", "event": "first_output"}
    {"t": <float>, "stage": "pipeline", "event": "done"}

Cold start is measured separately, as the wall time between this process
starting and `runtime.ready`, because `MetricsCollector` only starts its own
clock once that event has already arrived.

This script does not score transcription. Accuracy is delegated to the Open
ASR Leaderboard and `chime-utils`; see `references/benchmark.md`.

Neither does it apply precision or quantization. Both are decided by the
component in the example's own `model-compose.yml`; the arguments here only
record what that component was configured to do, so a mismatch between the
two is invisible to this script and has to be checked by reading the compose
file. `conditions.numerics` is the single label the report table carries, so
that no row can reach a reader with its arithmetic left unstated.

A component whose `runtime` is `virtualenv` or `docker` loads its model in a
separate process. `sample_vram_bytes()` reads the CUDA context of whichever
process calls it, so `vram_bytes` on such a run reports this orchestrator
process's own allocation, not the component subprocess's — expect zero and
read peak video memory from the component's own process instead.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
import threading
import time
from pathlib import Path

import psutil

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))
from benchmarks.common.metrics import MetricsCollector, SystemSample, sample_vram_bytes

from mindor.core.compose.manager import ComposeManager
from mindor.dsl.loader import load_compose_config


QUANTIZATION_CHOICES = ["none", "int8", "int4", "nf4"]
QUANTIZATION_BACKEND_CHOICES = ["bitsandbytes", "quanto", "torchao"]


def parse_arguments(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--compose-file", required=True, type=Path)
    parser.add_argument("--workflow-id", required=True)
    parser.add_argument("--workflow-input", required=True)
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--example", required=True)
    parser.add_argument("--machine", required=True)
    parser.add_argument("--precision", required=True)
    parser.add_argument("--quantization", required=True, choices=QUANTIZATION_CHOICES)
    parser.add_argument("--quantization-backend", choices=QUANTIZATION_BACKEND_CHOICES, default=None)
    parser.add_argument("--quantization-skip-modules", default="")
    parser.add_argument("--batch", required=True, type=int)
    parser.add_argument("--acoustic-tokenizer-chunk-size", required=True, type=int)
    parser.add_argument("--results-directory", type=Path, default=None)

    arguments = parser.parse_args(argv)

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

    scope = f", all but {' and '.join(skip_modules)}" if skip_modules else ", whole model"

    return f"{quantization}/{backend}{scope}, compute {precision}"


def audio_duration_seconds(path):
    output = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )

    return round(float(output.stdout.strip()), 4)


def emit(stage, event, t=None, **detail):
    payload = {"t": t if t is not None else time.time(), "stage": stage, "event": event}

    if detail:
        payload["detail"] = detail

    line = json.dumps(payload)
    print(line, flush=True)

    return line


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


def build_result(*, example, machine, precision, quantization, quantization_backend,
                 quantization_skip_modules, batch, audio_duration_seconds,
                 acoustic_tokenizer_chunk_size, cold_start_seconds, summary, valid, errors):
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


async def run(arguments):
    launch_t = time.time()

    config = load_compose_config(str(arguments.compose_file.parent), [arguments.compose_file], env={})
    manager = ComposeManager(config, daemon=True)
    launch = asyncio.create_task(manager.launch_services(detach=False, verbose=False))

    while not manager.controller.started:
        await asyncio.sleep(0.05)

    ready_t = time.time()
    cold_start_seconds = round(ready_t - launch_t, 4)

    collector = MetricsCollector()
    collector.input_start_t = ready_t
    collector.ingest(emit("runtime", "ready", t=ready_t))
    collector.note_ready(snapshot_system())

    stop_sampling = threading.Event()
    sampler = threading.Thread(target=sample_resources, args=(collector, stop_sampling), daemon=True)
    sampler.start()

    try:
        state = await manager.run_workflow(
            arguments.workflow_id,
            json.loads(arguments.workflow_input),
            output_path=None,
            verbose=False,
        )

        if state.error:
            collector.ingest(emit("runtime", "error", detail=str(state.error)))
        else:
            first = True
            count = 0

            async for _ in state.output:
                count += 1

                if first:
                    collector.ingest(emit("pipeline", "first_output"))
                    first = False

            collector.ingest(emit("pipeline", "done", count=count))
    finally:
        stop_sampling.set()
        sampler.join(timeout=2)

        await manager.terminate_services(verbose=False)
        launch.cancel()
        try:
            await launch
        except (asyncio.CancelledError, Exception):
            pass

    valid, errors = collector.is_valid()
    summary = collector.summary() if valid else {}

    result = build_result(
        example=arguments.example,
        machine=arguments.machine,
        precision=arguments.precision,
        quantization=arguments.quantization,
        quantization_backend=arguments.quantization_backend,
        quantization_skip_modules=split_skip_modules(arguments.quantization_skip_modules),
        batch=arguments.batch,
        audio_duration_seconds=audio_duration_seconds(arguments.audio),
        acoustic_tokenizer_chunk_size=arguments.acoustic_tokenizer_chunk_size,
        cold_start_seconds=cold_start_seconds,
        summary=summary,
        valid=valid,
        errors=errors,
    )

    path = results_file_path(arguments.results_directory, arguments.example, arguments.machine)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2))

    print(json.dumps(result, indent=2))

    return 0 if valid else 1


def main():
    return asyncio.run(run(parse_arguments()))


if __name__ == "__main__":
    sys.exit(main())
