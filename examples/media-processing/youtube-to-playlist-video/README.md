# YouTube Playlist Video

Turn a list of YouTube links into one continuous video. A browser editor
ships with it.

## Overview

`render-playlist` takes a `tracks` list and:

1. reads YouTube cookies from a Chrome you already signed into, so
   restricted videos download like public ones — with no session it pauses
   and asks you to sign in;
2. renders each entry through the private `render-track` sub-workflow, a few
   in flight at a time, gathered back in order;
3. concatenates the clips and publishes the result where the editor can play
   it back.

Per track: download the audio, normalize its loudness, extract a per-frame
spectrum from it, then render every frame in a headless browser from an HTML
template and mux that stream with the audio. A failed track drops out and the
run pauses to ask whether to build from the rest.

## Templates

**The templates in [`ui/templates/`](./ui/templates/) are the single source
of truth for how a frame looks** — the workflow hands them the cover art, the
palette and the spectrum, and does no pixel processing of its own. Each is
three files sharing one basename (markup, styles, and a per-frame draw
script), and that basename *is* the `style` value that selects it. To add
one, copy a trio under a new name, point the copied markup at its own two
files, then register that name in the `style` option of `model-compose.yml`
and in the editor's per-style constants.

Templates lay out against a *logical* screen in five aspect ratios, which the
shared runtime scales to the render's resolution. The editor's preview runs
that same code, substituting a synthetic spectrum since a track is still just
a URL at edit time.

## Colors

The palette (primary, secondary, accent, text) is a plain input that
`model-compose.yml` never computes. Each `tracks[]` entry carries its own
`colors`; the render forwards whatever it is given and falls back to a
neutral default.

Deriving a palette from a cover happens entirely in the browser: the editor
quantizes the cover, proposes a palette you can accept or edit, and sends
whatever it holds at submit time. So the render can never disagree with the
preview — it computes no color of its own. From the CLI, run that extraction
yourself and pass the result in as `colors`.

## Loudness

YouTube returns whatever loudness the uploader mastered at, so a playlist
stitched from different videos jumps in volume at every boundary.
Normalization is a stock component, and the mode matters more than the
number: LUFS measures integrated loudness (ITU-R BS.1770) rather than
amplitude, and holds the gain under a true-peak ceiling. It needs two extra
Python packages (see [Prerequisites](#prerequisites)); RMS mode with a peak
limit needs nothing beyond numpy, but won't match how loud two tracks
actually *sound*.

## Preparation

### Prerequisites

- model-compose installed
- Google Chrome (or Chromium) — the sign-in step attaches to it
- `ffmpeg` (and `ffprobe`) in your `PATH`
- Playwright Chromium: `playwright install chromium`
- `yt-dlp`: `pip install yt-dlp`
- A JS runtime for yt-dlp's anti-bot solver — install `deno`, or downloads
  fail with `Requested format is not available`
- `pedalboard` and `pyloudnorm`: `pip install pedalboard pyloudnorm` (LUFS
  only; see [Loudness](#loudness) for the alternative)

### Launch Chrome with remote debugging

Use a dedicated profile so it doesn't collide with your day-to-day session:

**macOS**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-yt-profile
```

**Linux**
```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-yt-profile
```

**Windows (PowerShell)**
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir=$env:TEMP\chrome-yt-profile
```

Leave that window open and sign into YouTube in it. The session persists
across runs until you clear the profile or Google expires the cookies.

### Environment Configuration

```bash
cd examples/media-processing/youtube-to-playlist-video
```

`RENDER_CONCURRENCY` sets how many tracks render at once. Keep it small:
loudness normalization holds a whole decoded track in memory, so extra
concurrency costs RAM, not just CPU.

## How to Run

1. **Start the service**

   ```bash
   model-compose up
   ```

2. **Open the editor** at http://localhost:8081

   Add a track and paste a link; the title, artist, cover and palette fill
   themselves in. Adjust what you want, pick the style and output settings in
   the top bar, then press Render.

3. **Or trigger a render over HTTP**

   `render-track` is private; `render-playlist` is the one public render
   workflow, so a single track is a one-entry `tracks` list:

   ```bash
   curl -X POST http://localhost:8080/api/workflows/runs \
     -H 'Content-Type: application/json' \
     -d '{"workflow_id":"render-playlist","wait_for_completion":true,"output_only":true,
          "input":{"fps":30,"width":1080,"height":1920,
                   "tracks":[{"youtube_url":"https://www.youtube.com/watch?v=...",
                              "title":"Track Title","artist":"Artist Name"}]}}'
   ```

   Everything except `youtube_url` is optional. `style` takes a template's
   basename. `cover_image` is a filesystem path the server opens directly,
   not a URL; omit it and the frame renders without cover art. `colors` goes
   inside a track's own `tracks[]` entry. The response carries the finished
   video's path and the URL it is served at. This route runs the sign-in step
   too, so it can pause waiting on Chrome; resume it through the task API.

## Notes

- `yt-dlp` downloads the audio directly rather than playing it back, so this
  is much faster than recording a live playback (compare
  [capture-youtube-video](../../web-automation/capture-youtube-video/)).
- Respect the source video's terms of use and copyright.
- Videos and covers land under `ui/.output/` so the editor can serve them
  over HTTP, intermediate audio under `.output/`. Both are gitignored.
