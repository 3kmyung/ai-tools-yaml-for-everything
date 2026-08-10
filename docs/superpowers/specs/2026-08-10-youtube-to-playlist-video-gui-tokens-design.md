# youtube-to-playlist-video webui: design tokens + minimal visual pass

## Context

`examples/media-processing/youtube-to-playlist-video/webui/app.css` is a
single 80-line stylesheet with no build step (plain `<link rel="stylesheet">`,
no PostCSS/Tailwind/bundler anywhere in the project). Colors, font sizes,
spacing, and border-radius values are all hardcoded inline and repeated
across selectors (e.g. `#33353a` appears 6 times, font sizes are 11/12/13/14/16px
with no consistent scale).

Goal: consolidate those repeated values into CSS custom properties, and use
that pass as the opportunity to make the UI read as more sleek/minimal —
without changing layout structure, HTML markup, or any JS behavior.

## Non-goals

- No Tailwind or any build tooling — stays a single hand-written CSS file,
  consistent with the rest of the project.
- No layout restructuring: the 3-column `main` grid (`240px 340px 1fr`),
  component placement, and HTML structure stay as they are.
- No new features or behavior changes. This is a pure visual/CSS pass.
- No changes to `webui/app.js`, `webui/fields.js`, `webui/preview.js`, or
  any file under `webui/render/` — none of them read CSS values, and their
  class names are reused as-is.

## Token design

All tokens live in a `:root` block at the top of `app.css`, replacing the
current bare `:root { color-scheme: dark; }`.

**Color** — existing palette values (already coherent) get named, not
reinvented: `--bg`, `--bg-elevated`, `--bg-sunken`, `--border`, `--text`,
`--text-muted`, `--accent`, `--warning`, plus `--link` (`#status a`'s color,
the one remaining value only ever used once).

**Typography** — the file only ever uses 12/13/14/16px, and 13px
(`#status`) is the sole outlier — everything else is already 12, 14, or 16.
Collapses to a 3-step scale: `--text-sm` (12px), `--text-base` (14px),
`--text-lg` (16px), with `#status` rounding 13px up to `--text-base`.

**Spacing** — a 5-step scale (`--space-1` 4px … `--space-5` 24px) that the
current padding/gap values (currently anywhere from 6px to 18px) round to.
Per the user's direction, values move up a notch rather than staying as
tight as they are today — the layout gets more breathing room, not just a
token rename.

**Radius** — binary, not a scale: `--radius: 0` and `--radius-full: 999px`.
Rule: containers/surfaces are sharp, clickable controls are pill/circular.

| Element | Radius |
|---|---|
| `.track`, field inputs (`.field-control input`, `select`), `.preview`, `#status`, thumbnails (`.track-thumb`, `.field-thumb`) | `--radius` (0) |
| `#render`, `.field-revert`, `.status-cancel`, `#add-track`, `.track-remove` | `--radius-full` |

## Interactive states

Currently there is no custom hover/focus styling anywhere — clickable
elements (`#render`, `.track`, `.field-revert`, `.status-cancel`,
`.track-remove`, `#add-track`) rely entirely on the browser's default focus
ring, and hovering does nothing. This pass adds minimal, consistent states:

- `:focus-visible` — a 1px `--accent` outline with a small offset, applied
  uniformly instead of the default UA ring. No glow/shadow.
- `:hover` on buttons/clickable rows — a single subtle background shift
  (one step toward `--bg-elevated`/lighter), no color or border change.
- `.track.is-selected`, which currently signals state via a colored border,
  switches to a background-tint (consistent with de-emphasizing borders
  generally) rather than stacking a border change on top of the new hover
  background.

## Scope

- `webui/app.css` — the entire token + visual pass.
- `webui/index.html` — touched only if `main`'s `grid-template-columns`/`gap`
  values need to move onto the new spacing scale; no structural/markup
  changes.

## Verification

Pure CSS change with no build step — verified by opening the editor
(`model-compose up`, then `http://localhost:8081`) and checking each
interactive element (track list, field editor, color pickers, render
button, status bar) in place. No automated test covers `app.css`
specifically (existing `webui/test/*.test.js` covers `app.js`/`fields.js`/
`preview.js` logic, not styling), so nothing new needs to pass beyond the
existing suite continuing to pass unmodified.
