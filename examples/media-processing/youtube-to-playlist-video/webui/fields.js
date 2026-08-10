import { effective, isOverridden } from "./state.js";

/*
 * Every renderField() call needs an id no other row's control will ever
 * carry, including a row rendered for a different track. spec.key alone
 * repeats across tracks (every track has a "title"), and a per-track id
 * isn't available here — renderField() is only handed the spec and the
 * field, not the track. A module-level counter that never resets and never
 * repeats is the one thing guaranteed unique across rows, tracks, and
 * re-renders, so each row gets its own id from it.
 */
let fieldIdSeq = 0;

/*
 * A field row is an input plus a revert control. The input always shows the
 * effective value; the `is-default` class is what tells the user that what
 * they are looking at was derived rather than typed, and the revert control
 * is disabled in exactly that state because there is nothing to revert to.
 */
export function renderField(spec, f, handlers) {
  const row = document.createElement("div");
  row.className = "field";
  row.dataset.field = spec.key;

  const controlId = `field-${spec.key}-${fieldIdSeq++}`;

  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = spec.label;
  label.htmlFor = controlId;
  row.appendChild(label);

  const control = document.createElement("div");
  control.className = "field-control";
  row.appendChild(control);

  const overridden = isOverridden(f);
  const value = effective(f);

  if (spec.type === "image") {
    const preview = document.createElement("img");
    preview.className = "field-thumb";
    preview.alt = "";
    if (value?.url) preview.src = value.url;
    control.appendChild(preview);

    const picker = document.createElement("input");
    picker.type = "file";
    picker.id = controlId;
    picker.accept = "image/*";
    picker.dataset.role = "input";
    picker.addEventListener("change", () => {
      const file = picker.files?.[0];
      if (file) handlers.onFile(file);
    });
    control.appendChild(picker);
  } else if (spec.type === "color") {
    const swatch = document.createElement("input");
    swatch.type = "color";
    swatch.id = controlId;
    swatch.dataset.role = "input";
    // A color input has no empty state, so an unresolved color shows black
    // and the is-default styling carries the "not yet derived" meaning.
    swatch.value = value || "#000000";
    swatch.addEventListener("input", () => handlers.onInput(swatch.value));
    control.appendChild(swatch);

    const hex = document.createElement("span");
    hex.className = "field-hex";
    hex.textContent = value || "—";
    control.appendChild(hex);
  } else {
    const input = document.createElement("input");
    input.type = spec.type === "url" ? "url" : "text";
    input.id = controlId;
    input.dataset.role = "input";
    input.value = value ?? "";
    input.placeholder = spec.placeholder ?? "";
    input.addEventListener("input", () => handlers.onInput(input.value));
    control.appendChild(input);
  }

  if (!overridden) control.classList.add("is-default");

  // youtube_url has no source, so it can never be "back to the default".
  if (handlers.onRevert) {
    const revert = document.createElement("button");
    revert.type = "button";
    revert.className = "field-revert";
    revert.title = "Revert to the derived default";
    revert.textContent = "↺";
    revert.disabled = !overridden;
    revert.addEventListener("click", () => handlers.onRevert());
    control.appendChild(revert);
  }

  return row;
}
