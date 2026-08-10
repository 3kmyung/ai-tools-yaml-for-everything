# YouTube Playlist Video

Turn a YouTube playlist (or a single link) and cover art into a "now
playing" video. `style` picks which template in
[`webui/render/`](./webui/render/) draws every track — currently just:

- **waveform** — a minimal, monospaced "now playing" readout: plain
  cover art in a thin stroke between two rows of tracked uppercase
  captions, with a resynthesized waveform (not a bar meter) crossing
  the frame — it recolors itself where it passes over the art so it
  stays legible against any cover.

## Editing the visuals

**The templates in `webui/render/` are the single source of truth for how a
frame looks.** The workflow hands them raw material — the cover art, the
palette, the spectrum — and does no pixel processing of its own. So:

```bash
# open the template straight from disk — no server, no pipeline
start webui/render/animation-waveform.html   # Windows
open  webui/render/animation-waveform.html   # macOS
```

Opening a template directly gives you a live, auto-looping preview
running the *exact same code* a real render runs. It notices that
`window.__renderer` is missing and substitutes mock props (a synthetic
spectrum, a stand-in cover); everything downstream of that is shared.
Tweak a constant at the top of a template's `<script>`, reload, and the
number you settled on is the one the video gets — there's no second
implementation to keep in sync.

`webui/render/common.js` holds what every template needs: the mock-props
fallback, spectrum helpers (`frameAt`, `bassAt`), `Renderer.fitText`, and
the `window.__renderer` contract wiring. A template supplies only its own
markup, CSS, and a `draw(t)` function.

The default title is the video's own YouTube title, and those run long —
much longer than the short fixture a template is authored against. Every
template calls `Renderer.fitText(titleEl, { maxLines, minSize })` once
during setup (before `Renderer.start()`, so `seek()` stays deterministic):
it shrinks the title's font size until it fits within `maxLines`, down to
`minSize`, then clamps whatever still overflows with an ellipsis. A new
template needs this too, or a long title will simply run off the frame.

To add a style: copy a template to `webui/render/animation-<name>.html`, then
pass `input.style=<name>` — the renderer's `html:` path is built from
that value, so nothing else needs editing.

A template can also be previewed at any of the five supported aspect ratios
by appending `?ratio=`, e.g.
`webui/render/animation-waveform.html?ratio=9:16`. To check every
style/ratio combination at once, start the service and run:

```bash
python tools/screenshot-ratios.py
```

which writes `tools/shots/<style>-<ratio>.png` for each of the five
supported aspect ratios. It defaults to a genuinely long, realistic YouTube title rather
than the preview fixture's own eight-character "Papillon", because that
short fixture doesn't exercise `fitText`'s wrapping/shrinking at all —
pass `--title` to try a different one:

```bash
python tools/screenshot-ratios.py --title "Papillon"
```

## Verifying a real render

