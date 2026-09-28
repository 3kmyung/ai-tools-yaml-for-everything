import argparse
import base64
import io
import json
import pathlib
import sys
import tempfile
import time
import typing

import screenshot
from websockets.exceptions import WebSocketException
from websockets.sync.client import connect

DEFAULT_TIMEOUT_SECONDS = 600
MOUNT_TIMEOUT_SECONDS = 20
SEND_TIMEOUT_SECONDS = 10
RESTORE_TIMEOUT_SECONDS = 30
POLL_SECONDS = 0.1
PENDING_SETTLE_SECONDS = 0.05
ALIGNED_SETTLE_SECONDS = 0.05
RESULT_TOP_ATTEMPTS = 3
PENDING_SCREEN = "pending-1440-light"
RESTORED_SCREEN = "restored-1440-light"
EMPTY_SCREEN = "empty"
THREAD_SCREEN = "thread"
RESULT_TOP_SCREEN = "result-top"
VIEWPORTS = ((1440, 900), (800, 1024), (390, 844))
THEMES = ("light", "dark")
FULL_VIEWS = tuple(
    (viewport, theme) for viewport in VIEWPORTS for theme in THEMES
)
RESULT_TOP_VIEWS = (((1440, 900), "light"), ((390, 844), "dark"))
SAMPLE_VIEWS = (((1440, 900), "light"),)
RESTORED_VIEWPORT = (1440, 900)
RESTORED_THEME = "light"
SCREENSHOT_SUFFIX = ".png"
PENDING_REPLY = "pending"
RESULT_REPLY = "result"
FINISHED_REPLIES = ("result", "error", "cancelled")
COMPOSER_SELECTOR = "[data-composer]"
SEND_SELECTOR = "[data-send]"
THREAD_LINK_SELECTOR = "[data-thread-link]"
LAST_REPLY_EXPRESSION = (
    "(() => { const turns = document.querySelectorAll('[data-turn]');"
    " const last = turns[turns.length - 1];"
    " return last?.querySelector('[data-reply]')?.dataset.reply ?? null; })()"
)
FAILURE_EXPRESSION = (
    "(() => { const turns = document.querySelectorAll('[data-turn]');"
    " const last = turns[turns.length - 1];"
    " return JSON.stringify({"
    " title: last?.querySelector('[data-failure-title]')?.innerText ?? '',"
    " hint: last?.querySelector('[data-failure-hint]')?.innerText ?? '' });"
    " })()"
)
ALIGN_LAST_REPLY_EXPRESSION = (
    "(() => { const replies = document.querySelectorAll('[data-reply]');"
    " const card = replies[replies.length - 1];"
    " if (!card) return false;"
    " let frame = card.parentElement;"
    " while (frame"
    " && !/(auto|scroll)/.test(getComputedStyle(frame).overflowY))"
    " frame = frame.parentElement;"
    " let chromeBottom = frame ? frame.getBoundingClientRect().top : 0;"
    " for (const node of document.querySelectorAll('body *')) {"
    " const position = getComputedStyle(node).position;"
    " if (position !== 'fixed' && position !== 'sticky') continue;"
    " if (node.contains(card)) continue;"
    " const rectangle = node.getBoundingClientRect();"
    " if (rectangle.height > 0 && rectangle.top <= chromeBottom"
    " && rectangle.bottom > chromeBottom) chromeBottom = rectangle.bottom; }"
    " const scroller = frame ?? document.scrollingElement;"
    " scroller.scrollTop += card.getBoundingClientRect().top - chromeBottom;"
    " return true; })()"
)
RESULT_TOP_PLACEMENT_EXPRESSION = (
    "(() => { const replies = document.querySelectorAll('[data-reply]');"
    " const card = replies[replies.length - 1];"
    " if (!card) return null;"
    " const firstRow = card.firstElementChild ?? card;"
    " return JSON.stringify({ top: card.getBoundingClientRect().top,"
    " firstRowBottom: firstRow.getBoundingClientRect().bottom,"
    " viewport: window.innerHeight }); })()"
)
SEND_STATE_EXPRESSION = (
    "(() => { const button = document.querySelector('[data-send]');"
    " return JSON.stringify({ present: !!button, disabled: !!button?.disabled,"
    " reason: button?.getAttribute('title') ?? '' }); })()"
)
EXIT_SUCCESS = 0
EXIT_FAILED = 1
View = tuple[tuple[int, int], str]


