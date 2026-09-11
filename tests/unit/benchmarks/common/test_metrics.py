"""Unit tests for ``benchmarks.common.metrics``."""

import subprocess
import sys
from pathlib import Path

import pytest

from benchmarks.common.metrics import MetricsCollector, SystemSample, sample_vram_bytes


REPOSITORY_ROOT = Path(__file__).resolve().parents[4]


def _collector_with_video_memory_readings(readings):
    collector = MetricsCollector()
    collector.input_start_t = 0.0
    collector.first_output_t = 1.0
    collector.done_t = 2.0
    for reading in readings:
        collector.add_sample(rss_bytes=0, cpu_percent=0.0, num_threads=1,
                             vram_bytes=reading)
    return collector


class TestSystemSample:
    def test_records_video_memory_bytes(self):
        sample = SystemSample(t=1.0, rss_bytes=100, cpu_percent=1.0,
                              num_threads=2, vram_bytes=500)
        assert sample.vram_bytes == 500

    def test_video_memory_defaults_to_zero(self):
        sample = SystemSample(t=1.0, rss_bytes=100, cpu_percent=1.0,
                              num_threads=2)
        assert sample.vram_bytes == 0


class TestSummaryVideoMemory:
    def test_reports_peak_video_memory_alongside_peak_resident_set(self):
        collector = _collector_with_video_memory_readings([100, 400, 200])
        summary = collector.summary()
        assert summary["vram"]["peak_bytes"] == 400
        assert "peak_bytes" in summary["rss"]

    def test_peak_is_not_the_last_reading(self):
        collector = _collector_with_video_memory_readings([100, 900, 300])
        summary = collector.summary()
        assert summary["vram"]["peak_bytes"] == 900
        assert summary["vram"]["peak_bytes"] != collector.samples[-1].vram_bytes


class TestSampleVideoMemoryBytes:
    def test_records_zero_without_an_accelerator(self):
        assert sample_vram_bytes() == 0

    def test_records_zero_when_torch_is_absent(self, monkeypatch):
        monkeypatch.setitem(sys.modules, "torch", None)
        assert sample_vram_bytes() == 0


class TestModuleImportWithoutTorch:
    def test_module_imports_when_torch_cannot_be_found(self):
        result = subprocess.run(
            [sys.executable, "-c",
             "import sys; sys.modules['torch'] = None; "
             "import benchmarks.common.metrics"],
            cwd=REPOSITORY_ROOT,
            capture_output=True,
        )
        assert result.returncode == 0, result.stderr.decode("utf-8", errors="replace")
