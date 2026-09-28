import argparse
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

EXIT_SUCCESS = 0
EXIT_CAPTURE_FAILED = 1
EXIT_USAGE = 2

FFMPEG = "ffmpeg"
DEFAULT_WIDTH = 1440
DEFAULT_HEIGHT = 900
DEFAULT_DURATION_MILLISECONDS = 6000
SETTLE_MILLISECONDS = 1500
VIDEO_FRAME_RATE = 30
GIF_FRAME_RATE = 12
GIF_MAXIMUM_COLORS = 256
DEFAULT_GIF_WIDTH = 960
ASSET_DIRECTORY_NAME = "__demo__"
READY_STATE = "load"
PERFORM_HOOK = "demoPerform"


class CaptureError(Exception):
    pass


def asset_path(name, path):
    return f"/{ASSET_DIRECTORY_NAME}/{name}{path.suffix}"


def route_assets(page, assets):
    for name, path in assets.items():
        page.route(
            f"**{asset_path(name, path)}",
            lambda route, request, path=path: route.fulfill(path=str(path)),
        )


def perform(page, setup_source, assets):
    if setup_source is None:
        return

    asset_urls = {
        name: asset_path(name, path) for name, path in assets.items()
    }

    page.evaluate(f"() => {{ window.demoAssets = {json.dumps(asset_urls)}; }}")
    page.evaluate("() => {\n" + setup_source + "\n}")
    page.evaluate(
        f"(async () => {{ const fn = window.{PERFORM_HOOK};"
        f" if (typeof fn === 'function') await fn(); }})()"
    )


def capture_screenshot(url, output_path, width, height, setup_source, assets):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": height})

        route_assets(page, assets)
        page.goto(url, wait_until=READY_STATE)
        page.wait_for_timeout(SETTLE_MILLISECONDS)
        perform(page, setup_source, assets)
        page.wait_for_timeout(SETTLE_MILLISECONDS)
        page.screenshot(path=str(output_path))
        browser.close()


def record_video(
    url,
    output_directory,
    width,
    height,
    duration_milliseconds,
    setup_source,
    assets,
):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(
            viewport={"width": width, "height": height},
            record_video_dir=str(output_directory),
            record_video_size={"width": width, "height": height},
        )
        page = context.new_page()
        started = time.monotonic()

        route_assets(page, assets)
        page.goto(url, wait_until=READY_STATE)
        page.wait_for_timeout(SETTLE_MILLISECONDS)
        lead_in_seconds = time.monotonic() - started
        perform(page, setup_source, assets)
        page.wait_for_timeout(duration_milliseconds)

        recording = page.video.path()

        context.close()
        browser.close()

    return pathlib.Path(recording), round(lead_in_seconds, 3)


def run_ffmpeg(command_arguments):
    if shutil.which(FFMPEG) is None:
        raise CaptureError(
            f"{FFMPEG} is not on the path; a video or a GIF cannot be "
            f"assembled"
        )

    completed = subprocess.run(
        [FFMPEG, *command_arguments],
        capture_output=True,
        text=True,
        check=False,
    )

    if completed.returncode != 0:
        raise CaptureError(
            f"ffmpeg exited {completed.returncode}:\n"
            f"{completed.stderr.strip()}"
        )


def assemble_video(recording, output_path, lead_in_seconds, gif_width):
    run_ffmpeg(
        [
            "-y",
            "-ss",
            str(lead_in_seconds),
            "-i",
            str(recording),
            "-vf",
            "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
            "-r",
            str(VIDEO_FRAME_RATE),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(output_path),
        ]
    )


def assemble_gif(recording, output_path, lead_in_seconds, gif_width):
    palette = f"palettegen=max_colors={GIF_MAXIMUM_COLORS}:stats_mode=diff"
    filters = (
        f"fps={GIF_FRAME_RATE},scale={gif_width}:-1:flags=lanczos,"
        f"split[source][sampled];"
        f"[sampled]{palette}[palette];"
        "[source][palette]paletteuse=dither=sierra2_4a:diff_mode=rectangle"
    )

    run_ffmpeg(
        [
            "-y",
            "-ss",
            str(lead_in_seconds),
            "-i",
            str(recording),
            "-filter_complex",
            filters,
            "-loop",
            "0",
            str(output_path),
        ]
    )


