import { test, assertEqual } from "./harness.js";

/*
 * app.js runs its bootstrap (bindSettings(), load()/addTrack(),
 * renderSettings(), renderAll()) against the real `document` the moment it
 * is imported — that is what lets it stay a flat script with no
 * init()/bootstrap split. test.html, unlike index.html, has none of the
 * shell elements that bootstrap expects (#style, #ratio, #track-list, …),
 * so a static `import "../app.js"` at the top of this file would throw
 * before a single test runs. The shell is built here first, and app.js is
 * imported dynamically (top-level await) only once it exists — the same
 * order the real page loads in, just assembled by hand instead of parsed
 * from index.html.
 *
 * localStorage is cleared first so a previous test file's (or a previous
 * run's) persisted tracks/settings can't leak into `load()`.
 */
localStorage.removeItem("youtube-to-playlist-video/state");

document.body.insertAdjacentHTML(
  "beforeend",
  `
  <header id="settings">
    <select id="style"></select>
    <select id="ratio"></select>
    <select id="resolution"></select>
    <select id="fps"></select>
    <input id="bands" type="number" />
    <span id="cost-warning" hidden></span>
    <button id="render" type="button"></button>
  </header>
  <main>
    <section id="tracks">
      <ol id="track-list"></ol>
      <button id="add-track" type="button"></button>
    </section>
    <section id="editor"></section>
    <section id="preview" class="preview"></section>
  </main>
  <footer id="status" hidden></footer>
  `
);

const { __test, buildRenderInput } = await import("../app.js");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Matches app.js's own URL_DEBOUNCE_MS (500ms). Not imported/re-exported
// (that would widen __test's surface for a single constant) — instead
// these tests wait comfortably past it.
const PAST_DEBOUNCE_MS = 700;

function fakeApi(youtubeDefaultsImpl) {
  const calls = [];
  return {
    calls,
    async youtubeDefaults(url) {
      calls.push(url);
      return youtubeDefaultsImpl(url);
    },
  };
}

const YOUTUBE_SPEC = { key: "youtube_url" };

test("typing a URL into two different tracks in quick succession resolves both, not just the most recent (per-track debounce)", async () => {
  const api = fakeApi(async (url) => ({
    title: `Title for ${url}`,
    artist: `Artist for ${url}`,
    cover: null,
  }));
  __test.setApi(api);

  const before = __test.tracks.length;
  __test.addTrack();
  const trackA = __test.tracks[__test.tracks.length - 1];
  __test.addTrack();
  const trackB = __test.tracks[__test.tracks.length - 1];
  assertEqual(__test.tracks.length, before + 2);

  const handlersA = __test.handlers(trackA, YOUTUBE_SPEC);
  const handlersB = __test.handlers(trackB, YOUTUBE_SPEC);

  // A single shared timer variable would have B's clearTimeout() cancel A's
  // still-pending resolve here, since both onInput calls land inside the
  // same 500ms debounce window.
  handlersA.onInput("https://youtu.be/aaa");
  await sleep(50);
  handlersB.onInput("https://youtu.be/bbb");

  await sleep(PAST_DEBOUNCE_MS);

  assertEqual(trackA.title.default, "Title for https://youtu.be/aaa");
  assertEqual(trackA.artist.default, "Artist for https://youtu.be/aaa");
  assertEqual(trackB.title.default, "Title for https://youtu.be/bbb");
  assertEqual(trackB.artist.default, "Artist for https://youtu.be/bbb");
  assertEqual(api.calls.includes("https://youtu.be/aaa"), true, "track A's resolve must not be dropped");
  assertEqual(api.calls.includes("https://youtu.be/bbb"), true, "track B's resolve must still run");

  __test.removeTrack(trackA.id);
  __test.removeTrack(trackB.id);
});

