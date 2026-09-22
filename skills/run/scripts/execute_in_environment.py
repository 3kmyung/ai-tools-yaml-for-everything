from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys
import typing

import diagnose
import locate
import serve


def command_directory(
    workspace: pathlib.Path, payload: dict[str, typing.Any]
) -> pathlib.Path:
    directory = (workspace / payload.get("directory", ".")).resolve()

    if not directory.is_dir():
        raise locate.RunError(
            f"{directory} is not a directory in the workspace"
        )

    return directory


def resolved_command(workspace: pathlib.Path, command: list[str]) -> list[str]:
    environment = locate.virtual_environment_variables(workspace)
    executable = (
        shutil.which(command[0], path=environment["PATH"]) or command[0]
    )

    return [executable, *command[1:]]


def execute(payload: dict[str, typing.Any]) -> int:
    workspace = locate.workspace_path(payload)
    directory = command_directory(workspace, payload)
    command = resolved_command(workspace, payload["command"])

    if not payload.get("detach"):
        return subprocess.run(
            command,
            cwd=directory,
            env=locate.virtual_environment_variables(workspace),
            stdin=subprocess.DEVNULL,
            check=False,
        ).returncode

    job_records, job_logs = locate.job_directories(workspace, payload)
    job_records.mkdir(parents=True, exist_ok=True)
    job_logs.mkdir(parents=True, exist_ok=True)

    job = str(len(list(job_records.glob("*.json"))) + 1)
    wrap_payload = {
        **payload,
        "job": job,
        "resolved": command,
        "resolved_directory": str(directory),
    }
    entry_file = sys.modules["__main__"].__file__

    process = locate.popen_detached(
        [
            str(locate.virtual_environment_python(workspace)),
            str(entry_file),
            "wrap",
            locate.encode_payload(wrap_payload),
        ],
        cwd=workspace,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    record = {
        "command": payload["command"],
        "directory": str(directory),
        "pid": process.pid,
    }
    (job_records / f"{job}.json").write_text(
        json.dumps(record), encoding="utf-8"
    )
    print(f"job {job} started, log: {job_logs / (job + '.txt')}", flush=True)

    return locate.EXIT_SUCCESS


def wrap(payload: dict[str, typing.Any]) -> int:
    workspace = locate.workspace_path(payload)
    job_records, job_logs = locate.job_directories(workspace, payload)

    with (job_logs / f"{payload['job']}.txt").open("wb") as log:
        code = subprocess.run(
            payload["resolved"],
            cwd=payload["resolved_directory"],
            env=locate.virtual_environment_variables(workspace),
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            check=False,
        ).returncode

    (job_records / f"{payload['job']}.exit").write_text(
        str(code), encoding="utf-8"
    )

    return code


def kill_jobs(workspace: pathlib.Path, payload: dict[str, typing.Any]) -> str:
    import psutil

    job_records, _ = locate.job_directories(workspace, payload)
    record_paths = (
        sorted(job_records.glob("*.json")) if job_records.is_dir() else []
    )
    processes: dict[int, typing.Any] = {}
    killed = []

    for record_path in record_paths:
        if record_path.with_suffix(".exit").exists():
            continue

        pid = json.loads(record_path.read_text(encoding="utf-8")).get("pid")

        if pid is None:
            continue

        try:
            wrapper = psutil.Process(pid)
        except psutil.NoSuchProcess:
            continue

        if serve.runs_in_workspace(wrapper, workspace):
            serve.add_with_children(wrapper, processes)
            killed.append(record_path.stem)

    serve.kill_processes(list(processes.values()))

    if not killed:
        return "no job was running"

    return f"killed jobs {', '.join(killed)}"


def status(payload: dict[str, typing.Any]) -> int:
    workspace = locate.workspace_path(payload)
    job_records, job_logs = locate.job_directories(workspace, payload)
    names = (
        sorted((path.stem for path in job_records.glob("*.json")), key=int)
        if job_records.is_dir()
        else []
    )

    if not names:
        print("no jobs", flush=True)

        return locate.EXIT_SUCCESS

    job = payload.get("job")

    if job is not None and job not in names:
        raise locate.RunError(f"no job {job}; jobs: {', '.join(names)}")

    for name in names if job is None else [job]:
        exit_path = job_records / f"{name}.exit"
        state = (
            f"exited with code {exit_path.read_text(encoding='utf-8')}"
            if exit_path.exists()
            else "running"
        )
        command = json.loads(
            (job_records / f"{name}.json").read_text(encoding="utf-8")
        )["command"]
        print(f"job {name}: {state}: {' '.join(command)}", flush=True)
        tail = locate.log_tail(
            job_logs / f"{name}.txt",
            payload.get("lines", locate.LOG_TAIL_LINES),
        )
        print(diagnose.annotated(tail), flush=True)

    return locate.EXIT_SUCCESS