def requested_output(arguments):
    requested = [
        (arguments.screenshot, None),
        (arguments.video, assemble_video),
        (arguments.gif, assemble_gif),
    ]

    return [
        (path, assemble) for path, assemble in requested if path is not None
    ]


def capture(output_path, assemble, arguments, setup_source, assets):
    if assemble is None:
        capture_screenshot(
            arguments.url,
            output_path,
            arguments.width,
            arguments.height,
            setup_source,
            assets,
        )

        return

    with tempfile.TemporaryDirectory(
        prefix="release-capture-"
    ) as work_directory:
        recording, lead_in_seconds = record_video(
            arguments.url,
            pathlib.Path(work_directory),
            arguments.width,
            arguments.height,
            arguments.duration,
            setup_source,
            assets,
        )

        assemble(recording, output_path, lead_in_seconds, arguments.gif_width)


def main():
    program_name = pathlib.Path(__file__).name
    parser = argparse.ArgumentParser(prog=program_name)
    parser.add_argument(
        "--url",
        required=True,
        help=(
            "The interface to capture: the gradio or component address the "
            "yaml-for-everything:run skill's up printed for a replay folder."
        ),
    )
    parser.add_argument("--screenshot", type=pathlib.Path, default=None)
    parser.add_argument("--video", type=pathlib.Path, default=None)
    parser.add_argument("--gif", type=pathlib.Path, default=None)
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_HEIGHT)
    parser.add_argument(
        "--duration", type=int, default=DEFAULT_DURATION_MILLISECONDS
    )
    parser.add_argument(
        "--gif-width",
        type=int,
        default=DEFAULT_GIF_WIDTH,
        help=(
            "The width the GIF is scaled down to; the page is still recorded "
            "at --width."
        ),
    )
    parser.add_argument(
        "--setup",
        type=pathlib.Path,
        default=None,
        help=(
            "A JavaScript file the service supplies. It may define an async "
            "window.demoPerform that acts once recording has started and "
            "reads window.demoAssets."
        ),
    )
    parser.add_argument(
        "--asset",
        action="append",
        default=[],
        metavar="NAME=PATH",
        help=(
            "A file served beside the interface and named in "
            "window.demoAssets, so the setup script reaches the run's input "
            "without this script knowing what it is."
        ),
    )
    arguments = parser.parse_args()

    assets = {}

    for entry in arguments.asset:
        if "=" not in entry:
            parser.error(f"--asset takes NAME=PATH, not {entry!r}")

        name, path = entry.split("=", 1)
        assets[name] = pathlib.Path(path)

    missing = [str(path) for path in assets.values() if not path.is_file()]

    if missing:
        print(
            f"{program_name}: error: not a file: {', '.join(missing)}",
            file=sys.stderr,
        )

        return EXIT_USAGE

    if arguments.setup is not None and not arguments.setup.is_file():
        print(
            f"{program_name}: error: not a file: {arguments.setup}",
            file=sys.stderr,
        )

        return EXIT_USAGE

    requested = requested_output(arguments)

    if len(requested) != 1:
        print(
            f"{program_name}: error: pass exactly one of --screenshot, "
            f"--video or --gif",
            file=sys.stderr,
        )

        return EXIT_USAGE

    output_path, assemble = requested[0]
    setup_source = (
        arguments.setup.read_text(encoding="utf-8")
        if arguments.setup
        else None
    )

    try:
        capture(output_path, assemble, arguments, setup_source, assets)
    except (CaptureError, PlaywrightError) as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)

        return EXIT_CAPTURE_FAILED

    print(f"wrote {output_path.resolve()}")

    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main())