test("removing a track while its YouTube resolve is in flight does not throw", async () => {
  const api = fakeApi(async (url) => {
    // Simulate a slow network round trip, so the removal below lands while
    // invalidate()'s await is genuinely in flight, not merely queued.
    await sleep(300);
    return { title: "Resolved Title", artist: "Resolved Artist", cover: null };
  });
  __test.setApi(api);

  __test.addTrack();
  const track = __test.tracks[__test.tracks.length - 1];
  const trackId = track.id;
  const fieldHandlers = __test.handlers(track, YOUTUBE_SPEC);

  const errors = [];
  const onWindowError = (event) => errors.push(event.error ?? event.message ?? event);
  const onRejection = (event) => errors.push(event.reason ?? event);
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onRejection);

  try {
    fieldHandlers.onInput("https://youtu.be/removed-mid-flight");
    // Past the 500ms debounce, comfortably inside the fake 300ms network
    // delay: the resolve is genuinely in flight, not just scheduled.
    await sleep(600);
    __test.removeTrack(trackId);
    // Let the in-flight resolve (and the renderAll() after it) finish.
    await sleep(400);
  } finally {
    window.removeEventListener("error", onWindowError);
    window.removeEventListener("unhandledrejection", onRejection);
  }

  assertEqual(
    errors.length,
    0,
    `unexpected error(s): ${errors.map((e) => e?.message ?? String(e)).join(", ")}`
  );
  assertEqual(
    __test.tracks.some((t) => t.id === trackId),
    false,
    "the removed track must actually be gone"
  );
});

/* ---------- submitting a render ---------- */

/*
 * Bootstrap leaves exactly one empty track in the module-level list, and
 * these tests need to control that list exactly (startRender refuses the
 * whole playlist if *any* track is missing a URL, so a stray empty track
 * from another test would make a render test pass for the wrong reason).
 * Clears the list, builds one track per spec, and puts the single empty
 * bootstrap track back afterwards so later tests see the state they expect.
 */
async function withTracks(specs, fn) {
  for (const track of [...__test.tracks]) __test.removeTrack(track.id);

  const built = specs.map((spec) => {
    __test.addTrack();
    const track = __test.tracks[__test.tracks.length - 1];
    track.youtube_url.value = spec.youtube_url ?? "";
    if ("cover" in spec) track.cover.value = spec.cover;
    if ("title" in spec) track.title.value = spec.title;
    if ("artist" in spec) track.artist.value = spec.artist;
    if ("primary_color" in spec) track.primary_color.value = spec.primary_color;
    if ("accent_color" in spec) track.accent_color.value = spec.accent_color;
    return track;
  });

  try {
    return await fn(built);
  } finally {
    for (const track of [...__test.tracks]) __test.removeTrack(track.id);
    __test.addTrack();
  }
}

/*
 * The shape cover-ingest returns: a server-relative filesystem path (openable
 * directly by render-playlist's `${…cover_image as image;path}`) and, built
 * from that same stored file, a browser-fetchable url (an <img src>). Both
 * live inside the static web UI's own document root now — see
 * model-compose.yml's cover-ingest `output:` block.
 *
 * `url` here can't actually be `/output/covers/${name}` the way production
 * builds it: that path only exists once cover-ingest has really run, and
 * these tests exercise the real onInput -> save() -> renderAll() path,
 * which renderTrackList() uses to set a real <img>'s src (see app.js). A
 * name this suite invents 404s against the static server and run-tests.py
 * treats that as a page error. webui/test/fixtures/cover.jpg is a real
 * file the server does serve, so `url` points there instead — `path` still
 * gets the production-shaped name since it's a plain string these tests
 * only ever compare, never fetch.
 */
function ingestedCover(name = "01ABC.jpg") {
  return {
    path: `webui/output/covers/${name}`,
    url: `/test/fixtures/cover.jpg`,
    data_uri: "data:image/jpeg;base64,/9j/4AA",
    colors: { primary: "#111111", accent: "#ff5b04" },
  };
}

