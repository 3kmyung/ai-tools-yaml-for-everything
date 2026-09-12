"""Measure one machine's row through `model-compose` and PyTorch.

    python bench-hw.py \\
        --compose-file examples/showcase/transcribe-long-meeting/model-compose.yml \\
        --workflow-id transcribe-meeting \\
        --workflow-input '{"audio": "meeting.wav", "context_info": "Microsoft,VibeVoice"}' \\
        --audio meeting.wav \\
        --example transcribe-long-meeting \\
        --machine rtx-4090 \\
        --build microsoft/VibeVoice-ASR \\
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
        ...

Drives the example's own `model-compose.yml` through an in-process
`ComposeManager`, the same mechanism
`benchmarks/stt-embed-streaming/model-compose/pipeline.py` already uses.
`benchmarks/common/harness.py` holds everything this shares with the runners
for machines that have no PyTorch build of the checkpoint, including the event
contract and the result shape.

This script does not score transcription. Accuracy is delegated to the Open
ASR Leaderboard and `chime-utils`; see `references/benchmark.md`.

Neither does it apply precision or quantization. Both are decided by the
component in the example's own `model-compose.yml`; the arguments here only
record what that component was configured to do, so a mismatch between the two
is invisible to this script and has to be checked by reading the compose file.

A component whose `runtime` is `virtualenv` or `docker` loads its model in a
separate process. `sample_vram_bytes()` reads the accelerator context of
whichever process calls it, so `vram_bytes` on such a run reports this
orchestrator process's own allocation, not the component subprocess's — expect
zero and read peak video memory from the component's own process instead.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))
from benchmarks.common.metrics import MetricsCollector
from benchmarks.common.harness import (
    add_condition_arguments,
    audio_duration_seconds,
    build_result,
    emit,
    sample_resources,
    snapshot_system,
    split_skip_modules,
    validate_condition_arguments,
    write_result,
)

from mindor.core.compose.manager import ComposeManager
from mindor.dsl.loader import load_compose_config

RUNTIME = "model-compose + pytorch"


def parse_arguments(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--compose-file", required=True, type=Path)
    parser.add_argument("--workflow-id", required=True)
    parser.add_argument("--workflow-input", required=True)
    add_condition_arguments(parser)

    return validate_condition_arguments(parser, parser.parse_args(argv))


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
        runtime=RUNTIME,
        build=arguments.build,
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
    write_result(arguments, result)

    return 0 if valid else 1


def main():
    return asyncio.run(run(parse_arguments()))


if __name__ == "__main__":
    sys.exit(main())
