import { createApi } from "./api.js";
import { createTrack, effective, invalidate, revert, setCover } from "./state.js";
import { renderField } from "./fields.js";
import { createPreview } from "./preview.js";
import { RATIO_SIZES, RESOLUTIONS } from "./ratios.js";

const STYLES = ["waveform"];
const FPS_OPTIONS = [24, 30, 60];
const STORAGE_KEY = "youtube-to-playlist-video/state";
const URL_DEBOUNCE_MS = 500;

// Above this the frame count times the frame area starts to dominate the
// render time, and it is worth telling the user before they wait for it.
const HEAVY_PIXELS = 1920 * 1080;

const FIELD_SPECS = [
  { key: "youtube_url", label: "YouTube", type: "url", placeholder: "https://www.youtube.com/watch?v=…" },
  { key: "title", label: "Title", type: "text" },
  { key: "artist", label: "Artist", type: "text" },
  { key: "cover", label: "Cover", type: "image" },
  { key: "primary_color", label: "Primary", type: "color" },
  { key: "accent_color", label: "Accent", type: "color" },
];

// `let`, not `const`: __test.setApi() below swaps this for a fake so
// app.test.js can pin the debounce/timer behavior without a live server.
let api = createApi();

// index.html's own min/max on #bands. Restated here because the browser
// enforces them on form submission, and this app never submits a form —
// a number input can be left empty or typed past its max and the change
// event fires regardless.
const BAND_LIMITS = { min: 8, max: 96, fallback: 28 };

const DEFAULT_SETTINGS = {
  style: "waveform",
  ratio: "16:9",
  width: 1280,
  height: 720,
  fps: 30,
  bands: BAND_LIMITS.fallback,
};

const settings = { ...DEFAULT_SETTINGS };

let tracks = [];
let selectedId = null;
let nextId = 1;
let preview = null;

/* ---------- persistence ---------- */

/*
 * Every field pair is stored verbatim — both halves, because a user's
 * override is the one thing here that cannot be recomputed from anything —
 * with exactly one thing dropped: a cover's `data_uri`.
 *
 * That data URI is the whole cover re-encoded as base64 and routinely runs
 * past 200 KB, so roughly a dozen tracks would exhaust the ~5 MB an origin
 * gets. Worse, save() is reached from renderAll(), which the colour picker's
 * `input` event drives on every frame of a drag — the one interaction that
 * has to stay smooth. Covers are therefore persisted by their server URL
 * instead (cover-ingest now stores under the static web UI's own document
 * root, so that URL is a real <img src>) — the thumbnail fetches it straight
 * from storage on reload, with nothing to re-derive and no bytes to keep.
 */
function withoutCoverBlob(cover) {
  if (!cover) return cover ?? null;
  const { data_uri, ...rest } = cover;
  return rest;
}

function persistable(track) {
  return {
    ...track,
    cover: {
      value: withoutCoverBlob(track.cover?.value),
      default: withoutCoverBlob(track.cover?.default),
    },
  };
}

function save() {
  const payload = JSON.stringify({ settings, tracks: tracks.map(persistable), nextId });
  try {
    localStorage.setItem(STORAGE_KEY, payload);
  } catch (error) {
    /*
     * Quota, private-mode storage, a disabled origin — none of it is worth
     * taking the editor down for. save() is called from renderAll(), which
     * is called from click and input handlers, so an exception here would
     * surface as a dead button rather than as a failed cache write.
     */
    console.warn(`Playlist not persisted: ${error.message}`);
  }
}

function load() {
  let parsed = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!parsed) return false;

  Object.assign(settings, parsed.settings ?? {});
  /*
   * Outside the try on purpose: a JSON.parse that succeeded can still hand
   * back a ratio this build no longer has (renamed, dropped) or a bands
   * count some earlier version let through. renderResolutions() reads
   * RESOLUTIONS[settings.ratio] unguarded at import time, so a stale ratio
   * would throw before a single pixel was drawn, with no way back short of
   * clearing storage by hand.
   */
  if (!RESOLUTIONS[settings.ratio]) {
    settings.ratio = DEFAULT_SETTINGS.ratio;
    [settings.width, settings.height] = RESOLUTIONS[settings.ratio][0];
  }
  settings.bands = clampBands(settings.bands);

  tracks = Array.isArray(parsed.tracks) ? parsed.tracks : [];
  nextId = parsed.nextId ?? tracks.length + 1;
  return tracks.length > 0;
}