/*
 * The regression test for the bug that shipped in c2101bae: buildRenderInput
 * sent the ingested cover's `url` (a file:// URI at the time) verbatim, so
 * render-playlist's `${input.cover_image as image;path}` stat()ed the
 * literal string "file:///D:/…" and every single GUI render died in
 * process-cover with WinError 123. `url` is no longer a file:// URI (it is
 * now the browser's fetch target, a job `path` never did and still
 * shouldn't), so the fix is stated the same way: whatever cover_image is, it
 * must be something the server can open, and it must come from `path`
 * directly rather than be derived from `url`.
 */
test("buildRenderInput sends a store-ingested cover's path directly, not its url", async () => {
  await withTracks(
    [{ youtube_url: "https://youtu.be/aaa", cover: ingestedCover("01ABC.jpg") }],
    () => {
      const input = buildRenderInput();
      assertEqual(input.tracks.length, 1);
      assertEqual(input.tracks[0].cover_image, "webui/output/covers/01ABC.jpg");
    }
  );
});

test("buildRenderInput leaves a track with no cover at null", async () => {
  await withTracks([{ youtube_url: "https://youtu.be/aaa" }], () => {
    assertEqual(buildRenderInput().tracks[0].cover_image, null);
  });
});

/* ---------- the payload render-playlist actually consumes ---------- */

/*
 * buildRenderInput's output is a contract with model-compose.yml, and it is a
 * contract nothing checked: every field is optional on the workflow side, so
 * a key sent under the wrong name, at the wrong level, or not at all produces
 * a video rather than an error. That is precisely how the per-track colours
 * shipped broken — the editor put `main_color` inside each `tracks[]` entry
 * while `render-tracks`' `do.input` read `${input.main_color}`, the workflow
 * input, which a for-each registers as a source separate from `${item}`. The
 * preview honoured the user's colour and the render did not, silently.
 *
 * So these tests state, in one place, where each value has to land. The
 * right-hand column is the expression in model-compose.yml that reads it:
 *
 *   input.style       -> render-tracks do.input `${input.style …}`
 *   input.fps         -> render-tracks do.input `${input.fps …}`
 *   input.band_count  -> render-tracks do.input `${input.band_count …}`
 *   input.width       -> render-tracks do.input `${input.width …}`
 *   input.height      -> render-tracks do.input `${input.height …}`
 *   tracks[].youtube_url  -> `${item.youtube_url}`
 *   tracks[].cover_image  -> `${item.cover_image | ./cover.jpg}`
 *   tracks[].title        -> `${item.title}`
 *   tracks[].artist       -> `${item.artist}`
 *   tracks[].main_color   -> `${item.main_color}`   (was `${input.main_color}`)
 *   tracks[].accent_color -> `${item.accent_color}` (was `${input.accent_color}`)
 *
 * prev_title / next_title are deliberately absent: render-tracks' own
 * before-hook stamps them onto each entry, because only that hook can see the
 * whole list at once.
 */
const PLAYLIST_KEYS = ["style", "fps", "band_count", "width", "height", "tracks"];
const TRACK_KEYS = [
  "youtube_url",
  "cover_image",
  "title",
  "artist",
  "main_color",
  "accent_color",
];

/* Drives the real change handlers bindSettings() wired, not a second path. */
function setSetting(id, value) {
  const element = document.getElementById(id);
  element.value = String(value);
  element.dispatchEvent(new Event("change"));
}

test("buildRenderInput sends exactly the keys render-playlist reads, at the level it reads them", async () => {
  await withTracks([{ youtube_url: "https://youtu.be/aaa" }], () => {
    const input = buildRenderInput();
    assertEqual(Object.keys(input).sort(), [...PLAYLIST_KEYS].sort());
    assertEqual(Object.keys(input.tracks[0]).sort(), [...TRACK_KEYS].sort());
  });
});

