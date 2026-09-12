"""Measure one machine's row through `model-compose` and PyTorch.

    python bench-hw.py \\
        --compose-file examples/showcase/transcribe-long-meeting/model-compose.yml \\
        --workflow-id transcribe-meeting \\
        --workflow-input '{"audio": "@audio", "context_info": "Microsoft,VibeVoice"}' \\
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

That precedent declares `controller: {}` — no protocol adapter and no web user
interface — and this runner defaults to the same shape, stripping both from the
configuration in memory. `launch_services(detach=False)` is written to run
until the controller stops, and in a native runtime its final wait returns at
once; with adapters configured the controller then tears itself down while this
process is still polling `controller.started`, and `run_workflow` comes back
`ShutdownError: Service is shutting down`. Nothing here needs those adapters:
the workflow is invoked in process, not over HTTP.

`--serve` keeps them, with `--controller-port` and `--webui-port` to move them
off ports another process holds. Cold start then includes bringing the servers
up, which is why `conditions.runtime` says so.

`benchmarks/common/harness.py` holds everything this shares with the runners
for machines that have no PyTorch build of the checkpoint, including the event
contract and the result shape.

This script does not score transcription. Accuracy is delegated to the Open
ASR Leaderboard and `chime-utils`; see `references/benchmark.md`.

Neither does it apply precision or quantization. Both are decided by the
component in the example's own `model-compose.yml`; the arguments here only
record what that component was configured to do, so a mismatch between the two
is invisible to this script and has to be checked by reading the compose file.

`--workflow-input` names the audio with `@audio`, the same placeholder the
examples use over HTTP, and the runner substitutes the bytes of `--audio` for
it. A file path will not do: `${input.audio as audio}` accepts bytes or a
stream, and a path arrives as a string.

The example's compose file is never edited on disk: its ports and its web user
interface are part of what the example documents. `--ready-timeout` bounds the
wait for the controller, so a port already in use under `--serve` fails with
that sentence instead of spinning forever.

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
import os
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
    parser.add_argument("--serve", action="store_true")
    parser.add_argument("--controller-port", type=int, default=None)
    parser.add_argument("--webui-port", type=int, default=None)
    parser.add_argument("--ready-timeout", type=float, default=1200.0)
    parser.add_argument("--shutdown-timeout", type=float, default=120.0)
    add_condition_arguments(parser)

    return validate_condition_arguments(parser, parser.parse_args(argv))


def apply_serving(config, serve, controller_port, webui_port):
    if not serve:
        config.controller.adapters = []
        config.controller.webui = None

        return config

    if controller_port is not None:
        for adapter in config.controller.adapters:
            adapter.port = controller_port

    if webui_port is not None and config.controller.webui is not None:
        config.controller.webui.port = webui_port

    return config


def runtime_label(serve):
    return f"{RUNTIME}, adapters served" if serve else RUNTIME


def resolve_workflow_input(raw, audio_path):
    placeholder = "@audio"
    workflow_input = json.loads(raw)
    keys = [ key for key, value in workflow_input.items() if value == placeholder ]

    if not keys:
        raise ValueError(
            f"--workflow-input carries no {placeholder!r} value; an audio workflow "
            f"expects one, since a file path reaches the renderer as a string and "
            f"`as audio` accepts only bytes"
        )

    audio_bytes = audio_path.read_bytes()

    for key in keys:
        workflow_input[key] = audio_bytes

    return workflow_input


def arm_force_exit(timeout, code, message):
    finished = threading.Event()

    def watchdog():
        if finished.wait(timeout):
            return

        print(message, flush=True)
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(code)

    threading.Thread(target=watchdog, daemon=True).start()

    return finished


async def shutdown_or_die(manager, launch, timeout, valid):
    finished = arm_force_exit(
        timeout * 2,
        0 if valid else 1,
        f"shutdown wedged past {timeout * 2:g}s and was not interruptible; "
        f"exiting hard so no component subprocess keeps this machine's accelerator",
    )

    try:
        await asyncio.wait_for(manager.terminate_services(verbose=False), timeout)
        shutdown_error = None
    except asyncio.TimeoutError:
        shutdown_error = (
            f"shutdown did not finish within {timeout:g}s; a component subprocess may "
            f"still hold this machine's accelerator memory"
        )
    except Exception as error:
        shutdown_error = f"shutdown raised {error.__class__.__name__}: {error}"

    launch.cancel()
    try:
        await launch
    except (asyncio.CancelledError, Exception):
        pass

    finished.set()

    return shutdown_error


async def await_ready(manager, launch, timeout):
    deadline = time.time() + timeout

    while not manager.controller.started:
        if launch.done() and launch.exception() is not None:
            raise launch.exception()

        if time.time() > deadline:
            raise TimeoutError(
                f"controller did not report started within {timeout:g}s; "
                f"a port already in use is the usual cause"
            )

        await asyncio.sleep(0.05)


async def run(arguments):
    workflow_input = resolve_workflow_input(arguments.workflow_input, arguments.audio)
    launch_t = time.time()

    config = load_compose_config(str(arguments.compose_file.parent), [arguments.compose_file], env={})
    config = apply_serving(config, arguments.serve, arguments.controller_port, arguments.webui_port)
    manager = ComposeManager(config, daemon=True)
    launch = asyncio.create_task(manager.launch_services(detach=False, verbose=False))

    await await_ready(manager, launch, arguments.ready_timeout)

    workflow = asyncio.create_task(manager.run_workflow(
        arguments.workflow_id,
        workflow_input,
        output_path=None,
        verbose=False,
    ))

    ready_t = time.time()
    cold_start_seconds = round(ready_t - launch_t, 4)

    collector = MetricsCollector()
    collector.input_start_t = ready_t
    collector.ingest(emit("runtime", "ready", t=ready_t))
    collector.note_ready(snapshot_system())

    stop_sampling = threading.Event()
    sampler = threading.Thread(target=sample_resources, args=(collector, stop_sampling), daemon=True)
    sampler.start()

    run_error = None

    try:
        state = await workflow

        if state.error:
            collector.ingest(emit("runtime", "error", detail=str(state.error)))
            run_error = str(state.error)
        else:
            first = True
            count = 0

            async for _ in state.output:
                count += 1

                if first:
                    collector.ingest(emit("pipeline", "first_output"))
                    first = False

            collector.ingest(emit("pipeline", "done", count=count))
    except Exception as error:
        collector.ingest(emit("runtime", "error", detail=str(error)))
        run_error = f"{error.__class__.__name__}: {error}"
    finally:
        stop_sampling.set()
        sampler.join(timeout=2)

    valid, errors = collector.is_valid()
    summary = collector.summary() if valid else {}

    if run_error is not None:
        errors = [ *errors, run_error ]

    result = build_result(
        example=arguments.example,
        machine=arguments.machine,
        runtime=runtime_label(arguments.serve),
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

    shutdown_error = await shutdown_or_die(manager, launch, arguments.shutdown_timeout, valid)

    if shutdown_error is not None:
        result["errors"] = [ *errors, shutdown_error ]
        write_result(arguments, result)

    return 0 if valid and shutdown_error is None else 1


def main():
    code = asyncio.run(run(parse_arguments()))
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(code)


if __name__ == "__main__":
    sys.exit(main())
