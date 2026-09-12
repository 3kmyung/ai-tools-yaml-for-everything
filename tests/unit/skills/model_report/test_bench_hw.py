"""Unit tests for `tools/benchmark/bench-hw.py`.

Exercises the event emission and the result-file shape without a model:
`bench-hw.py` drives an in-process `ComposeManager` that needs real hardware
to load a checkpoint, so `run` itself is not covered here. What is covered is
everything reachable without one — the JSONL event contract, the result
dictionary a report's tables read from, and where the result file lands.
"""

import importlib.util
import json
import wave
from pathlib import Path

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
BENCH_HW_PATH = REPOSITORY_ROOT / "tools" / "benchmark" / "bench-hw.py"


def _load_bench_hw():
    specification = importlib.util.spec_from_file_location("bench_hw", BENCH_HW_PATH)
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)

    return module


bench_hw = _load_bench_hw()

import sys

sys.path.insert(0, str(REPOSITORY_ROOT))
from benchmarks.common import harness
from benchmarks.common.metrics import sample_vram_bytes


def _write_silent_wav(path, seconds):
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(16000)
        wav_file.writeframes(b"\x00\x00" * int(16000 * seconds))


class TestEmit:
    def test_emits_the_documented_runtime_ready_shape(self, capsys):
        line = harness.emit("runtime", "ready", t=12.5)
        payload = json.loads(line)

        assert payload == {"t": 12.5, "stage": "runtime", "event": "ready"}
        assert capsys.readouterr().out.strip() == line

    def test_emits_pipeline_events_with_detail_nested(self):
        line = harness.emit("pipeline", "done", t=20.0, count=7)
        payload = json.loads(line)

        assert payload["stage"] == "pipeline"
        assert payload["event"] == "done"
        assert payload["detail"] == {"count": 7}

    def test_omits_the_detail_key_when_there_is_none(self):
        payload = json.loads(harness.emit("pipeline", "first_output", t=1.0))

        assert "detail" not in payload

    def test_defaults_the_timestamp_to_now_when_not_given(self):
        before = __import__("time").time()
        payload = json.loads(harness.emit("runtime", "ready"))
        after = __import__("time").time()

        assert before <= payload["t"] <= after

    def test_the_collector_ingests_an_emitted_pipeline_line(self):
        collector = bench_hw.MetricsCollector()
        collector.input_start_t = 0.0

        collector.ingest(harness.emit("pipeline", "first_output", t=1.5))
        collector.ingest(harness.emit("pipeline", "done", t=3.5))

        assert collector.first_output_t == 1.5
        assert collector.done_t == 3.5


