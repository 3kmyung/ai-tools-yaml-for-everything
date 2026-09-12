"""Measure one machine's row through `model-compose` and PyTorch.

    python bench-hw.py \\
        --compose-file examples/showcase/speaker-diarization-vibevoice/model-compose.yml \\
        --workflow-id transcribe-meeting \\
        --workflow-input '{"audio": "@audio", "context_info": "Microsoft,VibeVoice"}' \\
        --audio meeting.wav \\
        --example speaker-diarization-vibevoice \\
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

A workflow whose output is declared `as stream` is drained chunk by chunk, and
time to first output is the first chunk. A workflow whose output is a plain
value — `as json`, for one — has no first chunk to wait for, so time to first
output equals end to end by construction. Read those two columns as equal on
such a row rather than as a pipeline that produced everything instantly.

This script does not score transcription. Accuracy is delegated to the Open
ASR Leaderboard and `chime-utils`; see `references/benchmark.md`.
`--transcript-path` saves what the workflow produced so that a scorer can be
pointed at it later, which keeps the accuracy run from having to re-decode the
audio just to obtain a hypothesis. It is written here rather than through
`run_workflow`'s own `output_path`, whose `_save_output` is an empty stub that
writes nothing and then sets `state.output` to `None` — asking for the
transcript that way loses it.

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
separate process, and so runs a different PyTorch than this one. Both facts are
handled rather than assumed away: `benchmarks/common/harness.py` attributes
`nvidia-smi`'s per-process video memory to this runner's process tree, and
`conditions.runtime` reports the version read from the component's own
interpreter — not the orchestrator's, which on a machine with a system PyTorch
is a different build entirely.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
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
    write_transcript,
)

from mindor.core.compose.manager import ComposeManager
from mindor.dsl.loader import load_compose_config


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
    parser.add_argument("--transcript-path", type=Path, default=None)
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


def component_python_paths(config):
    for component in config.components:
        runtime = getattr(component, "runtime", None)
        path = getattr(runtime, "path", None)

        if path is None:
            continue

        for candidate in (Path(path) / "bin" / "python", Path(path) / "Scripts" / "python.exe"):
            if candidate.exists():
                yield candidate


def torch_build(config):
    for python in component_python_paths(config):
        try:
            output = subprocess.run(
                [str(python), "-c", "import torch; print(torch.__version__)"],
                capture_output=True, text=True, timeout=60,
            )
        except (subprocess.SubprocessError, OSError):
            continue

        if output.returncode == 0 and output.stdout.strip():
            return f"pytorch {output.stdout.strip()}"

    try:
        import torch
    except ImportError:
        return "pytorch version unread"

    return f"pytorch {torch.__version__}"


def runtime_label(config, serve):
    label = f"model-compose + {torch_build(config)}"

    return f"{label}, adapters served" if serve else label


def clear_stale_stop_request():
    stop_file = Path.cwd() / ".stop"

    if not stop_file.exists():
        return None

    stop_file.unlink()

    return (
        f"removed a stale {stop_file}; the controller polls for that file every second "
        f"and stops as soon as it sees one, so a run that was killed during shutdown "
        f"makes every later run in this directory stop about a second after starting"
    )


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
    def watchdog():
        time.sleep(timeout)
        print(message, flush=True)
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(code)

    threading.Thread(target=watchdog, daemon=True).start()


async def shutdown_or_die(manager, launch, timeout):
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
    stale_stop_request = clear_stale_stop_request()

    if stale_stop_request is not None:
        emit("runtime", "cleared_stop_request", detail=stale_stop_request)

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
    transcript = None

    try:
        state = await workflow

        if state.error:
            collector.ingest(emit("runtime", "error", detail=str(state.error)))
            run_error = str(state.error)
        elif hasattr(state.output, "__aiter__"):
            chunks = []

            async for chunk in state.output:
                chunks.append(chunk)

                if len(chunks) == 1:
                    collector.ingest(emit("pipeline", "first_output"))

            collector.ingest(emit("pipeline", "done", count=len(chunks)))
            transcript = chunks
        else:
            collector.ingest(emit("pipeline", "first_output"))
            collector.ingest(emit("pipeline", "done", count=1))
            transcript = state.output
    except Exception as error:
        collector.ingest(emit("runtime", "error", detail=str(error)))
        run_error = f"{error.__class__.__name__}: {error}"
    finally:
        stop_sampling.set()
        sampler.join(timeout=2)

    transcript_error = write_transcript(arguments.transcript_path, transcript)

    valid, errors = collector.is_valid()
    summary = collector.summary() if valid else {}

    for problem in (run_error, transcript_error):
        if problem is not None:
            errors = [ *errors, problem ]

    result = build_result(
        example=arguments.example,
        machine=arguments.machine,
        runtime=runtime_label(config, arguments.serve),
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

    arm_force_exit(
        arguments.shutdown_timeout * 2,
        0 if valid else 1,
        f"shutdown did not reach process exit within {arguments.shutdown_timeout * 2:g}s; "
        f"exiting hard so no component subprocess keeps this machine's accelerator",
    )

    shutdown_error = await shutdown_or_die(manager, launch, arguments.shutdown_timeout)

    if shutdown_error is not None:
        result["errors"] = [ *errors, shutdown_error ]
        write_result(arguments, result)

    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0 if valid and shutdown_error is None else 1)


def main():
    asyncio.run(run(parse_arguments()))


if __name__ == "__main__":
    sys.exit(main())