function clampBands(value) {
  const count = Math.round(Number(value));
  if (!Number.isFinite(count) || count <= 0) return BAND_LIMITS.fallback;
  return Math.min(BAND_LIMITS.max, Math.max(BAND_LIMITS.min, count));
}

/* ---------- global settings ---------- */

function fillSelect(element, values, selected, format = String) {
  element.replaceChildren(
    ...values.map((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = format(value);
      option.selected = String(value) === String(selected);
      return option;
    })
  );
}

function resolutionKey(width, height) {
  return `${width}x${height}`;
}

function renderResolutions() {
  const options = RESOLUTIONS[settings.ratio];
  const current = resolutionKey(settings.width, settings.height);
  const match = options.find(([w, h]) => resolutionKey(w, h) === current) ?? options[0];
  [settings.width, settings.height] = match;

  fillSelect(
    document.getElementById("resolution"),
    options.map(([w, h]) => resolutionKey(w, h)),
    resolutionKey(settings.width, settings.height)
  );

  const warning = document.getElementById("cost-warning");
  const heavy = settings.width * settings.height > HEAVY_PIXELS;
  warning.hidden = !heavy;
  warning.textContent = heavy
    ? `${settings.width}×${settings.height} screenshots every frame — expect a long render`
    : "";
}

function renderSettings() {
  fillSelect(document.getElementById("style"), STYLES, settings.style);
  fillSelect(document.getElementById("ratio"), Object.keys(RATIO_SIZES), settings.ratio);
  fillSelect(document.getElementById("fps"), FPS_OPTIONS, settings.fps);
  document.getElementById("bands").value = settings.bands;
  renderResolutions();
}

/* ---------- tracks ---------- */

function selected() {
  return tracks.find((track) => track.id === selectedId) ?? null;
}

function addTrack() {
  const track = createTrack(`t${nextId++}`);
  tracks.push(track);
  selectedId = track.id;
  renderAll();
}

function removeTrack(id) {
  // A pending debounce for this track would otherwise still fire after the
  // track is gone. It wouldn't throw — invalidate() and renderAll() below
  // both tolerate a track that is no longer in `tracks` — but there is no
  // reason to let a resolve nobody can see run to completion.
  clearTimeout(urlTimers.get(id));
  urlTimers.delete(id);
  pendingResolves.delete(id);

  tracks = tracks.filter((track) => track.id !== id);
  if (selectedId === id) selectedId = tracks[0]?.id ?? null;
  renderAll();
}

function renderTrackList() {
  const list = document.getElementById("track-list");
  list.replaceChildren(
    ...tracks.map((track, index) => {
      const item = document.createElement("li");
      item.className = track.id === selectedId ? "track is-selected" : "track";
      item.addEventListener("click", () => {
        selectedId = track.id;
        renderAll();
      });

      const thumb = document.createElement("img");
      thumb.className = "track-thumb";
      thumb.alt = "";
      const cover = effective(track.cover);
      if (cover?.url) thumb.src = cover.url;
      item.appendChild(thumb);

      const label = document.createElement("span");
      label.className = "track-label";
      label.textContent = effective(track.title) || `Track ${index + 1}`;
      item.appendChild(label);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "track-remove";
      remove.textContent = "×";
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        removeTrack(track.id);
      });
      item.appendChild(remove);

      return item;
    })
  );
}

/* ---------- editor ---------- */

/*
 * Keyed by track id, not one shared timer: with a single module-level
 * timer, typing into track A's URL and then switching to track B and typing
 * there before A's debounce elapses would clearTimeout() A's pending
 * resolve out from under it — A's youtube_url.value is already committed at
 * that point, but invalidate() would never run for it, silently leaving
 * A's title/artist/cover/colours stale with nothing to indicate it short of
 * re-editing A's URL again. Keying per track means B's onInput only ever
 * clears B's own previous timer.
 *
 * An in-flight resolve for a track the user has since navigated away from
 * is deliberately allowed to land when it finishes — the track object is
 * still live in `tracks` regardless of `selectedId`, invalidate() writes
 * straight onto it, and renderAll() always redraws the full track list (so
 * that track's thumbnail/title update even while a different one is
 * selected). removeTrack() below is the one place that intentionally
 * cancels a still-pending timer, because at that point the track is gone
 * for good and there is nothing left for the resolve to land on.
 */
