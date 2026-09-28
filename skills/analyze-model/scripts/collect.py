import json
import time
from dataclasses import dataclass, field

from watch import (
    BYTES_PER_MEBIBYTE,
    HardwareSnapshot,
    cpu_contention_problem,
)


@dataclass
class ItemTiming:
    item_id: str
    start_time: float
    first_output_time: float | None = None
    done_time: float | None = None
    error: str | None = None


@dataclass
class MetricsCollector:
    ready_time: float | None = None
    ready_snapshot: HardwareSnapshot | None = None
    items: dict[str, ItemTiming] = field(default_factory=dict)
    snapshots: list[HardwareSnapshot] = field(default_factory=list)
    other_gpu_processes: list[str] = field(default_factory=list)
    vram_peak_bytes: int | None = None

    def note_ready(self, snapshot):
        if self.ready_snapshot is None:
            self.ready_snapshot = snapshot

    def ingest(self, line):
        line = line.strip()

        if not line:
            return

        try:
            event_record = json.loads(line)
        except json.JSONDecodeError:
            return

        stage = event_record.get("stage")
        event = event_record.get("event")
        event_time = float(event_record.get("time", time.time()))
        detail = event_record.get("detail") or {}

        if stage == "runtime" and event == "ready" and self.ready_time is None:
            self.ready_time = event_time

        if stage == "item":
            self._ingest_item(event, event_time, detail)

    def _ingest_item(self, event, event_time, detail):
        item_id = str(detail.get("id"))

        if event == "start":
            self.items[item_id] = ItemTiming(
                item_id=item_id, start_time=event_time
            )

            return

        timing = self.items.get(item_id)

        if timing is None:
            return

        if event == "first_output" and timing.first_output_time is None:
            timing.first_output_time = event_time

        if event == "done":
            timing.done_time = event_time

        if event == "error":
            timing.error = str(detail.get("message"))

    def add_snapshot(self, snapshot):
        self.snapshots.append(snapshot)

    def note_other_gpu_processes(self, labels):
        self.other_gpu_processes = labels

    def note_vram_peak(self, peak_bytes):
        self.vram_peak_bytes = peak_bytes

    def contention(self):
        cores = [snapshot.other_cpu_cores for snapshot in self.snapshots]

        return {
            "other_cpu_cores": {
                "mean": round(sum(cores) / len(cores), 2) if cores else 0.0,
                "p95": round(self._percentile(cores, 0.95), 2),
            },
            "other_gpu_processes": self.other_gpu_processes,
        }

    def is_valid(self):
        errors = []
        contention_problem = cpu_contention_problem(
            self.contention()["other_cpu_cores"]["mean"], []
        )

        if contention_problem is not None:
            errors.append(f"during the run {contention_problem}")

        if self.ready_time is None:
            errors.append("missing runtime.ready")

        if not self.items:
            errors.append("no item.start was recorded")

        for timing in self.items.values():
            if timing.error is not None:
                errors.append(f"item {timing.item_id}: {timing.error}")
            elif timing.first_output_time is None or timing.done_time is None:
                errors.append(
                    f"item {timing.item_id}: missing item.first_output or "
                    "item.done"
                )

        return (not errors, errors)

    def _percentile(self, values, fraction):
        if not values:
            return 0.0

        ordered = sorted(values)
        position = (len(ordered) - 1) * fraction
        lower = int(position)
        upper = min(lower + 1, len(ordered) - 1)

        return ordered[lower] + (ordered[upper] - ordered[lower]) * (
            position - lower
        )

    def item_seconds(self):
        return {
            timing.item_id: {
                "time_to_first_output_seconds": round(
                    timing.first_output_time - timing.start_time, 4
                ),
                "end_to_end_seconds": round(
                    timing.done_time - timing.start_time, 4
                ),
            }
            for timing in self.items.values()
            if timing.first_output_time is not None
            and timing.done_time is not None
        }

    def _distribution(self, values):
        return {
            "median": round(self._percentile(values, 0.5), 4),
            "p95": round(self._percentile(values, 0.95), 4),
            "max": round(max(values, default=0.0), 4),
        }

    def summary(self):
        per_item = self.item_seconds()
        first_output_series = [
            seconds["time_to_first_output_seconds"]
            for seconds in per_item.values()
        ]
        end_to_end_series = [
            seconds["end_to_end_seconds"] for seconds in per_item.values()
        ]
        last_done_time = max(
            timing.done_time for timing in self.items.values()
        )

        rss_series = [snapshot.rss_bytes for snapshot in self.snapshots]
        cpu_series = [snapshot.cpu_percent for snapshot in self.snapshots]
        thread_series = [snapshot.num_threads for snapshot in self.snapshots]
        vram_series = [
            snapshot.vram_bytes
            for snapshot in self.snapshots
            if snapshot.vram_bytes is not None
        ]
        vram_peaks = [
            peak
            for peak in (*vram_series, self.vram_peak_bytes)
            if peak is not None
        ]
        vram_peak_bytes = max(vram_peaks) if vram_peaks else None

        rss = {
            "ready_mb": (
                round(self.ready_snapshot.rss_bytes / BYTES_PER_MEBIBYTE, 1)
                if self.ready_snapshot
                else 0.0
            ),
            "peak_bytes": max(rss_series, default=0),
            "peak_mb": round(
                max(rss_series, default=0) / BYTES_PER_MEBIBYTE, 1
            ),
            "mean_mb": (
                round(
                    sum(rss_series) / len(rss_series) / BYTES_PER_MEBIBYTE, 1
                )
                if rss_series
                else 0.0
            ),
            "p95_mb": round(
                self._percentile(rss_series, 0.95) / BYTES_PER_MEBIBYTE, 1
            ),
            "final_mb": (
                round(rss_series[-1] / BYTES_PER_MEBIBYTE, 1)
                if rss_series
                else 0.0
            ),
        }
        cpu = {
            "peak_percent": round(max(cpu_series, default=0.0), 1),
            "mean_percent": (
                round(sum(cpu_series) / len(cpu_series), 1)
                if cpu_series
                else 0.0
            ),
            "p95_percent": round(self._percentile(cpu_series, 0.95), 1),
        }
        threads = {
            "peak": max(thread_series, default=0),
            "final": thread_series[-1] if thread_series else 0,
        }
        vram = {
            "peak_bytes": vram_peak_bytes,
            "peak_mb": (
                round(vram_peak_bytes / BYTES_PER_MEBIBYTE, 1)
                if vram_peak_bytes is not None
                else None
            ),
            "mean_mb": (
                round(
                    sum(vram_series) / len(vram_series) / BYTES_PER_MEBIBYTE, 1
                )
                if vram_series
                else None
            ),
            "p95_mb": (
                round(
                    self._percentile(vram_series, 0.95) / BYTES_PER_MEBIBYTE, 1
                )
                if vram_series
                else None
            ),
        }

        return {
            "total_seconds": round(last_done_time - self.ready_time, 4),
            "item_count": len(per_item),
            "item_time_to_first_output_seconds": self._distribution(
                first_output_series
            ),
            "item_end_to_end_seconds": self._distribution(end_to_end_series),
            "rss": rss,
            "cpu": cpu,
            "threads": threads,
            "vram": vram,
            "contention": self.contention(),
            "snapshot_count": len(self.snapshots),
        }


def emit(stage, event, event_time=None, **detail):
    payload = {
        "time": event_time if event_time is not None else time.time(),
        "stage": stage,
        "event": event,
    }

    if detail:
        payload["detail"] = detail

    line = json.dumps(payload)
    print(line, flush=True)

    return line
