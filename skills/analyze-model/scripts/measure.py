import argparse
import asyncio
import json
import os
import pathlib
import subprocess
import sys
import threading
import time

from build_result import (
    add_condition_arguments,
    build_result,
    item_records,
    load_tokenizer,
    measure_output,
    split_conditions,
    split_skip_modules,
    validate_condition_arguments,
    write_result,
)
from check_benchmark import validation_problems
from collect import MetricsCollector, emit
from mindor.core.compose.manager import ComposeManager
from mindor.dsl.loader import load_compose_config
from mindor.dsl.schema.component.impl.model.tasks.common import DeviceMode
from pydantic import TypeAdapter
from read_inputs import (
    inputs_digest,
    item_workflow_input,
    read_benchmark,
    read_inputs,
)
from save_outputs import reset_directory, write_item_output
from select_output import output_field_problem
from watch import (
    check_contention,
    contention_problems,
    measure_hardware,
    watch_hardware,
)

EXIT_BUSY = 3
AUTO_DEVICE = "auto"
DEFAULT_ID = "__default__"
UNIFIED_MEMORY_SOURCE = (
    "\n"
    "import torch\n"
    "if torch.cuda.is_available():\n"
    "    print(int(bool(getattr(torch.cuda.get_device_properties(0), "
    "'is_integrated', 0))))\n"
    "elif torch.backends.mps.is_available():\n"
    "    print(1)\n"
)


