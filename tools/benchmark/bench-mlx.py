"""Measure one machine's row through MLX, for a machine with no PyTorch build.

    python bench-mlx.py \\
        --model mlx-community/VibeVoice-ASR-4bit \\
        --max-tokens 8192 \\
        --context "Microsoft,VibeVoice" \\
        --audio meeting.wav \\
        --example speaker-diarization-vibevoice \\
        --machine macbook-m1 \\
        --build mlx-community/VibeVoice-ASR-4bit \\
        --precision bfloat16 \\
        --quantization int4 \\
        --quantization-backend mlx \\
        --batch 1 \\
        --acoustic-tokenizer-chunk-size 1440000

Writes the same result shape as `bench-hw.py`, through the same
`benchmarks/common/harness.py`, so both land in one table. What differs is
recorded rather than hidden: `conditions.runtime` says `mlx-audio` and
`conditions.build` names the converted repository, because the two runners
execute two implementations of one architecture. A gap between such rows is
not by itself a gap between the machines.

`model-compose` has no MLX driver, so this runner bypasses it entirely and
calls `mlx_audio.stt` directly. Cold start therefore covers a model load
alone, where `bench-hw.py`'s also covers bringing a compose stack up — the two
cold-start figures are the least comparable column in the table.

Time to first output comes from `stream_transcribe`, which yields text as it
is decoded. A build or a model without that method has no honest first-output
figure, and this runner fails rather than reporting end-to-end time twice.
"""
from __future__ import annotations

import argparse
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

RUNTIME = "mlx-audio"


def parse_arguments(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--max-tokens", type=int, default=8192)
    parser.add_argument("--context", default=None)
    parser.add_argument("--transcript-path", type=Path, default=None)
    add_condition_arguments(parser)

    return validate_condition_arguments(parser, parser.parse_args(argv))


def transcription_arguments(arguments):
    keywords = {"audio": str(arguments.audio), "max_tokens": arguments.max_tokens}

    if arguments.context is not None:
        keywords["context"] = arguments.context

    return keywords


def run(arguments):
    from mlx_audio.stt.utils import load

    launch_t = time.time()
    model = load(arguments.model)

    if not hasattr(model, "stream_transcribe"):
        raise AttributeError(
            f"{arguments.model} loaded without a 'stream_transcribe' method; "
            f"time to first output cannot be measured for this build"
        )

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
        chunks = []

        for chunk in model.stream_transcribe(**transcription_arguments(arguments)):
            chunks.append(chunk)

            if len(chunks) == 1:
                collector.ingest(emit("pipeline", "first_output"))

        collector.ingest(emit("pipeline", "done", count=len(chunks)))
        transcript = chunks
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
    return run(parse_arguments())


if __name__ == "__main__":
    sys.exit(main())
