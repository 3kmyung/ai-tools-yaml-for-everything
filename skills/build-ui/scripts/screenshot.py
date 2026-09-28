import argparse
import base64
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import typing
import urllib.parse
import urllib.request

from websockets.exceptions import WebSocketException
from websockets.sync.client import ClientConnection, connect

LANGUAGE_QUERY_KEY = "lang"
DEFAULT_LANGUAGE = "en"
CHROME_LOCALES = {"en": "en-US", "ko": "ko-KR", "zh": "zh-CN"}
DEFAULT_CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe"
ACTIVE_PORT_FILE = "DevToolsActivePort"
LAUNCH_TIMEOUT_SECONDS = 20
LAUNCH_POLL_SECONDS = 0.1
RESPONSE_TIMEOUT_SECONDS = 30
SETTLE_SECONDS = 0.6
EXIT_TIMEOUT_SECONDS = 10
CHROME_ERROR_PREFIX = "chrome-error://"
MEASURE_EXPRESSION = (
    "JSON.stringify({ href: location.href, inner: window.innerWidth,"
    " scroll: document.documentElement.scrollWidth })"
)
EXIT_SUCCESS = 0
EXIT_FAILED = 1


class ScreenshotError(Exception):
    pass


class DevToolsSession:
    def __init__(self, websocket: ClientConnection) -> None:
        self.websocket = websocket
        self.next_identifier = 1
        self.fired_events: set[str] = set()

    def receive(self) -> dict[str, typing.Any]:
        try:
            frame = self.websocket.recv(timeout=RESPONSE_TIMEOUT_SECONDS)
        except TimeoutError as error:
            raise ScreenshotError(
                f"Chrome sent nothing for {RESPONSE_TIMEOUT_SECONDS} seconds"
            ) from error

        message: dict[str, typing.Any] = json.loads(frame)

        if "method" in message:
            self.fired_events.add(message["method"])

        return message

    def send(
        self, method: str, params: dict[str, typing.Any] | None = None
    ) -> dict[str, typing.Any]:
        identifier = self.next_identifier
        self.next_identifier += 1
        self.websocket.send(
            json.dumps(
                {
                    "id": identifier,
                    "method": method,
                    "params": params or {},
                }
            )
        )

        while True:
            message = self.receive()

            if message.get("id") != identifier:
                continue

            if "error" in message:
                raise ScreenshotError(
                    f"{method} failed: {message['error'].get('message')}"
                )

            result: dict[str, typing.Any] = message.get("result", {})
            return result

    def wait_for_event(self, method: str) -> None:
        while method not in self.fired_events:
            self.receive()


def add_language_argument(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--lang",
        dest="language",
        choices=tuple(CHROME_LOCALES),
        default=DEFAULT_LANGUAGE,
    )


def parse_arguments(arguments: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog=pathlib.Path(__file__).name)
    parser.add_argument("--url", required=True)
    parser.add_argument("--out", required=True, type=pathlib.Path)
    parser.add_argument("--width", type=int, default=1440)
    parser.add_argument("--height", type=int, default=900)
    parser.add_argument("--theme", choices=("light", "dark"), default="light")
    add_language_argument(parser)

    return parser.parse_args(arguments)


def with_language(url: str, language: str) -> str:
    parts = urllib.parse.urlsplit(url)
    query = [
        (key, value)
        for key, value in urllib.parse.parse_qsl(
            parts.query, keep_blank_values=True
        )
        if key != LANGUAGE_QUERY_KEY
    ]
    query.append((LANGUAGE_QUERY_KEY, language))

    return urllib.parse.urlunsplit(
        parts._replace(query=urllib.parse.urlencode(query))
    )


def emulate_language(session: DevToolsSession, language: str) -> None:
    chrome_locale = CHROME_LOCALES[language]
    user_agent = session.send("Browser.getVersion")["userAgent"]
    session.send("Emulation.setLocaleOverride", {"locale": chrome_locale})
    session.send(
        "Emulation.setUserAgentOverride",
        {
            "userAgent": user_agent,
            "acceptLanguage": f"{chrome_locale},{language}",
        },
    )


