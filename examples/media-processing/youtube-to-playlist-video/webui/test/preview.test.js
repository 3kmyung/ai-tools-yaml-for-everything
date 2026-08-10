import { test, assertEqual } from "./harness.js";
import { createPreview } from "../preview.js";

/*
 * createPreview() always builds a real <iframe> internally — there is no
 * injection point to swap in a fake one, and this codebase has no DOM
 * mocking library to fake one with (no build step, no third-party JS
 * dependencies). So these tests do what render-lifecycle.test.js's
 * withDomStage() already does for #stage: attach a real, small container to
 * the document and let a real iframe get created in it, then clean up.
 *
 * What IS faked is the iframe's content: `style` below names a template
 * that doesn't exist, so the iframe's navigation 404s and no page script of
 * its own ever runs — nothing will race with what these tests control. The
 * preview-ready / preview-props / preview-colors handshake that a real
 * template's common.js would perform is driven by manually dispatching
 * MessageEvents with an explicit `source` (a documented field of
 * MessageEventInit) pointed at the real iframe's contentWindow. That drives
 * createPreview()'s actual onMessage listener exactly as a genuine
 * postMessage from inside the frame would, without needing one to load —
 * which is what lets this pin needsReload's decision table, the
 * colour-during-pending-reload merge, and the destroyed guard without a
 * live server or network access.
 *
 * What this file does NOT attempt to pin: whether a real template, once
 * loaded, actually receives and applies these props end to end (spectrum
 * liveness, DOM text, rendered palette). That needs a real page running
 * common.js's own createHostedContext()/start() inside the iframe, which
 * means a real server — out of reach for this harness. That path was
 * checked by hand (Playwright, see task-15-report.md).
 */

function withPreviewContainer(fn) {
  const container = document.createElement("div");
  container.style.width = "400px";
  container.style.height = "300px";
  document.body.appendChild(container);
  try {
    return fn(container);
  } finally {
    container.remove();
  }
}

const BASE = {
  style: "__preview-test-stub__",
  ratio: "16:9",
  title: "A",
  artist: "B",
  cover: null,
  colors: { primary: "#ffffff", accent: "#000000" },
};

function announceReady(frame) {
  window.dispatchEvent(
    new MessageEvent("message", { data: { type: "preview-ready" }, source: frame.contentWindow })
  );
}

test("the first update() reloads, creating a frame", () => {
  withPreviewContainer((container) => {
    const preview = createPreview(container);
    preview.update(BASE);
    assertEqual(container.querySelectorAll("iframe").length, 1);
    preview.destroy();
  });
});

test("needsReload: identical props leave the frame untouched", () => {
  withPreviewContainer((container) => {
    const preview = createPreview(container);
    preview.update(BASE);
    const frame1 = container.querySelector("iframe");
    announceReady(frame1);

    preview.update({ ...BASE });
    assertEqual(container.querySelector("iframe") === frame1, true);
    preview.destroy();
  });
});

test("needsReload: a title change reloads the frame", () => {
  withPreviewContainer((container) => {
    const preview = createPreview(container);
    preview.update(BASE);
    const frame1 = container.querySelector("iframe");
    announceReady(frame1);

    preview.update({ ...BASE, title: "Changed" });
    assertEqual(container.querySelector("iframe") === frame1, false);
    preview.destroy();
  });
});

test("needsReload: a style/ratio/artist change each reload the frame", () => {
  withPreviewContainer((container) => {
    for (const patch of [{ style: "other-style" }, { ratio: "1:1" }, { artist: "Someone Else" }]) {
      const preview = createPreview(container);
      preview.update(BASE);
      const frame1 = container.querySelector("iframe");
      announceReady(frame1);

      preview.update({ ...BASE, ...patch });
      assertEqual(container.querySelector("iframe") === frame1, false, JSON.stringify(patch));
      preview.destroy();
    }
  });
});

test("needsReload: a colours-only change does not reload the frame", () => {
  withPreviewContainer((container) => {
    const preview = createPreview(container);
    preview.update(BASE);
    const frame1 = container.querySelector("iframe");
    announceReady(frame1);

    preview.update({ ...BASE, colors: { primary: "#111111", accent: "#222222" } });
    assertEqual(container.querySelector("iframe") === frame1, true);
    preview.destroy();
  });
});

test("needsReload: a cover rebuilt with the same path is not a reload, a different path is", () => {
  withPreviewContainer((container) => {
    const preview = createPreview(container);
    preview.update({ ...BASE, cover: { path: "covers/a.jpg", data_uri: "data:x" } });
    const frame1 = container.querySelector("iframe");
    announceReady(frame1);

    // A freshly built object describing the same cover -- not the same
    // reference -- must not be treated as a change (this is the bug: a
    // structural-but-not-referential match used to reload every render pass).
    preview.update({ ...BASE, cover: { path: "covers/a.jpg", data_uri: "data:x-refetched" } });
    assertEqual(container.querySelector("iframe") === frame1, true, "same path, new object");

    preview.update({ ...BASE, cover: { path: "covers/b.jpg", data_uri: "data:y" } });
    assertEqual(container.querySelector("iframe") === frame1, false, "different path");
    preview.destroy();
  });
});

test("needsReload: a plain string cover compares by value, not reference", () => {
  withPreviewContainer((container) => {
    const preview = createPreview(container);
    preview.update({ ...BASE, cover: "https://example.com/a.jpg" });
    const frame1 = container.querySelector("iframe");
    announceReady(frame1);

    preview.update({ ...BASE, cover: "https://example.com/a.jpg" });
    assertEqual(container.querySelector("iframe") === frame1, true, "same string value");

    preview.update({ ...BASE, cover: "https://example.com/b.jpg" });
    assertEqual(container.querySelector("iframe") === frame1, false, "different string value");
    preview.destroy();
  });
});

test("a colour-only update while a reload is still pending is not dropped", () => {
  withPreviewContainer((container) => {
    const preview = createPreview(container);
    preview.update(BASE);
    const frame1 = container.querySelector("iframe");
    announceReady(frame1);

    // A title change starts a reload; the new frame has not announced
    // preview-ready yet, so `pending` is still queued.
    preview.update({ ...BASE, title: "Reloaded" });
    const frame2 = container.querySelector("iframe");
    assertEqual(frame2 === frame1, false);

    // A colour-only update arrives before frame2 announces ready.
    preview.update({ ...BASE, title: "Reloaded", colors: { primary: "#aabbcc", accent: "#ddeeff" } });

    let delivered = null;
    frame2.contentWindow.postMessage = (data) => {
      delivered = data;
    };
    announceReady(frame2);

    assertEqual(delivered?.type, "preview-props");
    assertEqual(delivered?.props?.colors, { primary: "#aabbcc", accent: "#ddeeff" });
    preview.destroy();
  });
});

test("destroy() makes a later update() a no-op", () => {
  withPreviewContainer((container) => {
    const preview = createPreview(container);
    preview.update(BASE);
    preview.destroy();
    assertEqual(container.querySelectorAll("iframe").length, 0);

    preview.update({ ...BASE, title: "After destroy" });
    assertEqual(container.querySelectorAll("iframe").length, 0);
  });
});
