import shutil
import statistics
import subprocess
import sys
import threading
import time
from dataclasses import dataclass

import psutil

BYTES_PER_MEBIBYTE = 1024 * 1024
NVIDIA_SMI_TIMEOUT_SECONDS = 10
OTHER_CPU_SHARE_LIMIT = 0.15
MINIMUM_OTHER_CPU_CORES_LIMIT = 1.0
OTHER_GPU_UTILIZATION_LIMIT = 10
IDLE_PROCESS_ID = 0
CONTENTION_CHECK_SECONDS = 5.0
CONTENTION_CHECK_INTERVAL = 0.5
BUSIEST_PROCESS_COUNT = 3


@dataclass
class HardwareSnapshot:
    time: float
    rss_bytes: int
    cpu_percent: float
    num_threads: int
    vram_bytes: int | None = None
    other_cpu_cores: float = 0.0


class ProcessTree:
    def __init__(self):
        self.root = psutil.Process()
        self.tracked = {self.root.pid: self.root}
        self.root.cpu_percent(None)
        psutil.cpu_percent(None)

    def refresh(self):
        for child in self.root.children(recursive=True):
            if child.pid not in self.tracked:
                try:
                    child.cpu_percent(None)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue

                self.tracked[child.pid] = child

        return self.tracked

    def pids(self):
        return set(self.tracked)


class AcceleratorReader:
    def __init__(self, tree, interval=1.0):
        self.tree = tree
        self.interval = interval
        self.value = None
        self.peak = None
        self.other_process_ids = set()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self._thread.start()

        return self

    def stop(self):
        self._stop.set()
        self._thread.join(timeout=self.interval + 5)

    def _run(self):
        while not self._stop.is_set():
            pids = self.tree.pids()
            apps = compute_apps()
            self.value, peak = accelerator_vram_bytes(pids, apps)
            self.other_process_ids |= other_compute_process_ids(pids, apps)

            if peak is not None:
                self.peak = max(self.peak or 0, peak)

            self._stop.wait(self.interval)


def torch_vram_bytes():
    torch = sys.modules.get("torch")

    if torch is None:
        return None, None

    if torch.cuda.is_available():
        peak = torch.cuda.max_memory_allocated()

        return (torch.cuda.memory_allocated(), peak) if peak else (None, None)

    if torch.backends.mps.is_available():
        current = torch.mps.current_allocated_memory()

        return (current, current) if current else (None, None)

    return None, None