`run-tests.py` and `screenshot-ratios.py` both drive `webui/render/`
directly and never touch `model-compose.yml` — nothing else in this repo
exercises the actual workflow. `tools/verify-render.py` closes that gap: it
submits two real `render-playlist` runs against the running server (one
19-second video, a small resolution, so each finishes in well under a
minute), extracts a frame from each finished clip with `ffmpeg`, and asserts
a sentinel colour it asked for actually painted the frame — once for a
track's own `main_color` (`${item.main_color}`), once for a playlist-wide
`main_color` with no per-track override (the before-hook's fallback). It is
the only check that would catch `${item.main_color}` regressing back to
`${input.main_color}` (see [Design](#design) below) — a JS unit test can
only pin `webui/app.js`'s side of that bug, which is the half that was
already correct.

```bash
python tools/verify-render.py
```

Requires `model-compose up` already running and `ffmpeg` on `PATH`. Prints
what it asserted and exits non-zero on failure.

Templates are authored against a *logical* stage whose short side is always
720 — 1280x720 for 16:9, 720x1280 for 9:16, and so on. `common.js` scales
that stage to whatever `width`/`height` the render asks for, so a template
never deals with output resolution directly; it only has to lay out for the
five shapes. Ratio-specific rules hang off `#stage[data-orient="…"]` and
`#stage[data-ratio="…"]`.

Canvas drawing is the exception, because a backing store is fixed when it is
allocated: pass `ctx.stage.scale` into `Renderer.superSample()` so the store
covers the output resolution.

## Overview

`render-playlist` is the public entry point: it takes a `tracks` list, and
a `for-each` job dispatches the private `render-track` sub-workflow once
per entry (concurrently), each producing one clip; an after-hook then
concatenates the clips with ffmpeg (`-c copy`, since every clip comes
from the same encoder settings) into the final video. A single track is
just a one-entry `tracks` list — there's no separate single-track entry
point.

`render-track` does the actual per-track work, six jobs chained via
`depends_on`:

1. `download-audio` — a `job.hook.before` script shells out to `yt-dlp`
   to pull the best available audio track from the YouTube link. This
   isn't a model-compose component; it's a plain Python hook, so no core
   code is touched — see [Prerequisites](#prerequisites).
2. `save-audio` — `file-store` persists the downloaded audio once so the
   next two jobs can each re-read it independently by URL.
3. `spectrum` — `audio-feature-extractor` produces a per-frame frequency
   spectrum (same component/config as the
   [audio-spectrum-to-video](../audio-spectrum-to-video/) example).
4. `process-cover` — runs the cover through the `cover-ingest` workflow
   (via the `cover-ingester` component), which is where the resize, the
   dominant-color extraction (PIL palette quantization, no extra
   dependency) and the base64 encoding actually live. The job itself has
   no hook: one implementation, shared with the editor, so the colors the
   browser shows cannot disagree with the colors the render uses.
5. `frames` — `html-frame-renderer` (Playwright) renders
   `webui/render/animation-${style}.html` once per frame: title/artist,
   the cover art and the color palette are injected once via `props`;
   the template pulls out only the props it needs and redraws its own
   visualization every frame from the spectrum data.
6. `encode` — `video-encoder` (ffmpeg) muxes the rendered frames with the
   original audio into the final MP4.

Three more workflows exist for the editor rather than the render itself:

- `resolve-youtube-defaults` — metadata only (no audio download): the
  video's title and channel, plus its thumbnail run through `cover-ingest`.
- `resolve-cover-defaults` — the same, for a cover the user supplies.
- `cover-ingest` — stores a cover image and derives the preview data URI
  and the palette. `process-cover` goes through it too, so the colors the
  editor shows are by construction the colors the render uses.

## Design

The palette (background, accent, secondary, text) is derived from the
cover image at request time by default, or overridden with
`main_color` / `accent_color` — playlist-wide at the top of `input`, or
per track inside a `tracks[]` entry (which is what the editor sends when
you change a color there). `render-tracks`' before-hook folds the
playlist-wide values down onto every entry that did not bring its own, so
by the time a clip renders there is exactly one place its colors come
from. Colors and the cover art are shared with every template — a second
style would get the same raw material and just draw it differently;
`input.style` is what picks between them.

The split between workflow and templates is deliberate: the workflow
does what a browser can't (download audio, run FFT, call a segmentation
model), and everything downstream of that is HTML/CSS/JS you can open
and edit live. That's also what keeps the preview honest — there is only
one implementation of each effect, so a preview can't drift from a
render.

## Preparation

### Prerequisites

- model-compose installed
- `ffmpeg` in your `PATH`
- Playwright Chromium browser: `playwright install chromium`
- `yt-dlp`: `pip install yt-dlp` (used only inside the `download-audio`
  job's hook script, not a core model-compose dependency)

### Environment

```bash
cd examples/media-processing/youtube-to-playlist-video
```

## How to Run

1. **Start the service**

   ```bash
   model-compose up
   ```

2. **Open the editor** at http://localhost:8081

   Paste a YouTube link and the title, artist, cover art and palette fill
   themselves in from the video. Every field shows its derived default in
   grey; type over one and it turns solid, with a `↺` that puts the default
   back. Changing the link refreshes the defaults underneath whatever you
   typed — your edits stay until you revert them.

   Pick the aspect ratio and resolution in the top bar. The preview on the
   right is the real template, running the same code the render will run.

3. **Or trigger a render over HTTP**

   `render-track` is `private: true` and isn't reachable over HTTP —
   `render-playlist` is the one public render workflow, so a single track
   is a one-entry `tracks` list:

   ```bash
   curl -X POST http://localhost:8080/api/workflows/runs \
     -H 'Content-Type: application/json' \
     -d '{"workflow_id":"render-playlist","wait_for_completion":true,"output_only":true,
          "input":{"style":"waveform","fps":30,"width":1080,"height":1920,
                   "tracks":[{"youtube_url":"https://www.youtube.com/watch?v=...",
                              "cover_image":"./cover.jpg","title":"Track Title",
                              "artist":"Artist Name"}]}}'
   ```

   Everything except `youtube_url` is optional. An omitted (or explicitly
   null) `cover_image` falls back to the example's own `./cover.jpg`, so a
   track can be rendered from nothing but a link. `cover_image` is a
   filesystem path the server opens directly (`./cover.jpg` resolves
   relative to the server's working directory) — not a URL, and not a
   `file://` URI. `main_color` / `accent_color` may be given per track as
   well as playlist-wide; a track that carries its own wins, and the
   playlist-wide value fills in the rest. The response is
   `{"path":"<task_id>.mp4","url":"/output/<task_id>.mp4"}`, and the video is
   served from the editor's own origin at that URL.

## Notes

- `yt-dlp` downloads the audio directly (no real-time playback), so this
  is much faster than recording a live YouTube playback (compare
  [capture-youtube-video](../../web-automation/capture-youtube-video/)).
- Respect the source video's terms of use and copyright when downloading
  audio.
- Finished videos are written to `webui/output/` so the editor can play
  them back over HTTP. That directory is gitignored; delete it freely.
- Covers the editor ingests (an upload, or a YouTube thumbnail) are stored
  under `webui/output/covers/`, the same document root, for the same
  reason: it gives each cover a real `/output/covers/…` URL the browser can
  put straight in `<img src>`, so an uploaded cover's thumbnail survives a
  page reload instead of going blank. Also gitignored; also safe to delete.