const urlTimers = new Map();

/*
 * Track ids whose URL has been typed but whose title/artist/cover have not
 * caught up yet — the debounce window plus the round trip after it. Rendering
 * during that gap would send `cover_image: null` and the workflow would fall
 * back to the example's own ./cover.jpg, so the finished video would quietly
 * carry the wrong art. A Map of timers can't answer this on its own: its
 * entry is deleted the moment the timer fires, which is when the request
 * starts, not when it lands.
 */
const pendingResolves = new Set();

/*
 * A field edit only ever writes `value`. Sources are re-resolved through
 * invalidate(), which is the only thing that writes `default`.
 */
/*
 * Flips a row to its overridden appearance without rebuilding it. Re-running
 * renderEditor() on every keystroke would replace the input the user is
 * typing into and take the caret with it, so an edit touches only the two
 * things that actually changed.
 */
function markOverridden(key) {
  const row = document.querySelector(`.field[data-field="${key}"]`);
  row?.querySelector(".field-control")?.classList.remove("is-default");
  const revert = row?.querySelector(".field-revert");
  if (revert) revert.disabled = false;
}

function handlers(track, spec) {
  return {
    onInput(value) {
      track[spec.key].value = value;
      markOverridden(spec.key);

      if (spec.key === "youtube_url") {
        clearTimeout(urlTimers.get(track.id));
        pendingResolves.add(track.id);
        urlTimers.set(
          track.id,
          setTimeout(async () => {
            urlTimers.delete(track.id);
            try {
              await withStatus(`Resolving ${value || "…"}`, () => invalidate(track, "youtube_url", api));
            } finally {
              // Cleared whether the resolve landed or threw: a link the
              // server rejects must not lock Render out for good.
              pendingResolves.delete(track.id);
            }
            renderAll();
          }, URL_DEBOUNCE_MS)
        );
      } else {
        // Everything but the editor: the row the user is typing in stays put.
        renderAll({ editor: false });
      }
    },

    onRevert: spec.key === "youtube_url" ? null : async () => {
      await withStatus("Reverting", () => revert(track, spec.key, api));
      renderAll();
    },

    async onFile(file) {
      await withStatus(`Reading ${file.name}`, async () => {
        const ingested = await api.coverDefaults(file);
        await setCover(track, ingested, api);
      });
      renderAll();
    },
  };
}

function renderEditor() {
  const editor = document.getElementById("editor");
  const track = selected();

  if (!track) {
    editor.replaceChildren(Object.assign(document.createElement("p"), {
      className: "empty",
      textContent: "Add a track to begin.",
    }));
    return;
  }

  editor.replaceChildren(
    ...FIELD_SPECS.map((spec) => renderField(spec, track[spec.key], handlers(track, spec)))
  );
}

/* ---------- preview ---------- */

function renderPreview() {
  const track = selected();
  if (!track) {
    // Nothing selected — every track was deleted. Returning early here left
    // the last one's frame on screen next to the editor's "Add a track to
    // begin.", which reads as a track that is still there.
    preview.clear();
    return;
  }

  const cover = effective(track.cover);
  preview.update({
    style: settings.style,
    ratio: settings.ratio,
    width: settings.width,
    height: settings.height,
    title: effective(track.title) || "Untitled",
    artist: effective(track.artist) || "Unknown Artist",
    cover: cover?.url ?? null,
    colors: {
      primary: effective(track.primary_color) || "#111111",
      accent: effective(track.accent_color) || "#ff5b04",
    },
  });
}

/* ---------- status ---------- */

async function withStatus(message, work) {
  const status = document.getElementById("status");
  status.hidden = false;
  status.textContent = message;
  try {
    return await work();
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    throw error;
  } finally {
    if (status.textContent === message) status.hidden = true;
  }
}

