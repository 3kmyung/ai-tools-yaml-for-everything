# youtube-to-playlist-video webui: design tokens + minimal visual pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `webui/app.css`'s hardcoded colors, font sizes, spacing, and border-radius values with CSS custom properties, and use that pass to make the editor read as more sleek/minimal — same layout, same markup, same JS.

**Architecture:** Single-file CSS refactor in four independently-reviewable passes: (1) color + typography tokens, (2) spacing tokens with a deliberate "more breathing room" bump, (3) a binary border-radius system (sharp containers, pill/circular controls), (4) minimal hover/focus-visible states. Each pass rewrites `webui/app.css` in place; no other file changes (confirmed below — `main`'s grid values live in `app.css`, not `index.html`, so `index.html` needs no edits at all).

**Tech Stack:** Plain CSS custom properties (`:root` variables), `color-mix()` for hover/selected tints (broadly supported since 2023, no build step, no preprocessor).

## Global Constraints

- No build tooling, no Tailwind, no preprocessor — stays one hand-written `app.css` file, per `docs/superpowers/specs/2026-08-10-youtube-to-playlist-video-gui-tokens-design.md`.
- No changes to `webui/app.js`, `webui/fields.js`, `webui/preview.js`, `webui/render/*`, or any file under `webui/test/` — none of them read CSS values, and their class names/IDs are reused exactly as they exist today.
- No layout/structural changes: same 3-column `main` grid, same component placement, same HTML markup in `index.html`.
- Radius is binary only — `--radius: 0` for containers/surfaces, `--radius-full: 999px` for clickable controls. No in-between radius values anywhere in the file.
- Every token must be a real value already present in the current file (or an explicit, called-out consolidation of two near-duplicate one-off values) — no newly invented colors.

---

## Before You Start

Read `docs/superpowers/specs/2026-08-10-youtube-to-playlist-video-gui-tokens-design.md` for the full rationale. The one file this plan touches is `examples/media-processing/youtube-to-playlist-video/webui/app.css` — every task below rewrites it in place; there is no separate "create" step.

**How to visually verify a task:** `index.html` loads `app.js` as
`<script type="module">`, and Chromium (and most browsers) refuse to fetch
a same-directory module over `file://` — it fails with a CORS console
error and the app never boots (empty page, no tracks, no fields). Serve
the directory over plain HTTP instead, no build step required:

```bash
cd examples/media-processing/youtube-to-playlist-video/webui
python -m http.server 8765
```

then open `http://localhost:8765/index.html`. The editor boots with one
blank track by default (`app.js`'s `if (!load()) addTrack();`), so the
field editor, track list, settings bar, and preview iframe
(`webui/render/animation-waveform.html`, loaded via a relative `src`) are
all live without `model-compose up` running. Check: settings bar, track
list + add-track button, field editor (text/url/color/image rows), status
bar (trigger it by clicking Render with an empty URL — it shows the
validation message without needing the real backend).

**How to sanity-check nothing broke:** with the same server running, open
`http://localhost:8765/test.html` (this file also loads a `type="module"`
script, so it needs the HTTP server too — `file://` fails here the same
way). It runs the existing JS test suite (`webui/test/run.js`) inline —
look for `PASS` on every line, `0 failed` in the page. This suite never
reads `app.css` (`test.html` doesn't even link it), so it isn't expected to
catch anything CSS-related — it's a cheap gate against having accidentally
broken markup/IDs while checking the CSS.

---

### Task 1: Color + typography tokens

**Files:**
- Modify: `examples/media-processing/youtube-to-playlist-video/webui/app.css` (entire file)

**Interfaces:**
- Produces: `--bg`, `--bg-elevated`, `--bg-sunken`, `--bg-inset`, `--border`, `--border-subtle`, `--text`, `--text-secondary`, `--text-muted`, `--text-dim`, `--accent`, `--warning`, `--link`, `--text-sm`, `--text-base`, `--text-lg` custom properties on `:root` — every later task builds on these names.

Two intentional consolidations happen in this task (both are literal-value unifications the spec calls for, not new colors):
- `.track-thumb`'s background (`#26282d`) and `.field-thumb`'s background (`#23252a`) become the single `--bg-inset` token (value `#23252a`) — both are the same "thumbnail placeholder" role, and the two values were an inch apart by drift, not by design.
- `#add-track`'s dashed border color (`#3a3d43`) becomes `--border` (`#33353a`, already used everywhere else for a 1px border) — the dash pattern still reads as visually distinct from a solid border, so the near-identical color no longer needs its own one-off value.
- `#status`'s `font-size: 13px` — the only value in the whole file that isn't 12/14/16 — rounds up to `--text-base` (14px).

- [ ] **Step 1: Replace the full contents of `app.css`**

```css
:root {
  color-scheme: dark;

  --bg: #16171a;
  --bg-elevated: #1d1e22;
  --bg-sunken: #1b1c20;
  --bg-inset: #23252a;
  --border: #33353a;
  --border-subtle: #2a2c31;
  --text: #e8e8ea;
  --text-secondary: #c8ccd1;
  --text-muted: #9aa0a6;
  --text-dim: #7f858c;
  --accent: #3b6cf6;
  --warning: #fbbf24;
  --link: #7aa2ff;

  --text-sm: 12px;
  --text-base: 14px;
  --text-lg: 16px;
}

body { margin: 0; font: var(--text-base)/1.5 system-ui, sans-serif; background: var(--bg); color: var(--text); }

.field { display: grid; grid-template-columns: 110px 1fr; gap: 12px; align-items: start; margin-bottom: 10px; }
.field-label { color: var(--text-muted); font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.06em;
  padding-top: 8px; }
.field-control { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; row-gap: 6px; min-width: 0; }
.field-control input[type="text"],
.field-control input[type="url"] { flex: 1 1 auto; min-width: 0; padding: 7px 10px; border: 1px solid var(--border);
  border-radius: 6px; background: var(--bg-elevated); color: inherit; font: inherit; }
.field-control input[type="color"] { flex: none; width: 38px; height: 30px; padding: 0; border: 1px solid var(--border);
  border-radius: 6px; background: none; }
.field-hex { flex: none; font: var(--text-sm) ui-monospace, monospace; color: var(--text-muted); }
.field-thumb { flex: none; width: 40px; height: 40px; object-fit: cover; border-radius: 6px; background: var(--bg-inset); }
.field-control input[type="file"] { flex: 1 1 100%; min-width: 0; max-width: 100%; overflow: hidden; }

.field-control.is-default input,
.field-control.is-default .field-hex { color: var(--text-dim); font-style: italic; }
.field-control.is-default input[type="color"] { opacity: 0.7; }

.field-revert { flex: none; width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer; font-size: var(--text-base); line-height: 1; }
.field-revert:disabled { opacity: 0.3; cursor: default; }

.preview { display: flex; align-items: center; justify-content: center; overflow: hidden;
  background: #000; border-radius: 10px; min-height: 320px; }
.preview-frame { border: 0; flex: 0 0 auto; transform-origin: center center; }

#settings { display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  padding: 12px 18px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-sunken); }
#settings label { display: flex; align-items: center; gap: 6px; font-size: var(--text-sm); color: var(--text-muted); }
#settings select, #settings input { padding: 5px 8px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-elevated); color: var(--text); font: inherit; }
#settings #bands { width: 64px; }
#render { margin-left: auto; padding: 7px 18px; border: 0; border-radius: 6px;
  background: var(--accent); color: #fff; font-weight: 600; cursor: pointer; }
.warning { color: var(--warning); font-size: var(--text-sm); }

main { display: grid; grid-template-columns: 240px 340px 1fr; gap: 18px; padding: 18px; align-items: start; }

#track-list { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.track { display: flex; align-items: center; gap: 10px; padding: 7px 9px; border-radius: 8px;
  background: var(--bg-elevated); border: 1px solid transparent; cursor: pointer; }
.track.is-selected { border-color: var(--accent); }
.track-thumb { width: 32px; height: 32px; object-fit: cover; border-radius: 5px; background: var(--bg-inset); }
.track-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.track-remove { border: 0; background: none; color: var(--text-dim); cursor: pointer; font-size: var(--text-lg); }
#add-track { width: 100%; padding: 7px; border: 1px dashed var(--border); border-radius: 8px;
  background: none; color: var(--text-muted); cursor: pointer; }

.empty { color: var(--text-dim); }
#status { padding: 10px 18px; border-top: 1px solid var(--border-subtle); background: var(--bg-sunken); font-size: var(--text-base); }
#preview { height: 60vh; }

.status-cancel { margin-left: 12px; padding: 3px 10px; border: 1px solid var(--border); border-radius: 5px;
  background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer; }
.status-cancel:disabled { opacity: 0.5; cursor: default; }
.status-video { display: block; margin-top: 10px; max-width: 480px; border-radius: 8px; }
#status a { color: var(--link); }
```

- [ ] **Step 2: Sanity-check the JS suite**

Open `http://localhost:8765/test.html`. Expected: every test still `PASS`,
`0 failed` — this task never touched markup or IDs.

- [ ] **Step 3: Visual check**

Open `http://localhost:8765/index.html` (server from "Before You Start").
Expected: **visually indistinguishable** from before this task — same colors, same spacing, same corners. The only
pixel-level differences are `#status`'s text going from 13px to 14px and
the two thumbnail-background/dashed-border consolidations above, all of
which should be imperceptible at a glance.

- [ ] **Step 4: Commit**

```bash
git add examples/media-processing/youtube-to-playlist-video/webui/app.css
git commit -m "Extract color and typography tokens in youtube-to-playlist-video webui"
```

---

### Task 2: Spacing tokens, with more breathing room

**Files:**
- Modify: `examples/media-processing/youtube-to-playlist-video/webui/app.css` (entire file)

**Interfaces:**
- Consumes: the color/typography tokens from Task 1 (`--bg-elevated`, `--border`, `--text-muted`, etc. — unchanged, just carried forward).
- Produces: `--space-1` (4px) through `--space-5` (24px) on `:root` — later tasks don't consume these directly, but any future spacing edit should reuse them instead of a new literal.

Only `padding`, `margin`, and `gap` map to the spacing scale — fixed
component dimensions (`.field-thumb`'s 40×40, `.field-revert`'s 28×28,
`.preview`'s `min-height: 320px`, `#settings #bands`'s 64px width) stay as
literal pixels, since they're sizes, not whitespace, and don't belong on a
spacing scale.

Per the approved design, this isn't just a token rename — every value
below moves up to (at least) the nearest scale step, giving the whole UI
more room than the current 5–18px spread. `#settings select/input`'s
padding also gets unified with `.field-control`'s text-input padding
(`5px 8px` → `--space-2 --space-3`, same as the field inputs already use)
rather than keeping its own slightly-tighter one-off value.

- [ ] **Step 1: Replace the full contents of `app.css`**

```css
:root {
  color-scheme: dark;

  --bg: #16171a;
  --bg-elevated: #1d1e22;
  --bg-sunken: #1b1c20;
  --bg-inset: #23252a;
  --border: #33353a;
  --border-subtle: #2a2c31;
  --text: #e8e8ea;
  --text-secondary: #c8ccd1;
  --text-muted: #9aa0a6;
  --text-dim: #7f858c;
  --accent: #3b6cf6;
  --warning: #fbbf24;
  --link: #7aa2ff;

  --text-sm: 12px;
  --text-base: 14px;
  --text-lg: 16px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
}

body { margin: 0; font: var(--text-base)/1.5 system-ui, sans-serif; background: var(--bg); color: var(--text); }

.field { display: grid; grid-template-columns: 110px 1fr; gap: var(--space-4); align-items: start; margin-bottom: var(--space-3); }
.field-label { color: var(--text-muted); font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.06em;
  padding-top: var(--space-2); }
.field-control { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; row-gap: var(--space-2); min-width: 0; }
.field-control input[type="text"],
.field-control input[type="url"] { flex: 1 1 auto; min-width: 0; padding: var(--space-2) var(--space-3); border: 1px solid var(--border);
  border-radius: 6px; background: var(--bg-elevated); color: inherit; font: inherit; }
.field-control input[type="color"] { flex: none; width: 38px; height: 30px; padding: 0; border: 1px solid var(--border);
  border-radius: 6px; background: none; }
.field-hex { flex: none; font: var(--text-sm) ui-monospace, monospace; color: var(--text-muted); }
.field-thumb { flex: none; width: 40px; height: 40px; object-fit: cover; border-radius: 6px; background: var(--bg-inset); }
.field-control input[type="file"] { flex: 1 1 100%; min-width: 0; max-width: 100%; overflow: hidden; }

.field-control.is-default input,
.field-control.is-default .field-hex { color: var(--text-dim); font-style: italic; }
.field-control.is-default input[type="color"] { opacity: 0.7; }

.field-revert { flex: none; width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer; font-size: var(--text-base); line-height: 1; }
.field-revert:disabled { opacity: 0.3; cursor: default; }

.preview { display: flex; align-items: center; justify-content: center; overflow: hidden;
  background: #000; border-radius: 10px; min-height: 320px; }
.preview-frame { border: 0; flex: 0 0 auto; transform-origin: center center; }

#settings { display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap;
  padding: var(--space-3) var(--space-5); border-bottom: 1px solid var(--border-subtle); background: var(--bg-sunken); }
#settings label { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); color: var(--text-muted); }
#settings select, #settings input { padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-elevated); color: var(--text); font: inherit; }
#settings #bands { width: 64px; }
#render { margin-left: auto; padding: var(--space-2) var(--space-5); border: 0; border-radius: 6px;
  background: var(--accent); color: #fff; font-weight: 600; cursor: pointer; }
.warning { color: var(--warning); font-size: var(--text-sm); }

main { display: grid; grid-template-columns: 240px 340px 1fr; gap: var(--space-5); padding: var(--space-5); align-items: start; }

#track-list { list-style: none; margin: 0 0 var(--space-3); padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.track { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: 8px;
  background: var(--bg-elevated); border: 1px solid transparent; cursor: pointer; }
.track.is-selected { border-color: var(--accent); }
.track-thumb { width: 32px; height: 32px; object-fit: cover; border-radius: 5px; background: var(--bg-inset); }
.track-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.track-remove { border: 0; background: none; color: var(--text-dim); cursor: pointer; font-size: var(--text-lg); }
#add-track { width: 100%; padding: var(--space-3); border: 1px dashed var(--border); border-radius: 8px;
  background: none; color: var(--text-muted); cursor: pointer; }

.empty { color: var(--text-dim); }
#status { padding: var(--space-3) var(--space-5); border-top: 1px solid var(--border-subtle); background: var(--bg-sunken); font-size: var(--text-base); }
#preview { height: 60vh; }

.status-cancel { margin-left: var(--space-3); padding: var(--space-1) var(--space-3); border: 1px solid var(--border); border-radius: 5px;
  background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer; }
.status-cancel:disabled { opacity: 0.5; cursor: default; }
.status-video { display: block; margin-top: var(--space-3); max-width: 480px; border-radius: 8px; }
#status a { color: var(--link); }
```

- [ ] **Step 2: Sanity-check the JS suite**

Open `http://localhost:8765/test.html`. Expected: every test still `PASS`.

- [ ] **Step 3: Visual check**

Open `http://localhost:8765/index.html`. Expected: a visibly roomier layout than Task 1's
snapshot — wider gutters around `main`'s three columns, more padding in
the settings bar/status bar/track rows/render button — but no column
reflow, no wrapping that wasn't already happening, no element overlapping
its neighbor. Resize the window narrow enough to trigger `.field-control`'s
existing wrap behavior and confirm it still wraps cleanly (the file-input
wrapping comment further down in the file explains why that behavior
matters and isn't touched by this task).

- [ ] **Step 4: Commit**

```bash
git add examples/media-processing/youtube-to-playlist-video/webui/app.css
git commit -m "Move youtube-to-playlist-video webui spacing onto a token scale"
```

---

### Task 3: Binary border-radius

**Files:**
- Modify: `examples/media-processing/youtube-to-playlist-video/webui/app.css` (entire file)

**Interfaces:**
- Consumes: tokens from Tasks 1–2 (carried forward unchanged).
- Produces: `--radius` (0) and `--radius-full` (999px) on `:root`.

Mapping (per the approved design — containers are sharp, clickable
controls are pill/circular):

| Selector | Radius |
|---|---|
| `.field-control input[type="text"/"url"/"color"]`, `.field-thumb`, `#settings select`/`#settings input`, `.preview`, `.track`, `.track-thumb`, `.status-video` | `--radius` (0) |
| `.field-revert`, `#render`, `#add-track`, `.status-cancel` | `--radius-full` |

`.track-remove` is deliberately **not** touched here even though it's a
clickable control — it has no background or padding to round yet (it's
bare text today), so assigning it a radius now would be an invisible
no-op. Task 4 adds both the padding/background affordance and the radius
together, since they only make sense as a pair.

- [ ] **Step 1: Replace the full contents of `app.css`**

```css
:root {
  color-scheme: dark;

  --bg: #16171a;
  --bg-elevated: #1d1e22;
  --bg-sunken: #1b1c20;
  --bg-inset: #23252a;
  --border: #33353a;
  --border-subtle: #2a2c31;
  --text: #e8e8ea;
  --text-secondary: #c8ccd1;
  --text-muted: #9aa0a6;
  --text-dim: #7f858c;
  --accent: #3b6cf6;
  --warning: #fbbf24;
  --link: #7aa2ff;

  --text-sm: 12px;
  --text-base: 14px;
  --text-lg: 16px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;

  --radius: 0;
  --radius-full: 999px;
}

body { margin: 0; font: var(--text-base)/1.5 system-ui, sans-serif; background: var(--bg); color: var(--text); }

.field { display: grid; grid-template-columns: 110px 1fr; gap: var(--space-4); align-items: start; margin-bottom: var(--space-3); }
.field-label { color: var(--text-muted); font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.06em;
  padding-top: var(--space-2); }
.field-control { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; row-gap: var(--space-2); min-width: 0; }
.field-control input[type="text"],
.field-control input[type="url"] { flex: 1 1 auto; min-width: 0; padding: var(--space-2) var(--space-3); border: 1px solid var(--border);
  border-radius: var(--radius); background: var(--bg-elevated); color: inherit; font: inherit; }
.field-control input[type="color"] { flex: none; width: 38px; height: 30px; padding: 0; border: 1px solid var(--border);
  border-radius: var(--radius); background: none; }
.field-hex { flex: none; font: var(--text-sm) ui-monospace, monospace; color: var(--text-muted); }
.field-thumb { flex: none; width: 40px; height: 40px; object-fit: cover; border-radius: var(--radius); background: var(--bg-inset); }
.field-control input[type="file"] { flex: 1 1 100%; min-width: 0; max-width: 100%; overflow: hidden; }

.field-control.is-default input,
.field-control.is-default .field-hex { color: var(--text-dim); font-style: italic; }
.field-control.is-default input[type="color"] { opacity: 0.7; }

.field-revert { flex: none; width: 28px; height: 28px; border: 1px solid var(--border); border-radius: var(--radius-full);
  background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer; font-size: var(--text-base); line-height: 1; }
.field-revert:disabled { opacity: 0.3; cursor: default; }

.preview { display: flex; align-items: center; justify-content: center; overflow: hidden;
  background: #000; border-radius: var(--radius); min-height: 320px; }
.preview-frame { border: 0; flex: 0 0 auto; transform-origin: center center; }

#settings { display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap;
  padding: var(--space-3) var(--space-5); border-bottom: 1px solid var(--border-subtle); background: var(--bg-sunken); }
#settings label { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); color: var(--text-muted); }
#settings select, #settings input { padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--bg-elevated); color: var(--text); font: inherit; }
#settings #bands { width: 64px; }
#render { margin-left: auto; padding: var(--space-2) var(--space-5); border: 0; border-radius: var(--radius-full);
  background: var(--accent); color: #fff; font-weight: 600; cursor: pointer; }
.warning { color: var(--warning); font-size: var(--text-sm); }

main { display: grid; grid-template-columns: 240px 340px 1fr; gap: var(--space-5); padding: var(--space-5); align-items: start; }

#track-list { list-style: none; margin: 0 0 var(--space-3); padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.track { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius);
  background: var(--bg-elevated); border: 1px solid transparent; cursor: pointer; }
.track.is-selected { border-color: var(--accent); }
.track-thumb { width: 32px; height: 32px; object-fit: cover; border-radius: var(--radius); background: var(--bg-inset); }
.track-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.track-remove { border: 0; background: none; color: var(--text-dim); cursor: pointer; font-size: var(--text-lg); }
#add-track { width: 100%; padding: var(--space-3); border: 1px dashed var(--border); border-radius: var(--radius-full);
  background: none; color: var(--text-muted); cursor: pointer; }

.empty { color: var(--text-dim); }
#status { padding: var(--space-3) var(--space-5); border-top: 1px solid var(--border-subtle); background: var(--bg-sunken); font-size: var(--text-base); }
#preview { height: 60vh; }

.status-cancel { margin-left: var(--space-3); padding: var(--space-1) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-full);
  background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer; }
.status-cancel:disabled { opacity: 0.5; cursor: default; }
.status-video { display: block; margin-top: var(--space-3); max-width: 480px; border-radius: var(--radius); }
#status a { color: var(--link); }
```

- [ ] **Step 2: Sanity-check the JS suite**

Open `http://localhost:8765/test.html`. Expected: every test still `PASS`.

- [ ] **Step 3: Visual check**

Open `http://localhost:8765/index.html`. Expected: inputs, the track list, the preview
frame, and thumbnails now have square corners; the Render button, the
field-revert (`↺`) button, the Cancel button (trigger it by starting a
render against a fake/incomplete URL — or just eyeball its CSS, since
`.status-cancel` only appears mid-render), and the dashed "+ Add track"
button are now fully rounded (pill/circular). Nothing else changed from
Task 2's spacing.

- [ ] **Step 4: Commit**

```bash
git add examples/media-processing/youtube-to-playlist-video/webui/app.css
git commit -m "Switch youtube-to-playlist-video webui to a binary radius system"
```

---

### Task 4: Minimal hover and focus-visible states

**Files:**
- Modify: `examples/media-processing/youtube-to-playlist-video/webui/app.css` (entire file)

**Interfaces:**
- Consumes: all tokens from Tasks 1–3 (carried forward unchanged).
- Produces: nothing new consumed elsewhere — this is the final task.

Three changes, matching the approved design:

1. A single `:focus-visible` rule replaces the browser's default focus
   ring everywhere a keyboard user can land: `button`, `a`, `input`,
   `select`, `.track` (the track rows are `<li>` with a click handler, not
   real buttons, so they need `tabindex`... **not** added here — `.track`
   currently has no `tabindex` and isn't keyboard-focusable at all; adding
   keyboard interaction to it is a behavior change outside this plan's
   scope, so `.track` is dropped from the `:focus-visible` selector below.
   Everything else in the mapping (`button`, `a`, `input`, `select`) *is*
   already natively focusable, so the rule still covers every real
   keyboard-reachable control in the editor).
2. Hover backgrounds on every clickable control, via `color-mix()` against
   that control's own base color — one subtle step lighter (or, for
   `.track-remove`/`#add-track`, a faint tint since their base is
   transparent). No color or border changes on hover, per the approved
   design.
3. `.track.is-selected` switches from a colored border to a background
   tint (`color-mix(in srgb, var(--accent) 18%, var(--bg-elevated))`),
   consistent with de-emphasizing borders as state signals generally.
   `.track`'s now-unused `border: 1px solid transparent` is dropped.
4. `.track-remove` gains the padding + `--radius-full` it didn't get in
   Task 3, together with its hover background — see Task 3's note on why
   these are bundled here instead.

- [ ] **Step 1: Replace the full contents of `app.css`**

```css
:root {
  color-scheme: dark;

  --bg: #16171a;
  --bg-elevated: #1d1e22;
  --bg-sunken: #1b1c20;
  --bg-inset: #23252a;
  --border: #33353a;
  --border-subtle: #2a2c31;
  --text: #e8e8ea;
  --text-secondary: #c8ccd1;
  --text-muted: #9aa0a6;
  --text-dim: #7f858c;
  --accent: #3b6cf6;
  --warning: #fbbf24;
  --link: #7aa2ff;

  --text-sm: 12px;
  --text-base: 14px;
  --text-lg: 16px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;

  --radius: 0;
  --radius-full: 999px;
}

body { margin: 0; font: var(--text-base)/1.5 system-ui, sans-serif; background: var(--bg); color: var(--text); }

:is(button, a, input, select):focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: 2px;
}

.field { display: grid; grid-template-columns: 110px 1fr; gap: var(--space-4); align-items: start; margin-bottom: var(--space-3); }
.field-label { color: var(--text-muted); font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.06em;
  padding-top: var(--space-2); }
.field-control { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; row-gap: var(--space-2); min-width: 0; }
.field-control input[type="text"],
.field-control input[type="url"] { flex: 1 1 auto; min-width: 0; padding: var(--space-2) var(--space-3); border: 1px solid var(--border);
  border-radius: var(--radius); background: var(--bg-elevated); color: inherit; font: inherit; }
.field-control input[type="color"] { flex: none; width: 38px; height: 30px; padding: 0; border: 1px solid var(--border);
  border-radius: var(--radius); background: none; }
.field-hex { flex: none; font: var(--text-sm) ui-monospace, monospace; color: var(--text-muted); }
.field-thumb { flex: none; width: 40px; height: 40px; object-fit: cover; border-radius: var(--radius); background: var(--bg-inset); }
.field-control input[type="file"] { flex: 1 1 100%; min-width: 0; max-width: 100%; overflow: hidden; }

.field-control.is-default input,
.field-control.is-default .field-hex { color: var(--text-dim); font-style: italic; }
.field-control.is-default input[type="color"] { opacity: 0.7; }

.field-revert { flex: none; width: 28px; height: 28px; border: 1px solid var(--border); border-radius: var(--radius-full);
  background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer; font-size: var(--text-base); line-height: 1; }
.field-revert:hover:not(:disabled) { background: color-mix(in srgb, var(--bg-elevated) 85%, white); }
.field-revert:disabled { opacity: 0.3; cursor: default; }

.preview { display: flex; align-items: center; justify-content: center; overflow: hidden;
  background: #000; border-radius: var(--radius); min-height: 320px; }
.preview-frame { border: 0; flex: 0 0 auto; transform-origin: center center; }

#settings { display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap;
  padding: var(--space-3) var(--space-5); border-bottom: 1px solid var(--border-subtle); background: var(--bg-sunken); }
#settings label { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); color: var(--text-muted); }
#settings select, #settings input { padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--bg-elevated); color: var(--text); font: inherit; }
#settings #bands { width: 64px; }
#render { margin-left: auto; padding: var(--space-2) var(--space-5); border: 0; border-radius: var(--radius-full);
  background: var(--accent); color: #fff; font-weight: 600; cursor: pointer; }
#render:hover { background: color-mix(in srgb, var(--accent) 85%, white); }
.warning { color: var(--warning); font-size: var(--text-sm); }

main { display: grid; grid-template-columns: 240px 340px 1fr; gap: var(--space-5); padding: var(--space-5); align-items: start; }

#track-list { list-style: none; margin: 0 0 var(--space-3); padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.track { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius);
  background: var(--bg-elevated); cursor: pointer; }
.track:not(.is-selected):hover { background: color-mix(in srgb, var(--bg-elevated) 90%, white); }
.track.is-selected { background: color-mix(in srgb, var(--accent) 18%, var(--bg-elevated)); }
.track-thumb { width: 32px; height: 32px; object-fit: cover; border-radius: var(--radius); background: var(--bg-inset); }
.track-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.track-remove { border: 0; background: none; padding: var(--space-1) var(--space-2); border-radius: var(--radius-full);
  color: var(--text-dim); cursor: pointer; font-size: var(--text-lg); }
.track-remove:hover { background: color-mix(in srgb, var(--text-dim) 15%, transparent); }
#add-track { width: 100%; padding: var(--space-3); border: 1px dashed var(--border); border-radius: var(--radius-full);
  background: none; color: var(--text-muted); cursor: pointer; }
#add-track:hover { background: color-mix(in srgb, var(--text-muted) 10%, transparent); }

.empty { color: var(--text-dim); }
#status { padding: var(--space-3) var(--space-5); border-top: 1px solid var(--border-subtle); background: var(--bg-sunken); font-size: var(--text-base); }
#preview { height: 60vh; }

.status-cancel { margin-left: var(--space-3); padding: var(--space-1) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-full);
  background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer; }
.status-cancel:hover:not(:disabled) { background: color-mix(in srgb, var(--bg-elevated) 85%, white); }
.status-cancel:disabled { opacity: 0.5; cursor: default; }
.status-video { display: block; margin-top: var(--space-3); max-width: 480px; border-radius: var(--radius); }
#status a { color: var(--link); }
```

- [ ] **Step 2: Sanity-check the JS suite**

Open `http://localhost:8765/test.html`. Expected: every test still `PASS`.

- [ ] **Step 3: Visual check**

Open `http://localhost:8765/index.html`.

- Tab through the page with the keyboard: every input, the Render button,
  the `↺` revert buttons, and (once a track exists) any focusable control
  inside the track list shows the new thin accent outline instead of the
  browser's default ring.
- Hover the Render button, a `↺` revert button, the `+ Add track` button,
  and a track row: each shows a subtle background shift, nothing else
  moves or changes color.
- Click a track in the list (add a second one first via `+ Add track` so
  there's a non-selected row to compare against): the selected row now
  reads via a tinted background rather than a border, and clicking between
  rows swaps the tint correctly with no leftover border artifact.
- Hover the `×` remove button on a track row: it now shows a small round
  hover background around the glyph instead of just changing nothing.

- [ ] **Step 4: Commit**

```bash
git add examples/media-processing/youtube-to-playlist-video/webui/app.css
git commit -m "Add minimal hover and focus-visible states to youtube-to-playlist-video webui"
```