class ShootError(Exception):
    pass


class Capture(typing.NamedTuple):
    report: str
    fits: bool


class ResultTop(typing.NamedTuple):
    visible: bool
    report: str


def screen_file(screen: str, language: str) -> str:
    if language == screenshot.DEFAULT_LANGUAGE:
        return f"{screen}{SCREENSHOT_SUFFIX}"

    return f"{screen}.{language}{SCREENSHOT_SUFFIX}"


def parse_file_option(value: str) -> tuple[str, pathlib.Path]:
    field, separator, path_text = value.partition("=")
    path = pathlib.Path(path_text)

    if not separator or not field:
        raise argparse.ArgumentTypeError(f"expected FIELD=PATH, got '{value}'")

    if not path.is_file():
        raise argparse.ArgumentTypeError(f"not a file: {path_text}")

    return field, path.resolve()


def parse_prompt_option(value: str) -> tuple[str, str]:
    field, separator, text = value.partition("=")

    if not separator or not field:
        raise argparse.ArgumentTypeError(f"expected FIELD=TEXT, got '{value}'")

    return field, text


def parse_arguments(arguments: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog=pathlib.Path(__file__).name)
    parser.add_argument("--url", required=True)
    parser.add_argument("--out-directory", required=True, type=pathlib.Path)
    parser.add_argument(
        "--file",
        dest="files",
        action="append",
        type=parse_file_option,
        default=[],
        metavar="FIELD=PATH",
    )
    parser.add_argument(
        "--prompt",
        dest="prompts",
        action="append",
        type=parse_prompt_option,
        default=[],
        metavar="FIELD=TEXT",
    )
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    screenshot.add_language_argument(parser)
    parser.add_argument("--only-sample", action="store_true")

    return parser.parse_args(arguments)


def evaluate(session: screenshot.DevToolsSession, expression: str) -> object:
    result = session.send(
        "Runtime.evaluate", {"expression": expression, "returnByValue": True}
    )

    return result.get("result", {}).get("value")


def wait_for(
    session: screenshot.DevToolsSession,
    expression: str,
    timeout_seconds: float,
) -> bool:
    deadline = time.monotonic() + timeout_seconds

    while time.monotonic() < deadline:
        if evaluate(session, expression):
            return True

        time.sleep(POLL_SECONDS)

    return False


def set_view(
    session: screenshot.DevToolsSession, width: int, height: int, theme: str
) -> None:
    session.send(
        "Emulation.setDeviceMetricsOverride",
        {
            "width": width,
            "height": height,
            "deviceScaleFactor": 1,
            "mobile": False,
        },
    )
    session.send(
        "Emulation.setEmulatedMedia",
        {"features": [{"name": "prefers-color-scheme", "value": theme}]},
    )


def load_page(session: screenshot.DevToolsSession, url: str) -> None:
    session.fired_events.discard("Page.loadEventFired")
    navigation = session.send("Page.navigate", {"url": url})

    if navigation.get("errorText"):
        raise ShootError(f"could not load {url}: {navigation['errorText']}")

    session.wait_for_event("Page.loadEventFired")

    if str(evaluate(session, "location.href")).startswith(
        screenshot.CHROME_ERROR_PREFIX
    ):
        raise ShootError(f"could not load {url}: Chrome showed its error page")

    if not wait_for(
        session,
        f"!!document.querySelector('{COMPOSER_SELECTOR}')",
        MOUNT_TIMEOUT_SECONDS,
    ):
        raise ShootError(f"{url} did not render the shell composer")