/* ---------- wiring ---------- */

function renderAll({ editor = true } = {}) {
  renderTrackList();
  if (editor) renderEditor();
  renderPreview();
  save();
}

function bindSettings() {
  document.getElementById("style").addEventListener("change", (event) => {
    settings.style = event.target.value;
    renderAll();
  });

  document.getElementById("ratio").addEventListener("change", (event) => {
    settings.ratio = event.target.value;
    renderResolutions();
    renderAll();
  });

  document.getElementById("resolution").addEventListener("change", (event) => {
    const [width, height] = event.target.value.split("x").map(Number);
    settings.width = width;
    settings.height = height;
    renderResolutions();
    renderAll();
  });

  document.getElementById("fps").addEventListener("change", (event) => {
    settings.fps = Number(event.target.value);
    save();
  });

  document.getElementById("bands").addEventListener("change", (event) => {
    /*
     * Clearing the field gives Number("") === 0, which used to persist and
     * render a track with a dead equalizer — index.html's min/max are only
     * enforced on form submission, and this app never submits a form. The
     * clamped value is written back into the input so the field says what
     * will actually be used.
     */
    settings.bands = clampBands(event.target.value);
    event.target.value = settings.bands;
    save();
  });

  document.getElementById("add-track").addEventListener("click", addTrack);

  document.getElementById("render").addEventListener("click", startRender);
}

let activeTaskId = null;

/*
 * True from the moment the user clicks Cancel until the task reaches a
 * terminal state. cancelTask() only asks the server to stop the job —
 * watchTask() has no abort of its own and keeps polling regardless, so the
 * button has to keep saying "cancelling" across every intervening poll
 * rather than going back to a fresh, clickable "Cancel" (which would look
 * like nothing happened) until the server actually confirms.
 */
let cancelRequested = false;

async function startRender() {
  const button = document.getElementById("render");
  const input = buildRenderInput();

  const incomplete = input.tracks.filter((track) => !track.youtube_url);
  if (!input.tracks.length || incomplete.length) {
    showStatus("Every track needs a YouTube link before rendering.");
    return;
  }

  /*
   * The workflow now defaults a missing cover to its own ./cover.jpg rather
   * than dying on a null path, which makes README's "everything except
   * youtube_url is optional" true — but it also means a render submitted
   * inside the URL debounce would come back with the example's stock art and
   * no complaint anywhere. Caught here instead, where it can still be waited
   * out.
   */
  if (pendingResolves.size) {
    showStatus("Still reading a YouTube link — try again in a moment.");
    return;
  }

  button.disabled = true;
  cancelRequested = false;
  try {
    const started = await api.startRender(input);
    activeTaskId = started.task_id;
    showProgress(started);

    const final = await api.watchTask(activeTaskId, showProgress);

    if (String(final.status).toLowerCase() === "completed") {
      showResult(final.output);
    } else {
      showStatus(`Render ${final.status}${final.error ? `: ${final.error}` : ""}`);
    }
  } catch (error) {
    showStatus(`Error: ${friendlyError(error)}`);
  } finally {
    activeTaskId = null;
    cancelRequested = false;
    button.disabled = false;
  }
}

/*
 * fetch() itself rejects with a bare TypeError ("Failed to fetch") when the
 * network drops or the server is unreachable — readError() in api.js only
 * ever runs on a non-OK HTTP response, so that rejection reaches here
 * unwrapped. Showing that raw message to a user is meaningless; say what
 * actually happened instead.
 */
function friendlyError(error) {
  if (error instanceof TypeError) {
    return "Lost connection to the render server. It may still be running — check back shortly.";
  }
  return error.message;
}

function showStatus(message) {
  const status = document.getElementById("status");
  status.hidden = false;
  status.replaceChildren(Object.assign(document.createElement("span"), { textContent: message }));
}

/*
 * The tracks render inside a for-each, so per-track progress is not reported
 * — the honest thing to show is the task's own state and how long it has been
 * running, plus a way out.
 */
