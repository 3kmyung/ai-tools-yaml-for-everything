---
name: ui-house-style
description: Use when writing any web UI for a model-compose example — supplies the house design tokens, layout skeleton, component vocabulary, and the bans that keep generated frontends from defaulting to generic AI styling.
---

# ui-house-style

The house style is extracted from
`examples/media-processing/youtube-to-playlist-video/ui/`. That directory is the source
of truth; the rules here exist so a generated UI matches it without copying it file for
file. Rules live in `references/`, read on demand — do not load all of them up front.

## Process

1. **Tokens** — read `references/tokens.md`, lay down `base.css` unchanged. Do not
   invent a colour or a spacing/type/radius/duration value outside its scale.
2. **Layout** — decide batch or streaming before choosing a layout; the two produce
   different skeletons. Then decide what the list is and what the workspace is for this
   example, and map that decision onto the three-region skeleton in `references/layout.md`.
3. **Components** — assemble the screen from `references/components.md` first. Write a
   new widget only when no existing one fits.
4. **Self-critique** — re-read the written code against the checklist below. Fix anything
   it catches before calling the screen done.

## Reference files

| File | Read it when |
|---|---|
| `references/tokens.md` | laying down `base.css`, or choosing any colour, spacing, radius, or duration value |
| `references/layout.md` | building the page skeleton, the list/workspace split, or a scrolling region |
| `references/components.md` | assembling a dropdown, field, button, list item, popover, or status bar |
| `references/css-patterns.md` | writing any CSS rule — elevation, state, focus, motion, or responsiveness |
| `references/js-patterns.md` | writing any `.js` module for the UI |
| `references/streaming.md` | the model produces incremental output or consumes live input, not a batch one |

## Self-critique checklist

- Invented a new colour instead of using a token from `tokens.md`?
- Used `box-shadow` anywhere?
- Toggled visual state from JavaScript instead of a CSS selector reading the DOM?
- Styled anything in `components.css` by ID, or named a class after this example's
  domain instead of its role?
- Left a comment in any file?
- Skipped a focus-visible indicator, or removed one without supplying a replacement in
  the same declaration?
- Ignored `prefers-reduced-motion` on a transition or animation that is not scroll-driven?
- Hand-drawn icon path data instead of copying it from Lucide?