def query_node(session: screenshot.DevToolsSession, selector: str) -> int:
    document = session.send("DOM.getDocument")
    node = session.send(
        "DOM.querySelector",
        {"nodeId": document["root"]["nodeId"], "selector": selector},
    )
    node_identifier: int = node.get("nodeId", 0)

    return node_identifier


def click(session: screenshot.DevToolsSession, selector: str) -> None:
    box = evaluate(
        session,
        f"JSON.stringify(document.querySelector({json.dumps(selector)})"
        "?.getBoundingClientRect() ?? null)",
    )
    rectangle = json.loads(str(box))

    if rectangle is None:
        raise ShootError(f"nothing matches {selector}")

    x = rectangle["left"] + rectangle["width"] / 2
    y = rectangle["top"] + rectangle["height"] / 2

    for event_type in ("mousePressed", "mouseReleased"):
        session.send(
            "Input.dispatchMouseEvent",
            {
                "type": event_type,
                "x": x,
                "y": y,
                "button": "left",
                "clickCount": 1,
            },
        )


def fill_draft(
    session: screenshot.DevToolsSession,
    files: list[tuple[str, pathlib.Path]],
    prompts: list[tuple[str, str]],
) -> None:
    for field, path in files:
        node_identifier = query_node(
            session, f'input[data-file-slot="{field}"]'
        )

        if not node_identifier:
            raise ShootError(f"the composer has no file slot named '{field}'")

        session.send(
            "DOM.setFileInputFiles",
            {"nodeId": node_identifier, "files": [str(path)]},
        )

    for field, text in prompts:
        node_identifier = query_node(session, f'[data-prompt="{field}"]')

        if not node_identifier:
            raise ShootError(
                f"the composer has no prompt field named '{field}'"
            )

        session.send("DOM.focus", {"nodeId": node_identifier})
        session.send("Input.insertText", {"text": text})


def submit(session: screenshot.DevToolsSession) -> None:
    deadline = time.monotonic() + SEND_TIMEOUT_SECONDS

    while True:
        state = json.loads(str(evaluate(session, SEND_STATE_EXPRESSION)))

        if state["present"] and not state["disabled"]:
            break

        if time.monotonic() >= deadline:
            raise ShootError(
                f"the send button stayed blocked: {state['reason']}"
            )

        time.sleep(POLL_SECONDS)

    click(session, SEND_SELECTOR)


def take_capture(
    session: screenshot.DevToolsSession,
    path: pathlib.Path,
    width: int,
    settle_seconds: float = screenshot.SETTLE_SECONDS,
) -> Capture:
    time.sleep(settle_seconds)
    image = session.send("Page.captureScreenshot", {"format": "png"})
    path.write_bytes(base64.b64decode(image["data"]))
    measured = json.loads(
        str(evaluate(session, screenshot.MEASURE_EXPRESSION))
    )
    height = evaluate(session, "window.innerHeight")
    theme = (
        "dark"
        if evaluate(
            session, "matchMedia('(prefers-color-scheme: dark)').matches"
        )
        else "light"
    )

    return Capture(
        report=(
            f"{path} {measured['inner']}x{height} {theme}"
            f" scrollWidth={measured['scroll']}"
        ),
        fits=bool(
            measured["inner"] == width
            and measured["scroll"] <= measured["inner"]
        ),
    )


def capture(
    session: screenshot.DevToolsSession,
    path: pathlib.Path,
    width: int,
) -> bool:
    taken = take_capture(session, path, width)
    print(taken.report)

    return taken.fits