def parse_arguments(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--compose-file", required=True, type=pathlib.Path)
    parser.add_argument("--serve", action="store_true")
    parser.add_argument("--controller-port", type=int, default=None)
    parser.add_argument("--webui-port", type=int, default=None)
    parser.add_argument("--ready-timeout", type=float, default=1200.0)
    parser.add_argument("--shutdown-timeout", type=float, default=120.0)
    parser.add_argument(
        "--device",
        action="append",
        default=[],
        metavar="COMPONENT=DEVICE",
        help=(
            "Overrides the device the compose file gives one model component, "
            "so a file written for one accelerator runs on another unedited."
        ),
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help=(
            "Pins the seed of every action that accepts one, in memory only. "
            "A sampling model left unseeded gives machine_distance nothing to "
            "measure, because two runs of one machine already differ."
        ),
    )
    parser.add_argument(
        "--option",
        action="append",
        default=[],
        metavar="COMPONENT.SETTING=VALUE",
        help=(
            "Overrides one setting the compose file gives a component, so a "
            "machine that needs its own setting to run at all is measured "
            "without editing what was released. The pair is recorded in "
            "conditions, because the row was measured under it."
        ),
    )
    parser.add_argument(
        "--item-limit",
        type=int,
        default=None,
        help=(
            "Runs only the first N items of the inputs file. The digest still "
            "covers the whole file, so the row stays comparable, and the "
            "smaller sample shows up as item_count."
        ),
    )
    add_condition_arguments(parser)

    return validate_condition_arguments(parser, parser.parse_args(argv))


def resolve_default(configs, wanted):
    if wanted != DEFAULT_ID:
        return next(
            (config for config in configs if config.id == wanted), None
        )

    if len(configs) == 1:
        return configs[0]

    return next(
        (config for config in configs if getattr(config, "default", False)),
        None,
    )


def nested_jobs(job):
    branches = [getattr(job, "do", None), *(getattr(job, "steps", None) or [])]

    return [branch for branch in branches if branch is not None]


def job_component_ids(job):
    referenced = getattr(job, "component", None)
    found = [referenced] if isinstance(referenced, str) else []

    for nested in nested_jobs(job):
        found.extend(job_component_ids(nested))

    return found


def component_references(component):
    workflows = [
        action.workflow
        for action in getattr(component, "actions", None) or []
        if getattr(action, "workflow", None)
    ]
    workflows.extend(
        tool
        for tool in getattr(component, "tools", None) or []
        if isinstance(tool, str)
    )
    components = [
        getattr(referrer, "component", None)
        for referrer in (
            getattr(component, "model", None),
            getattr(component, "summary", None),
        )
        if referrer is not None
    ]

    return workflows, [
        component_id for component_id in components if component_id
    ]


def needed_component_ids(config, workflow_id):
    wanted_workflows, wanted_components = [workflow_id], []
    seen_workflows, needed = set(), set()

    while wanted_workflows or wanted_components:
        while wanted_workflows:
            wanted = wanted_workflows.pop()

            if wanted in seen_workflows:
                continue

            seen_workflows.add(wanted)
            workflow = resolve_default(config.workflows, wanted)

            if workflow is None:
                raise ValueError(
                    f"the compose file has no workflow {wanted!r}"
                )

            for job in workflow.jobs:
                wanted_components.extend(job_component_ids(job))

        while wanted_components:
            wanted = wanted_components.pop()
            component = resolve_default(config.components, wanted)

            if component is None:
                raise ValueError(
                    f"workflow {workflow_id!r} names a component {wanted!r} "
                    "this compose file does not define"
                )

            if component.id in needed:
                continue

            needed.add(component.id)
            workflows, components = component_references(component)
            wanted_workflows.extend(workflows)
            wanted_components.extend(components)

    return needed


def apply_serving(config, serve, controller_port, webui_port, needed):
    if not serve:
        config.controller.adapters = []
        config.controller.webui = None
        config.components = [
            component
            for component in config.components
            if component.id in needed
        ]

        return config

    if controller_port is not None:
        for adapter in config.controller.adapters:
            adapter.port = controller_port

    if webui_port is not None and config.controller.webui is not None:
        config.controller.webui.port = webui_port

    return config


def apply_devices(config, devices):
    components = {component.id: component for component in config.components}

    for component_id, device in devices.items():
        component = components.get(component_id)

        if component is None:
            raise ValueError(
                f"--device names no component {component_id!r}; the compose "
                f"file has {sorted(components)}"
            )

        if not hasattr(component, "device"):
            raise ValueError(
                f"--device names component {component_id!r}, which has no "
                "device setting"
            )

        component.device = device

        if hasattr(component, "device_mode") and device != AUTO_DEVICE:
            component.device_mode = DeviceMode.SINGLE

    return config


def option_value(component, setting, raw):
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = raw

    field = type(component).model_fields.get(setting)

    if field is None:
        return parsed

    try:
        return TypeAdapter(field.annotation).validate_python(parsed)
    except Exception as error:
        raise ValueError(
            f"--option gives {setting!r} the value {raw!r}, which the compose "
            f"schema rejects: {error}"
        ) from error


def apply_options(config, options):
    components = {component.id: component for component in config.components}

    for name, raw in options.items():
        component_id, _, setting = name.partition(".")

        if not setting:
            raise ValueError(
                f"--option takes COMPONENT.SETTING=VALUE, not {name!r}"
            )

        component = components.get(component_id)

        if component is None:
            raise ValueError(
                f"--option names no component {component_id!r}; the compose "
                f"file has {sorted(components)}"
            )

        if not hasattr(component, setting):
            raise ValueError(
                f"--option names component {component_id!r}, which has no "
                f"{setting!r} setting"
            )

        setattr(component, setting, option_value(component, setting, raw))

    return config


def seedable_actions(config, needed):
    return [
        (component, action)
        for component in config.components
        if component.id in needed
        for action in getattr(component, "actions", None) or []
        if hasattr(action, "seed")
    ]


def apply_seed(config, seed, needed):
    seedable = seedable_actions(config, needed)

    if seed is None:
        unpinned = [
            pair for pair in seedable if getattr(pair[1], "seed", None) is None
        ]

        if unpinned:
            named = ", ".join(
                f"{component.id}.{action.id}" for component, action in unpinned
            )

            raise ValueError(
                "--seed was omitted and these actions have no seed of their "
                f"own: {named}. A model left to sample freely makes every "
                "machine_distance verdict meaningless, because its distance "
                "from itself grows until any machine falls inside it"
            )

        return config

    if not seedable:
        raise ValueError(
            "--seed was given but no action in the compose file accepts a seed"
        )

    for _, action in seedable:
        action.seed = seed

    return config


def device_conditions(devices):
    return {
        f"{component_id}.device": device
        for component_id, device in devices.items()
    }


def limited_items(items, item_limit):
    if item_limit is None:
        return items

    if item_limit < 1 or item_limit > len(items):
        raise SystemExit(
            f"--item-limit {item_limit} is outside the {len(items)} items the "
            "inputs file holds"
        )

    return items[:item_limit]


def option_conditions(options):
    return dict(options)


def seed_conditions(seed):
    return {} if seed is None else {"seed": seed}


def item_limit_conditions(item_limit):
    return {} if item_limit is None else {"item_limit": item_limit}


def component_python_paths(config):
    for component in config.components:
        runtime = getattr(component, "runtime", None)
        path = getattr(runtime, "path", None)

        if path is None:
            continue

        for candidate in (
            pathlib.Path(path) / "bin" / "python",
            pathlib.Path(path) / "Scripts" / "python.exe",
        ):
            if candidate.exists():
                yield candidate


def ask_component_python(config, source):
    for python in component_python_paths(config):
        try:
            output = subprocess.run(
                [str(python), "-c", source],
                capture_output=True,
                text=True,
                timeout=60,
            )
        except (subprocess.SubprocessError, OSError):
            continue

        if output.returncode == 0 and output.stdout.strip():
            return output.stdout.strip()

    return None


def torch_build(config):
    version = ask_component_python(
        config, "import torch; print(torch.__version__)"
    )

    if version is not None:
        return f"pytorch {version}"

    try:
        import torch
    except ImportError:
        return "pytorch version unread"

    return f"pytorch {torch.__version__}"


def memory_conditions(config):
    answer = ask_component_python(config, UNIFIED_MEMORY_SOURCE)

    return {} if answer is None else {"unified_memory": answer == "1"}


def runtime_label(config, serve):
    label = f"model-compose + {torch_build(config)}"

    return f"{label}, adapters served" if serve else label


def stop_request_path():
    return pathlib.Path.cwd() / ".stop"


def remove_stop_request():
    stop_file = stop_request_path()

    if stop_file.exists():
        stop_file.unlink()


def clear_stale_stop_request():
    stop_file = stop_request_path()

    if not stop_file.exists():
        return None

    stop_file.unlink()

    return (
        f"removed a stale {stop_file}; the controller polls for that file "
        "every second and stops as soon as it sees one, so a run that was "
        "killed during shutdown makes every later run in this directory stop "
        "about a second after starting"
    )


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
        await asyncio.wait_for(
            manager.terminate_services(verbose=False), timeout
        )
        shutdown_error = None
    except asyncio.TimeoutError:
        shutdown_error = (
            f"shutdown did not finish within {timeout:g}s; a component "
            "subprocess may still hold this machine's accelerator memory"
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


async def drain_streams(value, note_first_chunk):
    if hasattr(value, "__aiter__"):
        chunks = []

        async for chunk in value:
            if not chunks:
                note_first_chunk()

            chunks.append(chunk)

        try:
            return b"".join(memoryview(chunk).tobytes() for chunk in chunks)
        except TypeError:
            emit(
                "item",
                "unjoined_stream",
                types=sorted({type(chunk).__name__ for chunk in chunks}),
            )

            return chunks

    if isinstance(value, dict):
        return {
            key: await drain_streams(child, note_first_chunk)
            for key, child in value.items()
        }

    if isinstance(value, (list, tuple)):
        return [
            await drain_streams(child, note_first_chunk) for child in value
        ]

    return value


async def run_item(
    manager, benchmark, item, collector, output_directory, tokenizer
):
    item_id = str(item["id"])
    workflow_input = item_workflow_input(benchmark["workflow_input"], item)
    collector.ingest(emit("item", "start", id=item_id))

    try:
        state = await manager.run_workflow(
            benchmark["workflow"],
            workflow_input,
            output_path=None,
            verbose=False,
        )

        if state.error:
            raise RuntimeError(str(state.error))

        streamed = []

        def note_first_chunk():
            if not streamed:
                streamed.append(True)
                collector.ingest(emit("item", "first_output", id=item_id))

        output = await drain_streams(state.output, note_first_chunk)

        if not streamed:
            collector.ingest(emit("item", "first_output", id=item_id))

        collector.ingest(emit("item", "done", id=item_id))
    except Exception as error:
        collector.ingest(
            emit(
                "item",
                "error",
                id=item_id,
                message=f"{error.__class__.__name__}: {error}",
            )
        )

        return None, None

    output_error = write_item_output(output_directory, item_id, output)
    field_problem = output_field_problem(benchmark, output)

    if field_problem is not None:
        collector.ingest(
            emit("item", "error", id=item_id, message=field_problem)
        )

        return None, None

    return (
        measure_output(output, benchmark.get("output_field"), tokenizer),
        output_error,
    )


async def run_items(
    manager, benchmark, items, collector, output_directory, tokenizer
):
    output_measures = {}
    output_errors = []

    for item in items:
        measures, output_error = await run_item(
            manager, benchmark, item, collector, output_directory, tokenizer
        )

        if measures is None:
            break

        output_measures[str(item["id"])] = measures

        if output_error is not None:
            output_errors.append(output_error)

    return output_measures, output_errors


async def run(arguments):
    stale_stop_request = clear_stale_stop_request()

    if stale_stop_request is not None:
        emit("runtime", "cleared_stop_request", message=stale_stop_request)

    benchmark = read_benchmark(arguments.benchmark)
    problems = validation_problems(benchmark)

    if problems:
        raise SystemExit("benchmark.json is invalid: " + "; ".join(problems))

    contention_before_launch = check_contention()
    busy = contention_problems(contention_before_launch)

    if busy:
        print(
            "other processes are using this machine before launch: "
            + "; ".join(busy),
            file=sys.stderr,
        )

        raise SystemExit(EXIT_BUSY)

    items = limited_items(read_inputs(arguments.inputs), arguments.item_limit)
    tokenizer = load_tokenizer(benchmark.get("tokenizer"))
    devices = split_conditions(arguments.device)
    options = split_conditions(arguments.option)
    reset_directory(arguments.output_directory)
    launch_time = time.time()

    config = load_compose_config(
        str(arguments.compose_file.parent), [arguments.compose_file], env={}
    )
    needed = needed_component_ids(config, benchmark["workflow"])
    config = apply_serving(
        config,
        arguments.serve,
        arguments.controller_port,
        arguments.webui_port,
        needed,
    )
    config = apply_devices(config, devices)
    config = apply_options(config, options)
    config = apply_seed(config, arguments.seed, needed)
    manager = ComposeManager(config, daemon=True)
    launch = asyncio.create_task(
        manager.launch_services(detach=False, verbose=False)
    )

    try:
        await await_ready(manager, launch, arguments.ready_timeout)
    except Exception:
        arm_force_exit(
            arguments.shutdown_timeout * 2,
            1,
            "shutdown after a failed launch did not reach process exit "
            f"within {arguments.shutdown_timeout * 2:g}s; exiting hard so no "
            "component subprocess keeps this machine's accelerator",
        )
        await shutdown_or_die(manager, launch, arguments.shutdown_timeout)
        remove_stop_request()

        raise

    ready_snapshot = measure_hardware()
    ready_time = time.time()
    cold_start_seconds = round(ready_time - launch_time, 4)

    collector = MetricsCollector()
    collector.ingest(emit("runtime", "ready", event_time=ready_time))
    collector.note_ready(ready_snapshot)

    stop_watching = threading.Event()
    watcher = threading.Thread(
        target=watch_hardware, args=(collector, stop_watching), daemon=True
    )
    watcher.start()

    try:
        output_measures, output_errors = await run_items(
            manager,
            benchmark,
            items,
            collector,
            arguments.output_directory,
            tokenizer,
        )
    finally:
        stop_watching.set()
        watcher.join(timeout=2)

    valid, errors = collector.is_valid()
    valid = valid and not output_errors
    errors = [*errors, *output_errors]
    summary = collector.summary() if valid else {}

    if summary:
        summary["contention"]["before_launch"] = contention_before_launch

    result = build_result(
        target=arguments.target,
        machine=arguments.machine,
        runtime=runtime_label(config, arguments.serve),
        build=arguments.build,
        precision=arguments.precision,
        quantization=arguments.quantization,
        quantization_backend=arguments.quantization_backend,
        quantization_skip_modules=split_skip_modules(
            arguments.quantization_skip_modules
        ),
        batch=arguments.batch,
        inputs_sha256=inputs_digest(arguments.inputs),
        extra_conditions={
            **split_conditions(arguments.condition),
            **device_conditions(devices),
            **option_conditions(options),
            **seed_conditions(arguments.seed),
            **item_limit_conditions(arguments.item_limit),
            **memory_conditions(config),
        },
        cold_start_seconds=cold_start_seconds,
        items=item_records(items, collector.item_seconds(), output_measures),
        summary=summary,
        valid=valid,
        errors=errors,
    )
    write_result(arguments, result)

    arm_force_exit(
        arguments.shutdown_timeout * 2,
        0 if valid else 1,
        "shutdown did not reach process exit within "
        f"{arguments.shutdown_timeout * 2:g}s; exiting hard so no component "
        "subprocess keeps this machine's accelerator",
    )

    shutdown_error = await shutdown_or_die(
        manager, launch, arguments.shutdown_timeout
    )
    remove_stop_request()

    if shutdown_error is not None:
        result["errors"] = [*errors, shutdown_error]
        write_result(arguments, result)

    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0 if valid and shutdown_error is None else 1)


def main():
    asyncio.run(run(parse_arguments()))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main())
