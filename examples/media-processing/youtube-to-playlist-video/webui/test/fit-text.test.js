import { test, assertEqual } from "./harness.js";

/*
 * Pins Renderer.fitText: the function every template calls once during
 * setup (never from inside seek()) to keep a real YouTube title — which
 * routinely runs past the eight-character preview fixture — from wrapping
 * past its box and getting clipped by the stage. See common.js's fitText
 * for the mechanism: count the line boxes the text actually occupies, step
 * the font-size down while there are too many, then clamp.
 *
 * The tight-line-height cases below are the ones that matter most. The
 * first implementation asked "does it fit?" with scrollHeight vs
 * clientHeight, which is a question about glyph ink rather than about
 * lines: at a tight line-height a font's ascent+descent is taller than its
 * own line box, so a single line that never wraps reads as overflow. A
 * template that authors a tight title had its short titles silently shrunk
 * to minSize, and the suite missed it because it only ever exercised a
 * roomy 1.2.
 */

/*
 * Builds a fixed-width, off-screen box, hands it to fn, then removes it.
 * lineHeight is a parameter rather than a constant precisely because it is
 * the axis the fit test used to be wrong on.
 */
function withBox(lineHeight, fn) {
  const box = document.createElement("div");
  box.style.position = "fixed";
  box.style.left = "-9999px";
  box.style.top = "0";
  box.style.width = "300px";
  box.style.fontSize = "48px";
  box.style.lineHeight = lineHeight;
  document.body.appendChild(box);

  try {
    fn(box);
  } finally {
    box.remove();
  }
}

const LONG_TITLE =
  "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)";

test("fitText shrinks a long title until it fits maxLines, but never below minSize", () => {
  withBox("1.2", (box) => {
    box.textContent = LONG_TITLE;

    const finalSize = Renderer.fitText(box, { maxLines: 3, minSize: 20 });

    const lineHeight = parseFloat(getComputedStyle(box).lineHeight);
    const maxHeight = lineHeight * 3 + 1; // +1px slack for sub-pixel rounding

    if (finalSize >= 48) {
      throw new Error(`expected font-size to shrink below 48px, got ${finalSize}`);
    }
    if (finalSize < 20) {
      throw new Error(`expected font-size to never go below minSize 20px, got ${finalSize}`);
    }
    if (box.clientHeight > maxHeight) {
      throw new Error(
        `expected the clamped box (${box.clientHeight}) to fit within 3 line-boxes (~${maxHeight}), it did not`
      );
    }
  });
});

test("fitText leaves an already-fitting title's font-size unchanged", () => {
  withBox("1.2", (box) => {
    box.textContent = "Papillon";

    const before = parseFloat(getComputedStyle(box).fontSize);
    const finalSize = Renderer.fitText(box, { maxLines: 3, minSize: 20 });

    assertEqual(finalSize, before, "fitText should not shrink text that already fits");
    assertEqual(box.style.fontSize, "48px", "fitText should not rewrite font-size for text that already fits");
  });
});

/*
 * The regression the scrollHeight-based fit test shipped with. A title that
 * occupies one line at line-height 1 must come back untouched — same size,
 * same rendered height, and no styles written onto the element at all,
 * since a template's composition is built on where that box's edges land.
 */
test("fitText leaves a one-line title untouched at a tight line-height", () => {
  withBox("1", (box) => {
    box.textContent = "Papillon";

    const sizeBefore = parseFloat(getComputedStyle(box).fontSize);
    const heightBefore = box.getBoundingClientRect().height;

    const finalSize = Renderer.fitText(box, { maxLines: 3, minSize: 20 });

    assertEqual(finalSize, sizeBefore, "a one-line title at line-height 1 must not be shrunk");
    assertEqual(
      box.getBoundingClientRect().height,
      heightBefore,
      "a one-line title at line-height 1 must not change the box's rendered height"
    );
    assertEqual(box.style.fontSize, "48px", "font-size must not be rewritten");
    assertEqual(box.style.display, "", "display must not be rewritten for text that already fits");
    assertEqual(box.style.webkitLineClamp, "", "no clamp belongs on text that already fits");
  });
});

/*
 * The other half of the same guard: a tight line-height must not make
 * fitText timid either. A long title still has to come down.
 */
test("fitText still shrinks a long title at a tight line-height", () => {
  withBox("1", (box) => {
    box.textContent = LONG_TITLE;

    const finalSize = Renderer.fitText(box, { maxLines: 3, minSize: 20 });

    if (finalSize >= 48) {
      throw new Error(`expected font-size to shrink below 48px, got ${finalSize}`);
    }
    if (finalSize < 20) {
      throw new Error(`expected font-size to never go below minSize 20px, got ${finalSize}`);
    }

    const lineHeight = parseFloat(getComputedStyle(box).lineHeight);
    if (box.clientHeight > lineHeight * 3 + 1) {
      throw new Error(
        `expected the clamped box (${box.clientHeight}) to fit within 3 line-boxes (~${lineHeight * 3 + 1})`
      );
    }
  });
});
