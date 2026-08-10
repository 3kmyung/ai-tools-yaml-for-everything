#!/usr/bin/env python3
"""
End-to-end check that a real render-playlist run actually carries a track's
colour choice into the finished video.

Nothing else in this repo exercises model-compose.yml itself: run-tests.py
and screenshot-ratios.py both drive the webui/render/ templates directly,
never the workflow that feeds them. That is exactly the gap the per-track
colour bug lived in — the GUI's payload put a colour inside each `tracks[]`
entry, `render-tracks`' `do.input` read it from `${input.main_color}` (the
workflow's own input, a for-each registers `item` and `input` as separate
sources), and every test in the suite stayed green while the preview
honoured the user's colour and the render silently didn't. Reverting
`${item.main_color}` back to `${input.main_color}` in model-compose.yml
today would still pass every JS unit test; this tool is what would catch it.

It proves both colour paths render-tracks' before-hook creates, by actually
submitting two renders against the running server and looking at what
painted the frame:

  1. a track whose own `main_color` is a sentinel colour nothing in
     ./cover.jpg's derived palette could produce — proves `${item.main_color}`
     (the per-track override, what broke).
  2. a track with no per-track colour at all, under a playlist-wide
     `main_color` (a second, different sentinel) — proves the fallback path
     the fix's before-hook added: folding a playlist-wide colour onto an
     entry that did not bring its own. Nothing else in the repo checks this
     path either.

"Dominates" is measured as the frame's most common colour (RGB, bucketed to
the nearest 8 to absorb H.264 quantisation noise). That is a fair test here
specifically because of how the waveform template is built: `#stage`'s own
background *is* `--primary` (model-compose.yml wires `main_color` into
`colors.primary`), and the cover art only occupies a small square at the
frame's centre — 252px against a logical 1280x720 stage, ~7% of the frame's
area — with everything else (waveform strokes, captions) thin lines on top
of that background. So background pixels vastly outnumber every other
colour on the frame at any output resolution, and if the sentinel isn't the
most common colour, the colour named in the request never reached the
render. (The alternative the task brief also allows — sampling a fixed
coordinate known to sit on `--primary`, e.g. a corner pixel — would work too,
but ties the check to this one template's layout; the frame-wide mode does
not, and stays valid if a second style is ever added here.)

Requires:
  - `model-compose up` already running (the http-server adapter on :8080)
  - `ffmpeg` on PATH

Usage:
    python tools/verify-render.py
"""
from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from collections import Counter

API_URL = "http://127.0.0.1:8080/api/workflows/runs"
EXAMPLE_ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT_DIR = EXAMPLE_ROOT / "webui" / "output"

# "Me at the zoo" — the first YouTube video ever uploaded, 19 seconds, so a
# real render (audio pull, spectrum, one clip's worth of frames, encode)
# stays quick. Small output resolution keeps the frame count's pixel cost
# down too; a for-each of one track is the smallest render-playlist can do.
YOUTUBE_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw"
WIDTH, HEIGHT = 320, 180
FPS = 24  # the lowest of the workflow's fps select/24,30,60 — fewer frames
FRAME_TIME = 1.0  # seconds into the clip to sample; well inside a 19s clip

# Saturated, synthetic primaries: nothing a JPEG photo's PIL palette
# quantization (cover-ingest's `describe` job) would produce, and different
# enough from each other that the two checks could not pass by mixing up
# which colour reached which render.
SENTINEL_TRACK = "#ff00ff"  # the per-track override: tracks[0].main_color
SENTINEL_PLAYLIST = "#00ff00"  # the playlist-wide fallback: input.main_color

BUCKET = 8  # colour-quantization bucket, absorbs H.264 noise on flat fills
CHANNEL_TOLERANCE = 24  # per-channel match radius when comparing to a sentinel


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))