test("buildRenderInput puts style/fps/band_count/width/height at the top level, where the for-each's do.input reads them", async () => {
  setSetting("style", "waveform");
  setSetting("fps", 60);
  setSetting("ratio", "9:16");
  setSetting("resolution", "1080x1920");
  setSetting("bands", 40);

  try {
    await withTracks([{ youtube_url: "https://youtu.be/aaa" }], () => {
      const input = buildRenderInput();
      // style itself is pinned separately, below — see
      // "buildRenderInput reads style from live settings…".
      assertEqual(input.fps, 60);
      // `band_count`, not `bands`: the workflow reads `${input.band_count}`.
      assertEqual(input.band_count, 40);
      assertEqual([input.width, input.height], [1080, 1920]);
      // Numbers, not the strings a <select>/<input> hands back — the
      // workflow's `as integer` would coerce them, but the payload is also
      // what the README documents as JSON.
      assertEqual(typeof input.fps, "number");
      assertEqual(typeof input.band_count, "number");
      assertEqual(typeof input.width, "number");
      assertEqual(typeof input.height, "number");
      // Nothing per-track duplicates a playlist-wide setting.
      for (const key of ["style", "fps", "band_count", "width", "height"]) {
        assertEqual(key in input.tracks[0], false, `${key} must not be repeated per track`);
      }
    });
  } finally {
    setSetting("style", "waveform");
    setSetting("fps", 30);
    setSetting("ratio", "16:9");
    setSetting("resolution", "1280x720");
    setSetting("bands", 28);
  }
});

/*
 * The example ships exactly one design, so "waveform" is both STYLES' only
 * value and DEFAULT_SETTINGS.style — asserting input.style === "waveform"
 * alone would pass even if buildRenderInput hardcoded that string and never
 * read settings.style at all. The <select> can't be driven to anything else
 * (STYLES has nothing else to put in it), so this reaches past the DOM with
 * __test.setStyle straight to the model buildRenderInput actually reads.
 * buildRenderInput is a pure payload builder that never validates style
 * against STYLES, so a value no real template answers to still exercises the
 * real read path — proving it needs no second template.
 */
test("buildRenderInput reads style from live settings rather than a hardcoded fallback", async () => {
  __test.setStyle("__sentinel-style__");
  try {
    await withTracks([{ youtube_url: "https://youtu.be/aaa" }], () => {
      assertEqual(buildRenderInput().style, "__sentinel-style__");
    });
  } finally {
    __test.setStyle("waveform");
  }
});

/*
 * The C1 regression. A colour overridden on one track has to arrive inside
 * that track's own entry — the only place `${item.main_color}` can see it —
 * and must not leak onto its neighbours.
 */
test("a per-track colour override survives into that track's own payload entry", async () => {
  await withTracks(
    [
      { youtube_url: "https://youtu.be/aaa", primary_color: "#123456", accent_color: "#abcdef" },
      { youtube_url: "https://youtu.be/bbb" },
    ],
    () => {
      const { tracks } = buildRenderInput();
      assertEqual(tracks.length, 2);
      assertEqual(tracks[0].main_color, "#123456");
      assertEqual(tracks[0].accent_color, "#abcdef");
      // Untouched track: null, not the neighbour's colour and not a
      // made-up one. The workflow reads that as "no override", so the
      // palette derived from the cover stands.
      assertEqual(tracks[1].main_color, null);
      assertEqual(tracks[1].accent_color, null);
    }
  );
});

/*
 * A colour the editor derived from the cover is just as real an input as one
 * the user typed — effective() does not distinguish, and neither may the
 * payload, or a render would come back in a different palette from the
 * preview that was approved.
 */
