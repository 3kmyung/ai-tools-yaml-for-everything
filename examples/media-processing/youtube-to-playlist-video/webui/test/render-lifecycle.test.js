import { test, assertEqual } from "./harness.js";

/*
 * Pins two behaviours that stage.test.js's pure pickStage() tests do not
 * touch, but that Task 15's live GUI preview builds directly on top of:
 *
 *   1. createStage() applies the output-resolution scale transform only for
 *      a real render (ctx.isPreview === false) — never for a preview, where
 *      fitToWindow() does the (different) fit-to-window transform instead.
 *      Applying both would compound.
 *   2. createContext()'s ctx.isPreview reflects "was this page opened with
 *      no injected renderer props" (true) vs "real props were already
 *      present" (false) — the switch start() gates the animation loop and
 *      fitToWindow() on.
 *
 * A regression in either (e.g. flipping !ctx.isPreview back to
 * !ctx.isDevPreview, or reintroducing double-scaling) would leave
 * stage.test.js's 6/6 green while silently breaking Task 15's preview.
 *
 * Also pins start()'s own `if (ctx.isPreview)` gate (common.js's start()
 * function), which the tests above do not reach: they only pin what
 * createContext() derives, and createContext() currently sets
 * `isPreview: isDevPreview` verbatim, so through createContext() the two
 * fields never diverge and a revert of start()'s gate to ctx.isDevPreview
 * would be invisible. Catching that requires a hand-built ctx where the
 * two fields disagree — exactly the shape Task 15 introduces (real props,
 * so isDevPreview is false, but watched in the GUI's iframe, so isPreview
 * is true).
 */

/* Builds a detached #stage, hands it to fn, then restores the DOM. */
function withDomStage(fn) {
  const stage = document.createElement("div");
  stage.id = "stage";
  document.body.appendChild(stage);

  const htmlCss = document.documentElement.style.cssText;
  const bodyCss = document.body.style.cssText;

  try {
    fn(stage);
  } finally {
    stage.remove();
    document.documentElement.style.cssText = htmlCss;
    document.body.style.cssText = bodyCss;
  }
}

/* Runs fn with window.__renderer temporarily set (or removed), then restores it. */
function withRenderer(value, fn) {
  const hadOwn = Object.prototype.hasOwnProperty.call(window, "__renderer");
  const saved = window.__renderer;

  if (value === undefined) {
    delete window.__renderer;
  } else {
    window.__renderer = value;
  }

  try {
    fn();
  } finally {
    if (hadOwn) {
      window.__renderer = saved;
    } else {
      delete window.__renderer;
    }
  }
}

test("createStage applies the output-resolution scale transform for a real render", () => {
  withDomStage((stage) => {
    const ctx = { isPreview: false, stage: Renderer.pickStage(1920, 1080) };
    Renderer.createStage(ctx);

    assertEqual(stage.getAttribute("data-ratio"), "16:9");
    assertEqual(stage.getAttribute("data-orient"), "landscape");
    assertEqual(stage.style.getPropertyValue("--stage-w"), "1280px");
    assertEqual(stage.style.getPropertyValue("--stage-h"), "720px");
    // 1920x1080 picks the 1280x720 logical stage at scale 1920/1280 = 1.5.
    assertEqual(stage.style.transform, "scale(1.5)");
  });
});

test("createStage skips the scale transform for a preview (anti double-scaling guard)", () => {
  withDomStage((stage) => {
    const ctx = { isPreview: true, stage: Renderer.pickStage(1920, 1080) };
    Renderer.createStage(ctx);

    // Sizing/attributes are still applied — only the output-resolution
    // scale is preview-only, because fitToWindow() does the preview's own
    // (different) transform, and applying both would compound.
    assertEqual(stage.getAttribute("data-ratio"), "16:9");
    assertEqual(stage.getAttribute("data-orient"), "landscape");
    assertEqual(stage.style.transform, "");
  });
});

test("createContext defaults isPreview to true when opened with no injected props (from disk)", () => {
  withRenderer(undefined, () => {
    const ctx = Renderer.createContext();
    assertEqual(ctx.isPreview, true);
  });
});

test("createContext resolves isPreview to false when real renderer props are already present", () => {
  withRenderer({ props: { width: 1920, height: 1080 } }, () => {
    const ctx = Renderer.createContext();
    assertEqual(ctx.isPreview, false);
  });
});

/*
 * Records requestAnimationFrame calls without ever scheduling one, so a
 * loop that wrongly starts is observable but never actually runs — no rAF
 * callback survives past this test to fire against a torn-down #stage.
 */
function withRafSpy(fn) {
  const original = window.requestAnimationFrame;
  const calls = [];
  window.requestAnimationFrame = function (callback) {
    calls.push(callback);
    return 0;
  };
  try {
    fn(calls);
  } finally {
    window.requestAnimationFrame = original;
  }
}

test("start() gates the animation loop and fitToWindow on ctx.isPreview, not ctx.isDevPreview", () => {
  withDomStage(() => {
    withRenderer(undefined, () => {
      withRafSpy((calls) => {
        const bodyDisplayBefore = document.body.style.display;

        // The divergent ctx a revert to ctx.isDevPreview would miss: a real
        // render (isDevPreview: true, i.e. "no window.__renderer existed
        // yet") that is nonetheless being watched (isPreview: true is the
        // Task 15 shape; here we pin the isPreview: false direction, which
        // requires no rAF/resize-listener teardown to test safely).
        const ctx = {
          isPreview: false,
          isDevPreview: true,
          stage: Renderer.pickStage(1920, 1080),
          duration: 5,
          props: {},
        };

        Renderer.start(ctx, () => {});

        assertEqual(calls.length, 0, "requestAnimationFrame should not run when ctx.isPreview is false");
        // fitToWindow() sets document.body.style.display = "flex"; its
        // absence is proof fitToWindow() was not called.
        assertEqual(document.body.style.display, bodyDisplayBefore, "fitToWindow should not run when ctx.isPreview is false");
      });
    });
  });
});