def launch_chrome(
    user_data_directory: pathlib.Path, language: str = DEFAULT_LANGUAGE
) -> subprocess.Popen[bytes]:
    chrome_path = os.environ.get("CHROME_PATH", DEFAULT_CHROME_PATH)
    chrome_locale = CHROME_LOCALES[language]

    return subprocess.Popen(
        [
            chrome_path,
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--no-first-run",
            "--remote-debugging-port=0",
            f"--user-data-dir={user_data_directory}",
            f"--lang={chrome_locale}",
            f"--accept-lang={chrome_locale},{language}",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def wait_for_debugging_port(
    chrome: subprocess.Popen[bytes], user_data_directory: pathlib.Path
) -> int:
    active_port_file = user_data_directory / ACTIVE_PORT_FILE
    deadline = time.monotonic() + LAUNCH_TIMEOUT_SECONDS

    while time.monotonic() < deadline:
        if chrome.poll() is not None:
            raise ScreenshotError(
                f"Chrome exited early with code {chrome.returncode}"
            )

        if active_port_file.is_file() and active_port_file.read_text().strip():
            return int(active_port_file.read_text().split()[0])

        time.sleep(LAUNCH_POLL_SECONDS)

    raise ScreenshotError("Chrome did not report a debugging port")


def page_endpoint(port: int) -> str:
    with urllib.request.urlopen(
        f"http://127.0.0.1:{port}/json/list"
    ) as response:
        targets = json.load(response)

    for target in targets:
        if target.get("type") == "page":
            endpoint: str = target["webSocketDebuggerUrl"]
            return endpoint

    raise ScreenshotError("Chrome opened no page target")


def capture(
    session: DevToolsSession, options: argparse.Namespace
) -> tuple[int, int]:
    session.send(
        "Emulation.setDeviceMetricsOverride",
        {
            "width": options.width,
            "height": options.height,
            "deviceScaleFactor": 1,
            "mobile": False,
        },
    )
    session.send(
        "Emulation.setEmulatedMedia",
        {
            "features": [
                {"name": "prefers-color-scheme", "value": options.theme}
            ]
        },
    )
    session.send("Page.enable")
    session.fired_events.discard("Page.loadEventFired")

    url = with_language(options.url, options.language)
    navigation = session.send("Page.navigate", {"url": url})

    if navigation.get("errorText"):
        raise ScreenshotError(
            f"could not load {url}: {navigation['errorText']}"
        )

    session.wait_for_event("Page.loadEventFired")
    time.sleep(SETTLE_SECONDS)

    evaluation = session.send(
        "Runtime.evaluate",
        {"expression": MEASURE_EXPRESSION, "returnByValue": True},
    )
    measured = json.loads(evaluation["result"]["value"])

    if measured["href"].startswith(CHROME_ERROR_PREFIX):
        raise ScreenshotError(
            f"could not load {url}: Chrome showed its error page"
        )

    screenshot = session.send("Page.captureScreenshot", {"format": "png"})
    options.out.write_bytes(base64.b64decode(screenshot["data"]))

    return measured["inner"], measured["scroll"]


def stop_chrome(chrome: subprocess.Popen[bytes]) -> None:
    chrome.terminate()

    try:
        chrome.wait(timeout=EXIT_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        chrome.kill()
        chrome.wait()


def take_screenshot(options: argparse.Namespace) -> None:
    with tempfile.TemporaryDirectory(
        prefix="screenshot-", ignore_cleanup_errors=True
    ) as directory:
        user_data_directory = pathlib.Path(directory)
        chrome = launch_chrome(user_data_directory, options.language)

        try:
            port = wait_for_debugging_port(chrome, user_data_directory)

            with connect(page_endpoint(port), max_size=None) as websocket:
                inner_width, scroll_width = capture(
                    DevToolsSession(websocket), options
                )
        finally:
            stop_chrome(chrome)

    print(
        f"{options.out} {inner_width}x{options.height} {options.theme}"
        f" scrollWidth={scroll_width}"
    )

    if inner_width != options.width:
        raise ScreenshotError(
            f"viewport is {inner_width}px, asked for {options.width}px"
        )

    if scroll_width > inner_width:
        raise ScreenshotError(
            f"horizontal overflow: scrollWidth {scroll_width}"
            f" > innerWidth {inner_width}"
        )


def main() -> int:
    for output_file in (sys.stdout, sys.stderr):
        if isinstance(output_file, io.TextIOWrapper):
            output_file.reconfigure(encoding="utf-8")

    program_name = pathlib.Path(__file__).name
    options = parse_arguments(sys.argv[1:])
    options.out = options.out.resolve()

    try:
        take_screenshot(options)
    except (ScreenshotError, OSError, WebSocketException) as error:
        print(f"{program_name}: error: {error}", file=sys.stderr)
        return EXIT_FAILED

    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.exit(main())
