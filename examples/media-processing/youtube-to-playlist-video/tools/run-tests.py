#!/usr/bin/env python3
"""
Headless runner for webui/test.html, standing in for "open it in a browser"
in an environment with no browser to open. Loads the page with Playwright,
waits for the harness (webui/test/harness.js) to set window.__testResult,
prints each result line the page rendered into #results, and exits non-zero
if anything failed.

Requires `model-compose up` (or any static server) already serving
examples/media-processing/youtube-to-playlist-video/webui on the given host.

Usage:
    python tools/run-tests.py [url]

`url` defaults to http://127.0.0.1:8081/test.html. Tasks 8-16 can point this
at other pages (e.g. a future test.html for a different area) by passing one.
"""
import sys

from playwright.sync_api import sync_playwright

DEFAULT_URL = "http://127.0.0.1:8081/test.html"


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL

    page_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("pageerror", lambda exc: page_errors.append(str(exc)))
        page.on("console", lambda msg: (
            page_errors.append(f"console.error: {msg.text}") if msg.type == "error" else None
        ))

        page.goto(url)

        try:
            page.wait_for_function("() => window.__testResult !== undefined", timeout=15000)
        except Exception:
            print(f"TIMEOUT waiting for window.__testResult on {url}")
            if page_errors:
                print("Page errors:")
                for err in page_errors:
                    print(f"  {err}")
            browser.close()
            sys.exit(1)

        result = page.evaluate("() => window.__testResult")
        lines = page.eval_on_selector_all(
            "#results li", "(items) => items.map((el) => el.textContent)"
        )

        browser.close()

    if page_errors:
        print("Page errors:")
        for err in page_errors:
            print(f"  {err}")

    for line in lines:
        print(line)

    total = result.get("total", 0)
    failed = result.get("failed", 0)
    print(f"__testResult: total={total} failed={failed}")

    if page_errors or failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