test("a colour derived from the cover is sent too, not only a typed override", async () => {
  await withTracks([{ youtube_url: "https://youtu.be/aaa" }], async ([track]) => {
    track.primary_color.default = "#0b0b0b";
    track.accent_color.default = "#ff5b04";
    const { tracks } = buildRenderInput();
    assertEqual(tracks[0].main_color, "#0b0b0b");
    assertEqual(tracks[0].accent_color, "#ff5b04");

    // …and a typed override still wins over the derived default.
    track.primary_color.value = "#ffffff";
    assertEqual(buildRenderInput().tracks[0].main_color, "#ffffff");
  });
});

test("title and artist ride along per track, under the names the workflow reads", async () => {
  await withTracks(
    [{ youtube_url: "https://youtu.be/aaa", title: "PAPILLON", artist: "NMIXX" }],
    () => {
      const { tracks } = buildRenderInput();
      assertEqual(tracks[0].title, "PAPILLON");
      assertEqual(tracks[0].artist, "NMIXX");
      // prev/next are the before-hook's business, not the editor's — only
      // that hook can see the whole list at once.
      assertEqual("prev_title" in tracks[0], false);
      assertEqual("next_title" in tracks[0], false);
    }
  );
});

/* ---------- persistence ---------- */

/*
 * An ingested cover's data_uri is the whole image re-encoded as base64 — one
 * real cover measured 213,820 characters. Persisting it put a dozen tracks
 * over the ~5 MB an origin gets, and re-serialised hundreds of KB on every
 * frame of a colour-picker drag, which is the one interaction the design
 * spec says has to stay smooth. data_uri is dropped; `path` and `url`
 * survive — `url` is the load-bearing one now: it is what lets a reload
 * redisplay an uploaded cover's thumbnail (renderTrackList/renderPreview
 * read `.url`, not `.data_uri`) with no base64 anywhere in storage.
 */
test("a cover is persisted by its path and url, never as its base64 bytes", async () => {
  await withTracks([{ youtube_url: "https://youtu.be/aaa", cover: ingestedCover() }], ([track]) => {
    // Any edit reaches save() through renderAll(), which is how the app
    // itself persists — no second path to the same function.
    __test.handlers(track, { key: "title" }).onInput("Persisted");

    const raw = localStorage.getItem("youtube-to-playlist-video/state");
    assertEqual(raw.includes("data:image/jpeg;base64"), false, "cover bytes must not reach storage");
    assertEqual(raw.includes("data_uri"), false, "the key itself is dropped, not just emptied");

    const stored = JSON.parse(raw).tracks[0];
    // Everything else about the cover survives — path is what the render is
    // handed, url is what a reload's <img> re-fetches, and the colours are
    // what the fields were derived from.
    assertEqual(stored.cover.value.path, "webui/output/covers/01ABC.jpg");
    assertEqual(stored.cover.value.url, "/test/fixtures/cover.jpg");
    assertEqual(stored.cover.value.colors, { primary: "#111111", accent: "#ff5b04" });
    // And the in-memory track keeps its bytes: only the copy going to
    // storage is slimmed, or the thumbnail would vanish mid-session.
    assertEqual(track.cover.value.data_uri, "data:image/jpeg;base64,/9j/4AA");
  });
});

/* ---------- the Bands input ---------- */

test("clearing the Bands input falls back to the default rather than persisting 0", async () => {
  setSetting("bands", "");
  try {
    // Number("") is 0, which used to persist and render a dead equalizer.
    assertEqual(document.getElementById("bands").value, "28");
    await withTracks([{ youtube_url: "https://youtu.be/aaa" }], () => {
      assertEqual(buildRenderInput().band_count, 28);
    });
  } finally {
    setSetting("bands", 28);
  }
});

test("a Bands count past index.html's own min/max is clamped, not sent as typed", async () => {
  try {
    setSetting("bands", 500);
    assertEqual(document.getElementById("bands").value, "96");
    setSetting("bands", 1);
    assertEqual(document.getElementById("bands").value, "8");
    await withTracks([{ youtube_url: "https://youtu.be/aaa" }], () => {
      assertEqual(buildRenderInput().band_count, 8);
    });
  } finally {
    setSetting("bands", 28);
  }
});