def submit_render(tracks: list[dict], *, main_color: str | None = None) -> dict:
    payload = {
        "workflow_id": "render-playlist",
        "wait_for_completion": True,
        "output_only": True,
        "input": {
            "fps": FPS,
            "width": WIDTH,
            "height": HEIGHT,
            "tracks": tracks,
        },
    }
    if main_color:
        payload["input"]["main_color"] = main_color

    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        API_URL, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        # Generous timeout: a real render (yt-dlp pull + spectrum + frames +
        # encode) blocks the whole request until it finishes.
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.loads(response.read())
    except urllib.error.URLError as error:
        print(f"Could not reach {API_URL}: {error}")
        print("Is `model-compose up` running in examples/media-processing/youtube-to-playlist-video?")
        sys.exit(1)


def extract_frame_rgb(video_path: pathlib.Path) -> bytes:
    """One frame as raw, uncompressed rgb24 bytes — no Pillow, no imageio;
    ffmpeg is already a required prerequisite for this example."""
    command = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-ss", str(FRAME_TIME), "-i", str(video_path),
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{WIDTH}x{HEIGHT}", "-",
    ]
    result = subprocess.run(command, capture_output=True)
    if result.returncode != 0:
        print(f"ffmpeg failed to extract a frame from {video_path}:")
        print(result.stderr.decode("utf-8", errors="replace"))
        sys.exit(1)
    return result.stdout


def most_common_color(frame: bytes) -> tuple[tuple[int, int, int], float]:
    counts: Counter[tuple[int, int, int]] = Counter()
    pixel_count = len(frame) // 3
    for i in range(0, len(frame), 3):
        r, g, b = frame[i], frame[i + 1], frame[i + 2]
        counts[(r // BUCKET * BUCKET, g // BUCKET * BUCKET, b // BUCKET * BUCKET)] += 1
    color, count = counts.most_common(1)[0]
    return color, count / pixel_count


def close_enough(a: tuple[int, int, int], b: tuple[int, int, int]) -> bool:
    return all(abs(x - y) <= CHANNEL_TOLERANCE for x, y in zip(a, b))


def check(label: str, tracks: list[dict], sentinel_hex: str, *, main_color: str | None = None) -> bool:
    print(f"\n=== {label} ===")
    print(f"submitting render-playlist ({YOUTUBE_URL}, {WIDTH}x{HEIGHT}@{FPS}fps)…")
    output = submit_render(tracks, main_color=main_color)

    if "path" not in output:
        print(f"FAIL render did not return a path — response was: {output}")
        return False

    video_path = OUTPUT_DIR / output["path"]
    if not video_path.exists():
        print(f"FAIL rendered video not found at {video_path}")
        return False
    print(f"rendered {video_path}")

    frame = extract_frame_rgb(video_path)
    dominant, fraction = most_common_color(frame)
    sentinel_rgb = hex_to_rgb(sentinel_hex)

    print(f"asserting: the frame's most common colour at t={FRAME_TIME}s is {sentinel_hex} {sentinel_rgb}")
    print(f"  most common colour found: rgb{dominant} ({fraction:.0%} of the frame)")

    if not close_enough(dominant, sentinel_rgb):
        print(f"FAIL {sentinel_hex} does not dominate the frame — the colour never reached the render.")
        return False

    print(f"PASS {sentinel_hex} dominates the frame ({fraction:.0%})")
    return True


def main() -> int:
    if shutil.which("ffmpeg") is None:
        print("verify-render needs `ffmpeg` on PATH to extract a frame from the rendered video.")
        return 1

    track_ok = check(
        "per-track colour override -> ${item.main_color}",
        [{
            "youtube_url": YOUTUBE_URL,
            "title": "Verify Track",
            "artist": "verify-render.py",
            "main_color": SENTINEL_TRACK,
        }],
        SENTINEL_TRACK,
    )

    playlist_ok = check(
        "playlist-wide colour, no per-track override -> render-tracks' before-hook fallback",
        [{
            "youtube_url": YOUTUBE_URL,
            "title": "Verify Track",
            "artist": "verify-render.py",
        }],
        SENTINEL_PLAYLIST,
        main_color=SENTINEL_PLAYLIST,
    )

    print()
    if track_ok and playlist_ok:
        print("verify-render: PASS — both the per-track and playlist-wide colour paths reached the render.")
        return 0
    print("verify-render: FAIL — see above.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