def wait_for_reply(
    session: screenshot.DevToolsSession,
    pending_path: pathlib.Path | None,
    timeout: int,
) -> str:
    deadline = time.monotonic() + timeout
    pending_captured = False

    if pending_path is not None:
        pending_path.unlink(missing_ok=True)

    while time.monotonic() < deadline:
        reply = evaluate(session, LAST_REPLY_EXPRESSION)

        if (
            pending_path is not None
            and reply == PENDING_REPLY
            and not pending_captured
        ):
            taken = take_capture(
                session, pending_path, VIEWPORTS[0][0], PENDING_SETTLE_SECONDS
            )
            pending_captured = (
                evaluate(session, LAST_REPLY_EXPRESSION) == PENDING_REPLY
            )

            if pending_captured:
                print(taken.report)
            else:
                pending_path.unlink()
                reply = evaluate(session, LAST_REPLY_EXPRESSION)

        if reply in FINISHED_REPLIES:
            if pending_path is not None and not pending_captured:
                print(
                    "note: the run finished before the pending card was"
                    " captured"
                )

            return str(reply)

        time.sleep(POLL_SECONDS)

    raise ShootError(
        f"no result, error or cancel card within {timeout} seconds"
    )


def capture_views(
    session: screenshot.DevToolsSession,
    out_directory: pathlib.Path,
    screen: str,
    views: typing.Iterable[View],
    language: str,
) -> list[str]:
    overflowing: list[str] = []

    for (width, height), theme in views:
        set_view(session, width, height, theme)
        path = out_directory / screen_file(
            f"{screen}-{width}-{theme}", language
        )

        if not capture(session, path, width):
            overflowing.append(f"{screen} {width} {theme}")

    return overflowing


def result_top_is_visible(placement: dict[str, float]) -> bool:
    return (
        placement["top"] >= 0
        and placement["firstRowBottom"] <= placement["viewport"]
    )


def describe_result_top(placement: dict[str, float]) -> str:
    return (
        f"top={placement['top']:.0f}"
        f" firstRowBottom={placement['firstRowBottom']:.0f}"
        f" viewport={placement['viewport']:.0f}"
    )


def align_result_top(session: screenshot.DevToolsSession) -> ResultTop:
    report = ""

    for _ in range(RESULT_TOP_ATTEMPTS):
        if not evaluate(session, ALIGN_LAST_REPLY_EXPRESSION):
            raise ShootError("the thread has no reply card to scroll to")

        time.sleep(screenshot.SETTLE_SECONDS)
        measured = evaluate(session, RESULT_TOP_PLACEMENT_EXPRESSION)

        if measured is None:
            raise ShootError("the thread has no reply card to scroll to")

        placement: dict[str, float] = json.loads(str(measured))
        report = describe_result_top(placement)

        if result_top_is_visible(placement):
            return ResultTop(True, report)

    return ResultTop(False, report)


def capture_result_tops(
    session: screenshot.DevToolsSession,
    out_directory: pathlib.Path,
    views: typing.Iterable[View],
    language: str,
) -> list[str]:
    overflowing: list[str] = []

    for (width, height), theme in views:
        set_view(session, width, height, theme)
        aligned = align_result_top(session)
        path = out_directory / screen_file(
            f"{RESULT_TOP_SCREEN}-{width}-{theme}", language
        )

        if not aligned.visible:
            print(
                f"note: {RESULT_TOP_SCREEN} {width} {theme} still cuts off"
                f" the card's first row ({aligned.report})"
            )

        taken = take_capture(session, path, width, ALIGNED_SETTLE_SECONDS)
        print(taken.report)

        if not taken.fits:
            overflowing.append(f"{RESULT_TOP_SCREEN} {width} {theme}")

    return overflowing