test("friendlyError turns fetch's bare TypeError into something a user can act on", () => {
  const message = __test.friendlyError(new TypeError("Failed to fetch"));
  assertEqual(message.includes("Failed to fetch"), false, "the raw fetch message must not reach the user");
  assertEqual(
    message,
    "Lost connection to the render server. It may still be running — check back shortly."
  );
});

test("friendlyError does not mangle an ordinary error message", () => {
  // A non-OK HTTP response is already unwrapped by api.js's readError(), so
  // its detail is the useful text and must survive verbatim.
  assertEqual(__test.friendlyError(new Error("No tracks produced a clip to concatenate.")),
    "No tracks produced a clip to concatenate.");
});

/*
 * Drives the real #render click handler (bindSettings() wired it to this
 * document at import) against a fake whose watchTask keeps reporting
 * "processing" until cancelTask actually lands — which is exactly how the
 * adapter behaves, since watchTask has no abort of its own. Pins the honest
 * intermediate state as well as the settled one: the point of cancelRequested
 * is that the button must not spring back to a fresh, clickable "Cancel"
 * between the click and the server's confirmation.
 */
test("cancelling a render shows 'Cancelling…' until the server confirms, then settles and re-enables Render", async () => {
  const cancelCalls = [];
  // A real server keeps reporting the task as running for at least another
  // poll or two after it accepts the cancel — that gap is the whole reason
  // cancelRequested exists. Held open explicitly rather than with a sleep so
  // the window under test cannot be raced away on a slow or fast machine.
  let confirmCancelled = () => {};
  const cancelConfirmed = new Promise((resolve) => {
    confirmCancelled = resolve;
  });

  __test.setApi({
    async startRender() {
      return { task_id: "task-1", status: "pending" };
    },
    async watchTask(taskId, onState) {
      onState({ status: "processing" });
      let settled = false;
      cancelConfirmed.then(() => {
        settled = true;
      });
      // Keeps polling regardless of the cancel, exactly as the real
      // watchTask does — it has no abort of its own.
      while (!settled) {
        await sleep(10);
        onState({ status: "processing" });
      }
      return { status: "cancelled" };
    },
    async cancelTask(taskId) {
      cancelCalls.push(taskId);
    },
  });

  await withTracks([{ youtube_url: "https://youtu.be/aaa" }], async () => {
    const renderButton = document.getElementById("render");
    const status = document.getElementById("status");

    renderButton.click();
    await sleep(60);

    assertEqual(renderButton.disabled, true, "Render must be disabled while a task is running");
    const cancel = status.querySelector(".status-cancel");
    assertEqual(cancel !== null, true, "a running task must offer a Cancel button");
    assertEqual(cancel.textContent, "Cancel");
    assertEqual(cancel.disabled, false);

    cancel.click();
    await sleep(30);

    // Re-queried: the click re-renders the status area in place.
    const cancelling = status.querySelector(".status-cancel");
    assertEqual(cancelling.textContent, "Cancelling…", "the button must not claim the render already stopped");
    assertEqual(cancelling.disabled, true, "a pending cancel must not look clickable again");
    assertEqual(renderButton.disabled, true, "Render stays disabled until the task is genuinely over");
    assertEqual(cancelCalls, ["task-1"], "the cancel must reach the server with the active task id");

    // Only now does the "server" report the task as actually cancelled.
    confirmCancelled();
    await sleep(120);

    assertEqual(renderButton.disabled, false, "Render must re-enable once the task settles");
    assertEqual(status.textContent, "Render cancelled");
    assertEqual(status.querySelectorAll("video").length, 0, "a cancelled render must not show a result video");
    assertEqual(status.querySelectorAll(".status-cancel").length, 0);
  });
});
