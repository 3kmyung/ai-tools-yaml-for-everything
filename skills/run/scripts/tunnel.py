import os
import pathlib
import signal
import subprocess
import sys
import time

import locate

TUNNEL_READY_TIMEOUT_SECONDS = 20
TUNNEL_ALIVE_SECONDS = 15
TUNNEL_ALIVE_COUNT = 3
TUNNEL_RETRY_SECONDS = 2
TUNNEL_POLL_SECONDS = 0.5
ORPHANED_SSH_QUERY = (
    "Get-CimInstance Win32_Process"
    " -Filter \"ParentProcessId={pid} and Name='ssh.exe'\""
    " | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force }}"
)


def free_local_port(start: int) -> int:
    port = start

    while locate.port_in_use(port):
        port += 1

    return port


def keep_tunnel(host: str, local_port: int, remote_port: int) -> None:
    while True:
        subprocess.run(
            [
                "ssh",
                "-N",
                *locate.SSH_BATCH_OPTIONS,
                "-o",
                "ExitOnForwardFailure=yes",
                "-o",
                f"ServerAliveInterval={TUNNEL_ALIVE_SECONDS}",
                "-o",
                f"ServerAliveCountMax={TUNNEL_ALIVE_COUNT}",
                "-L",
                f"{local_port}:{locate.HOST}:{remote_port}",
                host,
            ],
            stdin=subprocess.DEVNULL,
            check=False,
        )
        time.sleep(TUNNEL_RETRY_SECONDS)


def kill_orphaned_ssh(parent_pid: int) -> None:
    subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            ORPHANED_SSH_QUERY.format(pid=parent_pid),
        ],
        capture_output=True,
        check=False,
    )


def kill_process(pid: int) -> None:
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            check=False,
        )
        kill_orphaned_ssh(pid)

        return

    try:
        os.killpg(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass


def open_tunnel(
    host: str, label: str, remote_port: int, log_path: pathlib.Path
) -> tuple[int, int]:
    local_port = free_local_port(remote_port)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    with log_path.open("ab") as log:
        process = locate.popen_detached(
            [
                sys.executable,
                "-B",
                str(pathlib.Path(__file__).resolve()),
                host,
                str(local_port),
                str(remote_port),
            ],
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
        )

    deadline = time.monotonic() + TUNNEL_READY_TIMEOUT_SECONDS

    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise locate.RunError(
                f"ssh tunnel for {label} port {remote_port}"
                f" exited with code {process.returncode}",
                locate.EXIT_UNREACHABLE,
            )

        if locate.port_in_use(local_port):
            return process.pid, local_port

        time.sleep(TUNNEL_POLL_SECONDS)

    kill_process(process.pid)
    raise locate.RunError(
        f"ssh tunnel for {label} port {remote_port}"
        f" did not open in {TUNNEL_READY_TIMEOUT_SECONDS} seconds",
        locate.EXIT_UNREACHABLE,
    )


if __name__ == "__main__":
    keep_tunnel(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]))
