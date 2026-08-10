import { test, assertEqual } from "./harness.js";
import { renderField } from "../fields.js";
import { field } from "../state.js";

/*
 * Renders a row into a detached container appended to the document (inputs
 * need to be in the document for .click()/dispatchEvent to behave the same
 * way they do in the real app), then tears the container down — so a test
 * that throws still leaves no row behind for the next test to trip over.
 */
function withRow(spec, f, handlers, fn) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  try {
    const row = renderField(spec, f, handlers);
    container.appendChild(row);
    fn(row);
  } finally {
    container.remove();
  }
}

/*
 * `url` has to be a real, fetchable path: these tests attach a real <img>
 * to the document (see withRow()'s comment), so whatever `url` names here
 * is exactly what the browser will request. `/output/covers/...` (the
 * production shape) is a runtime path that model-compose's cover-ingest
 * writes and this static server has never heard of in a test run, which
 * 404s. webui/test/fixtures/cover.jpg is a real file this server does
 * serve, so the request the browser actually makes succeeds instead of
 * leaving a 404 in the page's console for run-tests.py to catch. `path`
 * is never turned into a request (renderField() only ever reads `url` for
 * the image branch), so it keeps the production-shaped name.
 */
function coverValue(name) {
  return {
    path: `webui/output/covers/${name}.jpg`,
    url: `/test/fixtures/cover.jpg`,
    data_uri: `data:image/jpeg;base64,${name}`,
    colors: { primary: "#ffffff", secondary: "#222222", accent: "#1d4ed8", text: "#f5f5f0" },
  };
}

test("a derived field renders the default, carries is-default, and its revert is disabled", () => {
  withRow(
    { key: "title", label: "Title", type: "text" },
    field(null, "Derived Title"),
    { onInput: () => {}, onRevert: () => {} },
    (row) => {
      const input = row.querySelector('[data-role="input"]');
      const control = row.querySelector(".field-control");
      const revert = row.querySelector(".field-revert");
      assertEqual(row.dataset.field, "title");
      assertEqual(input.value, "Derived Title");
      assertEqual(control.classList.contains("is-default"), true);
      assertEqual(revert.disabled, true);
    }
  );
});

test("an overridden field renders the value, carries no is-default, and its revert is enabled", () => {
  withRow(
    { key: "artist", label: "Artist", type: "text" },
    field("Typed Artist", "Derived Artist"),
    { onInput: () => {}, onRevert: () => {} },
    (row) => {
      const input = row.querySelector('[data-role="input"]');
      const control = row.querySelector(".field-control");
      const revert = row.querySelector(".field-revert");
      assertEqual(input.value, "Typed Artist");
      assertEqual(control.classList.contains("is-default"), false);
      assertEqual(revert.disabled, false);
    }
  );
});

test("a value equal to its default still counts as overridden", () => {
  // isOverridden() is value !== null, not "differs from the default" — a
  // typed value that happens to match the default must not silently look
  // derived again, or the revert control would vanish under the user's
  // fingers as they typed it.
  withRow(
    { key: "artist", label: "Artist", type: "text" },
    field("Same", "Same"),
    { onInput: () => {}, onRevert: () => {} },
    (row) => {
      const control = row.querySelector(".field-control");
      const revert = row.querySelector(".field-revert");
      assertEqual(control.classList.contains("is-default"), false);
      assertEqual(revert.disabled, false);
    }
  );
});

test("clicking an enabled revert button invokes onRevert exactly once", () => {
  let calls = 0;
  withRow(
    { key: "artist", label: "Artist", type: "text" },
    field("Typed", "Derived"),
    { onInput: () => {}, onRevert: () => { calls += 1; } },
    (row) => {
      row.querySelector(".field-revert").click();
    }
  );
  assertEqual(calls, 1);
});

