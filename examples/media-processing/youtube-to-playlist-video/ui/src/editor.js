import { effective, invalidate, revert, setCover } from "./state.js";
import { renderField } from "./fields.js";
import { closeColorPicker } from "./color-picker.js";
import { withStatus } from "./status.js";
import { DEFAULT_TRACK_COLORS } from "./track-colors.js";
import { STYLE_COLOR_ROLES } from "./color-roles.js";

const URL_DEBOUNCE_MS = 500;

const BASE_FIELD_SPECS = [
  { key: "youtube_url", label: "YouTube", type: "url", placeholder: "https://www.youtube.com/watch?v=…" },
  { key: "title", label: "Title", type: "text" },
  { key: "artist", label: "Artist", type: "text" },
  { key: "cover", label: "Cover", type: "image" },
];

const COLOR_FIELD_SPECS = {
  primary: { key: "primary_color", label: "Primary", type: "color", fallback: DEFAULT_TRACK_COLORS.primary },
  secondary: { key: "secondary_color", label: "Secondary", type: "color", fallback: DEFAULT_TRACK_COLORS.secondary },
  accent: { key: "accent_color", label: "Accent", type: "color", fallback: DEFAULT_TRACK_COLORS.accent },
  text: { key: "text_color", label: "Text", type: "color", fallback: DEFAULT_TRACK_COLORS.text },
};

function fieldSpecsFor(style) {
  const roles = STYLE_COLOR_ROLES[style] || [];
  return BASE_FIELD_SPECS.concat(roles.map((role) => COLOR_FIELD_SPECS[role]));
}

export function createEditor(options) {
  const getApi = options.getApi;
  const getStyle = options.getStyle;
  const onEdited = options.onEdited;
  const onResolved = options.onResolved;

  const urlTimers = new Map();
  const pendingResolves = new Set();

  function markOverridden(key) {
    const row = document.querySelector(".field[data-field=\"" + key + "\"]");
    const control = row ? row.querySelector(".field-control") : null;
    if (control) control.classList.remove("is-default");
    const revertButton = row ? row.querySelector(".revert-field") : null;
    if (revertButton) revertButton.disabled = false;
  }

  function scheduleResolve(track, url) {
    clearTimeout(urlTimers.get(track.id));
    pendingResolves.add(track.id);

    urlTimers.set(
      track.id,
      setTimeout(async () => {
        urlTimers.delete(track.id);
        try {
          await withStatus(
            "Resolving " + (url || "the link") + "…",
            () => invalidate(track, "youtube_url", getApi()),
            "That YouTube link could not be read."
          );
        } catch (resolveFailure) {
        } finally {
          pendingResolves.delete(track.id);
        }
        onResolved();
      }, URL_DEBOUNCE_MS)
    );
  }

  function coverSwatches(track) {
    const cover = effective(track.cover);
    return cover && cover.colors && Array.isArray(cover.colors.swatches) ? cover.colors.swatches : [];
  }

  function handlers(track, spec) {
    return {
      suggestions: () => coverSwatches(track),

      onInput: (value) => {
        track[spec.key].value = value;
        markOverridden(spec.key);

        if (spec.key === "youtube_url") {
          scheduleResolve(track, value);
        } else {
          onEdited();
        }
      },

      onRevert: spec.key === "youtube_url" ? null : async () => {
        try {
          await withStatus("Reverting…", () => revert(track, spec.key, getApi()), "That field could not be reverted.");
        } catch (revertFailure) {
        }
        onResolved();
      },

      onFile: async (file) => {
        try {
          await withStatus(
            "Reading " + file.name + "…",
            async () => {
              const ingested = await getApi().coverDefaults(file);
              await setCover(track, ingested, getApi());
            },
            "That image could not be read."
          );
        } catch (coverFailure) {
        }
        onResolved();
      },
    };
  }

  function render(track) {
    closeColorPicker();

    const editor = document.getElementById("editor");
    const hint = document.getElementById("hint");

    hint.hidden = !!track;

    editor.replaceChildren(
      ...(track ? fieldSpecsFor(getStyle()).map((spec) => renderField(spec, track[spec.key], handlers(track, spec))) : [])
    );
  }

  function cancelPending(trackId) {
    clearTimeout(urlTimers.get(trackId));
    urlTimers.delete(trackId);
    pendingResolves.delete(trackId);
  }

  function hasPendingResolves() {
    return pendingResolves.size > 0;
  }

  return { render: render, handlers: handlers, cancelPending: cancelPending, hasPendingResolves: hasPendingResolves };
}