def query_nvidia_smi(query):
    if shutil.which("nvidia-smi") is None:
        return None

    try:
        output = subprocess.run(
            ["nvidia-smi", query, "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=NVIDIA_SMI_TIMEOUT_SECONDS,
        )
    except (subprocess.SubprocessError, OSError):
        return None

    if output.returncode != 0:
        return None

    return [
        [field.strip() for field in line.split(",")]
        for line in output.stdout.splitlines()
        if line.strip()
    ]


def compute_apps():
    rows = query_nvidia_smi("--query-compute-apps=pid,used_memory")

    if rows is None:
        return None

    return [
        (int(fields[0]), int(fields[1]) if fields[1].isdigit() else None)
        for fields in rows
        if len(fields) == 2 and fields[0].isdigit()
    ]


def gpu_utilization_percents():
    rows = query_nvidia_smi("--query-gpu=utilization.gpu")

    if rows is None:
        return None

    percents = [int(fields[0]) for fields in rows if fields[0].isdigit()]

    return percents or None


def nvidia_smi_vram_bytes(pids, apps):
    if not pids or apps is None:
        return None

    own = [
        memory
        for pid, memory in apps
        if pid in pids and memory is not None
    ]

    if own:
        return sum(own) * BYTES_PER_MEBIBYTE

    if any(memory is None for _, memory in apps):
        return None

    return 0


def other_compute_process_ids(pids, apps):
    if apps is None:
        return set()

    return {pid for pid, _ in apps if pid not in pids}


def accelerator_vram_bytes(pids, apps):
    torch_current, torch_peak = torch_vram_bytes()
    nvidia_smi_current = nvidia_smi_vram_bytes(pids, apps)
    currents = [
        reading
        for reading in (torch_current, nvidia_smi_current)
        if reading is not None
    ]
    peaks = [
        reading
        for reading in (torch_peak, nvidia_smi_current)
        if reading is not None
    ]

    return (
        max(currents) if currents else None,
        max(peaks) if peaks else None,
    )


def other_cpu_cores(own_cpu_percent):
    system_cores = psutil.cpu_percent(None) * (psutil.cpu_count() or 1) / 100

    return round(max(0.0, system_cores - own_cpu_percent / 100), 2)


def measure_hardware(tree=None, vram_bytes=None, read_accelerator=True):
    tree = tree if tree is not None else ProcessTree()
    rss_bytes = 0
    cpu_percent = 0.0
    num_threads = 0

    for process in list(tree.refresh().values()):
        try:
            with process.oneshot():
                rss_bytes += process.memory_info().rss
                cpu_percent += process.cpu_percent(None)
                num_threads += process.num_threads()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    if vram_bytes is None and read_accelerator:
        vram_bytes, _ = accelerator_vram_bytes(tree.pids(), compute_apps())

    return HardwareSnapshot(
        time=time.time(),
        rss_bytes=rss_bytes,
        cpu_percent=cpu_percent,
        num_threads=num_threads,
        vram_bytes=vram_bytes,
        other_cpu_cores=other_cpu_cores(cpu_percent),
    )


def process_label(pid):
    try:
        return f"{psutil.Process(pid).name()} (pid {pid})"
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return f"pid {pid}"


def busiest_processes(processes, own_pid):
    usage = []

    for process in processes:
        if process.pid in (own_pid, IDLE_PROCESS_ID):
            continue

        try:
            usage.append((process.cpu_percent(None), process.pid))
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    busiest = sorted(usage, reverse=True)[:BUSIEST_PROCESS_COUNT]

    return [
        f"{process_label(pid)} at {percent / 100:.1f} cores"
        for percent, pid in busiest
        if percent > 0
    ]


def check_contention():
    own = psutil.Process()
    own.cpu_percent(None)
    psutil.cpu_percent(None)
    processes = list(psutil.process_iter())

    for process in processes:
        try:
            process.cpu_percent(None)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    cpu_samples = []
    gpu_samples = []
    deadline = time.monotonic() + CONTENTION_CHECK_SECONDS

    while time.monotonic() < deadline:
        time.sleep(CONTENTION_CHECK_INTERVAL)
        cpu_samples.append(other_cpu_cores(own.cpu_percent(None)))
        gpu_samples.append(gpu_utilization_percents())

    gpu_readings = [sample for sample in gpu_samples if sample is not None]

    return {
        "seconds": CONTENTION_CHECK_SECONDS,
        "other_cpu_cores": round(statistics.fmean(cpu_samples), 2),
        "gpu_utilization_percent": (
            [
                round(statistics.fmean(device))
                for device in zip(*gpu_readings)
            ]
            if gpu_readings
            else None
        ),
        "busiest_processes": busiest_processes(processes, own.pid),
    }


def other_cpu_cores_limit():
    return max(
        MINIMUM_OTHER_CPU_CORES_LIMIT,
        OTHER_CPU_SHARE_LIMIT * (psutil.cpu_count() or 1),
    )


def cpu_contention_problem(cores, busiest):
    limit = other_cpu_cores_limit()

    if cores <= limit:
        return None

    named = f": {', '.join(busiest)}" if busiest else ""

    return (
        f"other processes used {cores:g} CPU cores on average "
        f"(limit {limit:g}){named}"
    )


def contention_problems(check):
    cpu_problem = cpu_contention_problem(
        check["other_cpu_cores"], check["busiest_processes"]
    )
    gpu_problems = [
        f"GPU {index} was {percent}% busy "
        f"(limit {OTHER_GPU_UTILIZATION_LIMIT}%)"
        for index, percent in enumerate(
            check["gpu_utilization_percent"] or []
        )
        if percent > OTHER_GPU_UTILIZATION_LIMIT
    ]

    return [*([cpu_problem] if cpu_problem else []), *gpu_problems]


def watch_hardware(collector, stop, interval=0.1, accelerator_interval=1.0):
    tree = ProcessTree()
    accelerator = AcceleratorReader(tree, accelerator_interval).start()

    try:
        while not stop.is_set():
            collector.add_snapshot(
                measure_hardware(
                    tree, accelerator.value, read_accelerator=False
                )
            )
            stop.wait(interval)
    finally:
        accelerator.stop()
        collector.note_vram_peak(accelerator.peak)
        collector.note_other_gpu_processes(
            [
                process_label(pid)
                for pid in sorted(accelerator.other_process_ids)
            ]
        )