class TestBuildResult:
    def _summary(self):
        return {
            "ttfo_seconds": 2.0,
            "e2e_seconds": 8.0,
            "rss": {"peak_mb": 512.0},
            "cpu": {"peak_percent": 90.0},
            "threads": {"peak": 12},
            "vram": {"peak_mb": 6144.0},
            "backlog_max": {},
            "sample_count": 42,
        }

    def test_identifies_the_example_and_the_machine(self):
        result = harness.build_result(
            example="speaker-diarization-vibevoice", machine="rtx-4090",
            runtime="model-compose + pytorch 2.11.0+cu128", build="microsoft/VibeVoice-ASR",
            precision="float16", quantization="none", quantization_backend=None,
            quantization_skip_modules=[],
            batch=1, audio_duration_seconds=40.0, acoustic_tokenizer_chunk_size=1440000,
            cold_start_seconds=12.0, summary=self._summary(), valid=True, errors=[],
        )

        assert result["example"] == "speaker-diarization-vibevoice"
        assert result["machine"] == "rtx-4090"

    def test_carries_every_condition_a_report_table_needs(self):
        result = harness.build_result(
            example="speaker-diarization-vibevoice", machine="rtx-4090",
            runtime="model-compose + pytorch 2.11.0+cu128", build="microsoft/VibeVoice-ASR",
            precision="float16", quantization="none", quantization_backend=None,
            quantization_skip_modules=[],
            batch=1, audio_duration_seconds=40.0, acoustic_tokenizer_chunk_size=1440000,
            cold_start_seconds=12.0, summary=self._summary(), valid=True, errors=[],
        )

        assert result["conditions"] == {
            "runtime": "model-compose + pytorch 2.11.0+cu128",
            "build": "microsoft/VibeVoice-ASR",
            "precision": "float16",
            "quantization": "none",
            "quantization_backend": None,
            "quantization_skip_modules": [],
            "numerics": "float16",
            "batch": 1,
            "audio_duration_seconds": 40.0,
            "acoustic_tokenizer_chunk_size": 1440000,
        }

    def test_merges_the_collector_summary_alongside_the_conditions(self):
        result = harness.build_result(
            example="speaker-diarization-vibevoice", machine="rtx-4090",
            runtime="model-compose + pytorch 2.11.0+cu128", build="microsoft/VibeVoice-ASR",
            precision="float16", quantization="none", quantization_backend=None,
            quantization_skip_modules=[],
            batch=1, audio_duration_seconds=40.0, acoustic_tokenizer_chunk_size=1440000,
            cold_start_seconds=12.0, summary=self._summary(), valid=True, errors=[],
        )

        assert result["ttfo_seconds"] == 2.0
        assert result["vram"]["peak_mb"] == 6144.0

    def test_computes_real_time_factor_from_end_to_end_and_audio_duration(self):
        result = harness.build_result(
            example="speaker-diarization-vibevoice", machine="rtx-4090",
            runtime="model-compose + pytorch 2.11.0+cu128", build="microsoft/VibeVoice-ASR",
            precision="float16", quantization="none", quantization_backend=None,
            quantization_skip_modules=[],
            batch=1, audio_duration_seconds=40.0, acoustic_tokenizer_chunk_size=1440000,
            cold_start_seconds=12.0, summary=self._summary(), valid=True, errors=[],
        )

        assert result["real_time_factor"] == 0.2

    def test_reports_an_invalid_run_without_a_real_time_factor(self):
        result = harness.build_result(
            example="speaker-diarization-vibevoice", machine="rtx-4090",
            runtime="model-compose + pytorch 2.11.0+cu128", build="microsoft/VibeVoice-ASR",
            precision="float16", quantization="none", quantization_backend=None,
            quantization_skip_modules=[],
            batch=1, audio_duration_seconds=40.0, acoustic_tokenizer_chunk_size=1440000,
            cold_start_seconds=12.0, summary={}, valid=False,
            errors=["missing pipeline.done"],
        )

        assert result["valid"] is False
        assert result["errors"] == ["missing pipeline.done"]
        assert result["real_time_factor"] is None
        assert "ttfo_seconds" not in result


class TestResultsFilePath:
    def test_matches_the_documented_benchmarks_results_layout(self):
        path = harness.results_file_path(None, "speaker-diarization-vibevoice", "rtx-4090")

        assert path == Path("benchmarks") / "speaker-diarization-vibevoice" / "results" / "rtx-4090.json"

    def test_honours_an_explicit_results_directory(self, tmp_path):
        path = harness.results_file_path(tmp_path, "speaker-diarization-vibevoice", "dgx-spark")

        assert path == tmp_path / "dgx-spark.json"


class TestAudioDurationSeconds:
    def test_reads_the_duration_of_a_wav_file(self, tmp_path):
        wav_path = tmp_path / "sample.wav"
        _write_silent_wav(wav_path, seconds=2.0)

        assert harness.audio_duration_seconds(wav_path) == pytest.approx(2.0, abs=0.01)


class TestSnapshotSystem:
    def test_reads_a_positive_resident_set_size_for_the_current_process(self):
        sample = harness.snapshot_system()

        assert sample.rss_bytes > 0
        assert sample.num_threads > 0

    def test_reads_zero_video_memory_without_an_accelerator(self):
        sample = harness.snapshot_system()

        assert sample.vram_bytes == sample_vram_bytes()
