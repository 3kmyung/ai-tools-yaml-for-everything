"""Screenshot every animation template at every supported aspect ratio.

Five combinations is still more than anyone will reliably click through by
hand, and most of what is being looked for — something clipped, wrapped, or
crowded at one ratio — is only visible, never assertable. So this produces
the contact sheet and a human looks once.

One failure it does assert, for waveform: the credit line must not paint
over either neighbouring-track label. Those three are ordinary flex siblings
of a row, so "do these two painted rectangles intersect" is a real question
with a real answer. It is also the exact regression that shipped —
`#credit` lost its `overflow: hidden` and, for a title short enough to leave
`Renderer.fitText` alone, ran straight through `#prev` and `#next`.

**Run it with a short title as well as a long one.** The two exercise
different code: a long title trips fitText into a wrapped `-webkit-box` and
is safe by construction, while a short one stays a single unbreakable inline
run — the case that broke. A sheet checked only against the default long
title reports fifteen clean frames over a template that is visibly wrong.

Run `model-compose up` in the example directory first, then:

    python tools/screenshot-ratios.py
    python tools/screenshot-ratios.py --title "Papillon"
"""
from __future__ import annotations

import argparse
import asyncio
import pathlib
import sys
import urllib.parse

from playwright.async_api import async_playwright

BASE_URL = "http://127.0.0.1:8081/render"
STYLES = ["waveform"]
RATIOS = {
    "16:9": (1280, 720),
    "4:3": (960, 720),
    "1:1": (720, 720),
    "3:4": (720, 960),
    "9:16": (720, 1280),
}
OUTPUT_DIR = pathlib.Path(__file__).parent / "shots"

# A real title, not the eight-character preview fixture — long enough to
# wrap in every template's title element at every ratio.
DEFAULT_TITLE = "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)"

# Which styles get the footer assertion, and which elements it compares.
# waveform's footer is three plain flex siblings, so an intersection is
# unambiguous. A future template whose footer overlaps by design (an alpha
# overlay, say) should leave itself out of this map instead — a rect test
# there would only produce noise.
FOOTER_CHECKS = {"waveform": ("credit", ("prev", "next"))}

# What each element actually paints, which is not always its own box: an
# element with `overflow: visible` paints its line boxes wherever they land,
# including outside itself, and an element that clips paints nothing beyond
# its border box however far its text runs. Measuring the wrong one of those
# two is precisely how the overlap went unnoticed — #credit's box was always
# a well-behaved third of the row while its text was not.
INK_RECTS_JS = """
(ids) => {
  const inkRect = (element) => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    const plain = { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    if (getComputedStyle(element).overflow !== "visible") return plain;

    // Overflowing content is painted outside the box, so the box is not what
    // the eye sees. A Range over the contents yields one rect per rendered
    // line box, which is.
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = [...range.getClientRects()];
    if (!rects.length) return plain;
    return {
      left: Math.min(plain.left, ...rects.map((r) => r.left)),
      right: Math.max(plain.right, ...rects.map((r) => r.right)),
      top: Math.min(plain.top, ...rects.map((r) => r.top)),
      bottom: Math.max(plain.bottom, ...rects.map((r) => r.bottom)),
    };
  };

  return Object.fromEntries(ids.map((id) => [id, inkRect(document.getElementById(id))]));
}
"""


def overlap(a: dict, b: dict) -> tuple[float, float]:
    """Width and height of the intersection of two rects; (0, 0) if disjoint."""
    return (
        max(0.0, min(a["right"], b["right"]) - max(a["left"], b["left"])),
        max(0.0, min(a["bottom"], b["bottom"]) - max(a["top"], b["top"])),
    )


async def check_footer(page, style: str) -> list[str]:
    """Assert the credit line does not paint over either nav label."""
    check = FOOTER_CHECKS.get(style)
    if not check:
        return []

    subject_id, neighbour_ids = check
    rects = await page.evaluate(INK_RECTS_JS, [subject_id, *neighbour_ids])

    missing = [id for id, rect in rects.items() if rect is None]
    if missing:
        return [f"#{', #'.join(missing)} missing from the frame"]

    subject = rects[subject_id]
    problems = []
    for neighbour_id in neighbour_ids:
        width, height = overlap(subject, rects[neighbour_id])
        if width > 0 and height > 0:
            problems.append(
                f"#{subject_id} paints over #{neighbour_id} "
                f"({width:.0f}x{height:.0f}px of overlap)"
            )
    return problems


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--title",
        default=DEFAULT_TITLE,
        help="Title to render in place of the preview fixture's own (default: a long realistic YouTube title).",
    )
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(exist_ok=True)
    failures: list[str] = []
    title_param = urllib.parse.quote(args.title)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)

        for style in STYLES:
            for ratio, (width, height) in RATIOS.items():
                page = await browser.new_page(viewport={"width": width, "height": height})
                errors: list[str] = []
                page.on("pageerror", lambda error: errors.append(str(error)))

                await page.goto(f"{BASE_URL}/animation-{style}.html?ratio={ratio}&title={title_param}")
                try:
                    await page.wait_for_function(
                        "typeof window.__renderer?.seek === 'function'", timeout=15000
                    )
                    await page.evaluate("() => window.__renderer.seek(1.5)")
                    # After seek(), so the layout being measured is the one
                    # the screenshot below captures — fitText has run and the
                    # per-frame labels are written.
                    errors.extend(await check_footer(page, style))
                except Exception as error:  # noqa: BLE001 — reported, not raised
                    errors.append(str(error))

                name = f"{style}-{ratio.replace(':', 'x')}.png"
                await page.screenshot(path=str(OUTPUT_DIR / name))
                await page.close()

                if errors:
                    failures.append(f"{name}: {errors[0]}")
                    print(f"FAIL {name}: {errors[0]}")
                elif style in FOOTER_CHECKS:
                    print(f"ok   {name} (footer clear)")
                else:
                    print(f"ok   {name}")

        await browser.close()

    print(f"\n{len(STYLES) * len(RATIOS) - len(failures)}/{len(STYLES) * len(RATIOS)} rendered")
    print(f"title: {args.title!r}")
    print(f"shots in {OUTPUT_DIR}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