def capture_restored(
    session: screenshot.DevToolsSession,
    url: str,
    out_directory: pathlib.Path,
    reply: str,
    language: str,
) -> list[str]:
    width, height = RESTORED_VIEWPORT
    set_view(session, width, height, RESTORED_THEME)
    load_page(session, url)
    click(session, THREAD_LINK_SELECTOR)

    if not wait_for(
        session,
        f"{LAST_REPLY_EXPRESSION} === {json.dumps(reply)}",
        RESTORE_TIMEOUT_SECONDS,
    ):
        raise ShootError(
            "the thread did not come back from history after a reload"
        )

    path = out_directory / screen_file(RESTORED_SCREEN, language)

    return [] if capture(session, path, width) else ["restored 1440 light"]


def run_screens(
    session: screenshot.DevToolsSession, options: argparse.Namespace, url: str
) -> tuple[str, dict[str, str], list[str]]:
    out_directory = options.out_directory
    language = options.language
    empty_views = SAMPLE_VIEWS if options.only_sample else FULL_VIEWS
    pending_path = (
        None
        if options.only_sample
        else out_directory / screen_file(PENDING_SCREEN, language)
    )
    set_view(session, *VIEWPORTS[0], THEMES[0])
    load_page(session, url)
    overflowing = capture_views(
        session, out_directory, EMPTY_SCREEN, empty_views, language
    )
    set_view(session, *VIEWPORTS[0], THEMES[0])
    fill_draft(session, options.files, options.prompts)
    submit(session)
    reply = wait_for_reply(session, pending_path, options.timeout)
    failure: dict[str, str] = json.loads(
        str(evaluate(session, FAILURE_EXPRESSION))
    )

    if options.only_sample:
        overflowing += capture_result_tops(
            session, out_directory, SAMPLE_VIEWS, language
        )
        return reply, failure, overflowing

    overflowing += capture_views(
        session, out_directory, THREAD_SCREEN, FULL_VIEWS, language
    )
    overflowing += capture_result_tops(
        session, out_directory, RESULT_TOP_VIEWS, language
    )
    overflowing += capture_restored(
        session, url, out_directory, reply, language
    )

    return reply, failure, overflowing


def shoot(options: argparse.Namespace) -> int:
    program_name = pathlib.Path(__file__).name
    options.out_directory.mkdir(parents=True, exist_ok=True)
    url = screenshot.with_language(options.url, options.language)

    with tempfile.TemporaryDirectory(
        prefix="shoot-screens-", ignore_cleanup_errors=True
    ) as directory:
        user_data_directory = pathlib.Path(directory)
        chrome = screenshot.launch_chrome(
            user_data_directory, options.language
        )

        try:
            port = screenshot.wait_for_debugging_port(
                chrome, user_data_directory
            )

            with connect(
                screenshot.page_endpoint(port), max_size=None
            ) as websocket:
                session = screenshot.DevToolsSession(websocket)

                for domain in ("Page", "DOM", "Runtime"):
                    session.send(f"{domain}.enable")

                screenshot.emulate_language(session, options.language)
                reply, failure, overflowing = run_screens(
                    session, options, url
                )
        finally:
            screenshot.stop_chrome(chrome)

    problems: list[str] = []

    if reply != RESULT_REPLY:
        problems.append(
            f"{reply} card: {failure['title']} / {failure['hint']}"
        )

    if overflowing:
        problems.append(f"horizontal overflow at {', '.join(overflowing)}")

    for problem in problems:
        print(f"{program_name}: {problem}", file=sys.stderr)

    return EXIT_FAILED if problems else EXIT_SUCCESS


def main() -> int:
    for output_file in (sys.stdout, sys.stderr):
        if isinstance(output_file, io.TextIOWrapper):
            output_file.reconfigure(encoding="utf-8")

    program_name = pathlib.Path(__file__).name
    options = parse_arguments(sys.argv[1:])
    options.out_directory = options.out_directory.resolve()

    try:
        return shoot(options)
    except (
        ShootError,
        screenshot.ScreenshotError,
        OSError,
        WebSocketException,
    ) as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)
        return EXIT_FAILED


if __name__ == "__main__":
    sys.exit(main())