test("typing into the input invokes onInput with the new value", () => {
  const seen = [];
  withRow(
    { key: "title", label: "Title", type: "text" },
    field(null, "Derived"),
    { onInput: (v) => seen.push(v), onRevert: () => {} },
    (row) => {
      const input = row.querySelector('[data-role="input"]');
      input.value = "Hand Typed";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  );
  assertEqual(seen, ["Hand Typed"]);
});

test("a spec with no onRevert renders no revert button at all", () => {
  withRow(
    { key: "youtube_url", label: "YouTube URL", type: "url" },
    field(""),
    { onInput: () => {} },
    (row) => {
      assertEqual(row.querySelectorAll(".field-revert").length, 0);
    }
  );
});

test("the image branch's preview src is the cover's fetchable url, not its data_uri", () => {
  withRow(
    { key: "cover", label: "Cover", type: "image" },
    field(null, coverValue("aaa")),
    { onInput: () => {}, onRevert: () => {}, onFile: () => {} },
    (row) => {
      const preview = row.querySelector("img.field-thumb");
      const picker = row.querySelector('input[type="file"][data-role="input"]');
      // getAttribute, not .src: the property getter resolves a relative URL
      // against the document's own location, which would pass here for the
      // wrong reason (any resolved absolute URL) rather than proving the
      // literal value renderField() assigned.
      assertEqual(preview.getAttribute("src"), "/test/fixtures/cover.jpg");
      assertEqual(picker.accept, "image/*");
    }
  );
});

test("the color branch survives a null effective value", () => {
  withRow(
    { key: "accent_color", label: "Accent", type: "color" },
    field(null, null),
    { onInput: () => {}, onRevert: () => {} },
    (row) => {
      const swatch = row.querySelector('input[type="color"][data-role="input"]');
      const hex = row.querySelector(".field-hex");
      assertEqual(swatch.value, "#000000");
      assertEqual(hex.textContent, "—");
      assertEqual(row.querySelector(".field-control").classList.contains("is-default"), true);
    }
  );
});

test("the label is associated with its row's real control, uniquely per row", () => {
  // Two rows for the *same* field key rendered side by side (e.g. two
  // tracks' "title" rows coexisting) must not collide on id — spec.key
  // alone repeats across tracks, so renderField() has to make each row's
  // id unique some other way.
  const containerA = document.createElement("div");
  const containerB = document.createElement("div");
  document.body.appendChild(containerA);
  document.body.appendChild(containerB);
  try {
    const rowA = renderField(
      { key: "title", label: "Title", type: "text" },
      field(null, "Derived"),
      { onInput: () => {}, onRevert: () => {} }
    );
    const rowB = renderField(
      { key: "title", label: "Title", type: "text" },
      field(null, "Derived"),
      { onInput: () => {}, onRevert: () => {} }
    );
    containerA.appendChild(rowA);
    containerB.appendChild(rowB);

    const labelA = rowA.querySelector(".field-label");
    const inputA = rowA.querySelector('[data-role="input"]');
    const labelB = rowB.querySelector(".field-label");
    const inputB = rowB.querySelector('[data-role="input"]');

    assertEqual(labelA.htmlFor, inputA.id, "row A's label must point at row A's own input");
    assertEqual(labelB.htmlFor, inputB.id, "row B's label must point at row B's own input");
    assertEqual(inputA.id !== inputB.id, true, "two rows for the same field key must not share an id");

    // The association also has to hold for the non-text branches, and point
    // at the real control (the color input), not a decorative element (the
    // hex span).
    const colorRow = renderField(
      { key: "primary_color", label: "Primary", type: "color" },
      field(null, "#1d4ed8"),
      { onInput: () => {}, onRevert: () => {} }
    );
    containerA.appendChild(colorRow);
    const colorLabel = colorRow.querySelector(".field-label");
    const swatch = colorRow.querySelector('input[type="color"]');
    assertEqual(colorLabel.htmlFor, swatch.id);

    const imageRow = renderField(
      { key: "cover", label: "Cover", type: "image" },
      field(null, coverValue("bbb")),
      { onInput: () => {}, onRevert: () => {}, onFile: () => {} }
    );
    containerA.appendChild(imageRow);
    const imageLabel = imageRow.querySelector(".field-label");
    const picker = imageRow.querySelector('input[type="file"]');
    assertEqual(imageLabel.htmlFor, picker.id);
  } finally {
    containerA.remove();
    containerB.remove();
  }
});