function showProgress(state) {
  const status = document.getElementById("status");
  status.hidden = false;

  const label = document.createElement("span");
  label.textContent = `Rendering — ${state.status}`;

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "status-cancel";

  if (cancelRequested) {
    // Server hasn't confirmed yet — say so rather than pretending the click
    // already stopped anything.
    cancel.textContent = "Cancelling…";
    cancel.disabled = true;
  } else {
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", async () => {
      cancelRequested = true;
      showProgress(state);
      try {
        if (activeTaskId) await api.cancelTask(activeTaskId);
      } catch (error) {
        showStatus(`Error: ${friendlyError(error)}`);
      }
    });
  }

  status.replaceChildren(label, cancel);
}

function showResult(output) {
  const status = document.getElementById("status");
  status.hidden = false;

  const label = document.createElement("span");
  label.textContent = "Done — ";

  const video = document.createElement("video");
  video.className = "status-video";
  video.controls = true;
  // `url` is a path on this same static server, which is exactly why
  // render-playlist publishes into webui/output/.
  video.src = output.url;

  const link = document.createElement("a");
  link.href = output.url;
  link.download = output.path;
  link.textContent = output.path;

  status.replaceChildren(label, link, video);
}

export function buildRenderInput() {
  return {
    style: settings.style,
    fps: settings.fps,
    band_count: settings.bands,
    width: settings.width,
    height: settings.height,
    tracks: tracks.map((track) => ({
      youtube_url: effective(track.youtube_url) ?? "",
      /*
       * render-playlist reads this as `${input.cover_image as image;path}` —
       * a filesystem path the server opens directly, which is also what the
       * workflow's own default (`"./cover.jpg"`) is. cover-ingest's `path`
       * is now built as exactly that: a server-relative filesystem path
       * (`webui/output/covers/…`), because its store's base_path lives
       * inside the static web UI's document root. Sent straight through, no
       * translation needed — unlike its sibling `url` (`/output/covers/…`),
       * which is what the browser fetches for the thumbnail and preview and
       * is not something the server can open as a path.
       */
      cover_image: effective(track.cover)?.path ?? null,
      title: effective(track.title) ?? "",
      artist: effective(track.artist) ?? "",
      main_color: effective(track.primary_color) ?? null,
      accent_color: effective(track.accent_color) ?? null,
    })),
  };
}

/*
 * Everything below `export function buildRenderInput` up to here runs at
 * import time against the real `document`, wired to the real api.js — by
 * design, this file has no init()/bootstrap split to keep it a plain,
 * flat script. That makes the module itself hard to unit test directly:
 * there is no seam to inject a fake api or drive the per-track debounce
 * without the full index.html shell already in the DOM.
 *
 * __test exists solely to give webui/test/app.test.js that seam. It is not
 * used by the app itself. The surface is kept to exactly what the tests need
 * to pin: a way to swap in a fake api (setApi), a way to create/remove
 * tracks and see the live list (addTrack/removeTrack/tracks), access to the
 * same handlers() factory renderEditor() itself uses (so a test exercises
 * the real onInput code path, not a re-implementation of it), and a way to
 * write straight to `settings.style` (setStyle) — the `<select>` it is
 * normally driven through only ever holds STYLES' one value, so it cannot
 * reach a sentinel discriminating enough to prove buildRenderInput actually
 * reads the setting instead of hardcoding it.
 *
 * friendlyError is here for the same reason and nothing more: it is pure,
 * it is the one place this file translates something for a consumer that
 * cannot speak up when it is wrong (the user reading an error), and it is
 * not reachable any other way. buildRenderInput is deliberately *not*
 * listed — it is already a real export. Nor is startRender: bindSettings()
 * has already wired it to #render against whatever document is present, so
 * a test drives it by clicking that button, which exercises the real wiring
 * instead of a second path to the same function.
 */
export const __test = {
  setApi(nextApi) {
    api = nextApi;
  },
  get tracks() {
    return tracks;
  },
  addTrack,
  removeTrack,
  handlers,
  setStyle(value) {
    settings.style = value;
  },
  friendlyError,
};

preview = createPreview(document.getElementById("preview"));
bindSettings();
if (!load()) addTrack();
selectedId = selectedId ?? tracks[0]?.id ?? null;
renderSettings();
renderAll();
