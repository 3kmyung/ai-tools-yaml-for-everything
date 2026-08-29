import { effective, isOverridden } from "./state.js";
import { openColorPicker } from "./color-picker.js";
import { icon } from "./icons.js";

let fieldIdSeq = 0;

export function renderField(spec, f, handlers) {
  const row = document.createElement("div");
  row.className = "field";
  row.dataset.field = spec.key;

  const controlId = "field-" + spec.key + "-" + fieldIdSeq++;

  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = spec.label;
  label.htmlFor = controlId;
  row.appendChild(label);

  const control = document.createElement("div");
  control.className = "field-control";
  row.appendChild(control);

  let revertHost = control;

  const overridden = isOverridden(f);
  const value = effective(f);

  if (spec.type === "image") {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.id = controlId;
    picker.accept = "image/*";
    picker.className = "field-file-input";
    picker.dataset.role = "input";
    picker.addEventListener("change", () => {
      const file = picker.files && picker.files[0];
      if (file) handlers.onFile(file);
    });
    control.appendChild(picker);

    const pickerLabel = document.createElement("label");
    pickerLabel.htmlFor = controlId;
    pickerLabel.title = "Choose a cover image";

    const preview = document.createElement(value && value.url ? "img" : "div");
    preview.className = "thumbnail";
    if (value && value.url) {
      preview.alt = "";
      preview.src = value.url;
    }
    pickerLabel.appendChild(preview);

    control.appendChild(pickerLabel);
  } else if (spec.type === "color") {
    const current = value || spec.fallback || "#000000";

    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.id = controlId;
    swatch.className = "thumbnail";
    swatch.dataset.role = "input";
    swatch.title = "Pick a color";
    swatch.style.setProperty("--swatch", current);

    control.appendChild(swatch);

    const hex = document.createElement("span");
    hex.className = "field-hex";
    hex.textContent = value || "";
    control.appendChild(hex);

    swatch.addEventListener("click", () => {
      openColorPicker({
        anchor: swatch,
        value: swatch.style.getPropertyValue("--swatch"),
        suggestions: handlers.suggestions ? handlers.suggestions() : [],
        onInput: (picked) => {
          swatch.style.setProperty("--swatch", picked);
          hex.textContent = picked;
          handlers.onInput(picked);
        },
      });
    });
  } else {
    const line = document.createElement("div");
    line.className = "field-line";

    const input = document.createElement("input");
    input.type = spec.type === "url" ? "url" : "text";
    input.id = controlId;
    input.dataset.role = "input";
    input.value = value != null ? value : "";
    input.placeholder = spec.placeholder || "";
    input.addEventListener("input", () => handlers.onInput(input.value));
    line.appendChild(input);

    control.appendChild(line);
    revertHost = line;
  }

  if (!overridden) control.classList.add("is-default");

  if (handlers.onRevert) {
    const revert = document.createElement("button");
    revert.type = "button";
    revert.className = "revert-field";
    revert.title = "Revert to the derived default";
    revert.appendChild(icon("revert"));
    revert.disabled = !overridden;
    revert.addEventListener("click", () => handlers.onRevert());
    revertHost.appendChild(revert);
  }

  return row;
}
