---
description: Use when writing any web UI for a model-compose release — supplies the house design tokens, interaction and accessibility patterns, layout mechanisms, a component vocabulary, and the bans that keep generated frontends from defaulting to generic AI styling.
---

# style-web-interface

This skill is the source of truth for the house style. No shipped interface is — every
release follows these rules, and a release that disagrees with them is the one to fix.
Rules live in `references/`, read on demand — do not load all of them up front.

## Fixed and free

| Fixed in every UI | Free for each example |
|---|---|
| Tokens and their scales, `base.css` unchanged | Which regions the page has and how they are arranged |
| The bans and patterns in `css-patterns.md` and `js-patterns.md` | Where the primary action, settings and results live |
| Focus, selection and keyboard behaviour in `components.md` | Which components from `components.md` are used, and new widgets named by role |
| The scroll fade on any scroller, a collapsing footer if there is one, one column below 600px | Breakpoint widths above that, and whether there is a header or footer at all |
| A way to save every output the model produces | The file formats offered |

## Process

1. **Skeleton** — create `index.html`, `styles/`, and `src/` per the directory tree in
   `references/layout.md`'s "The directory the check suite hardcodes" section, with
   `base.css` linked before `components.css` and `layout.css`.
2. **Tokens** — read `references/tokens.md`, lay down `base.css` unchanged. Do not
   invent a colour or a spacing/type/radius/line-width/duration value outside its scale.
3. **Layout** — decide batch or streaming before choosing a layout; the two produce
   different layouts. Then design the arrangement this model's output needs, following
   `references/layout.md`'s "Choosing a layout". Its list-and-workspace pattern is one
   worked answer, not a template.
4. **Components** — reuse `references/components.md` where a piece fits. Write new
   widgets freely where none does, named by role, under the same tokens and patterns.
5. **Self-critique** — re-read the written code against the checklist below. Fix anything
   it catches before calling the screen done.

## Reference files

| File | Read it when |
|---|---|
| `references/tokens.md` | laying down `base.css`, or choosing any colour, spacing, radius, line width, or duration value |
| `references/layout.md` | choosing the page layout, a footer, a scrolling region, or breakpoints |
| `references/components.md` | assembling a dropdown, field, button, list item, popover, status bar, or download |
| `references/css-patterns.md` | writing any CSS rule — elevation, state, focus, motion, or responsiveness |
| `references/js-patterns.md` | writing any `.js` module for the UI |
| `references/streaming.md` | the model produces incremental output or consumes live input, not a batch one |

## Self-critique checklist

- Invented a new colour instead of using a token from `tokens.md`?
- Written a `border`, `outline`, or `outline-offset` width as a literal instead of
  `var(--border-width)`?
- Painted a category marker with anything but a `--category-*` token, or put one on text?
- Used `box-shadow` anywhere?
- Toggled visual state from JavaScript instead of a CSS selector reading the DOM?
- Styled anything in `components.css` by ID, or named a class after this example's
  domain instead of its role?
- Left a comment in any file?
- Skipped a focus-visible indicator, or removed one without supplying a replacement in
  the same declaration?
- Ignored `prefers-reduced-motion` on a transition or animation that is not scroll-driven?
- Hand-drawn icon path data instead of copying it from Lucide?
- Left an output the reader can see but not save?
- Copied the list-and-workspace layout for a model whose output does not fit it?

## `check-rules.mjs`

A maintenance tool for this skill, not a generation-time check. It validates the
reference files against each other — never against a generated or shipped interface,
whose own vocabulary and prose it has no way to judge:

```
node .claude/skills/style-web-interface/check-rules.mjs
```

Run it after editing any file in `references/`, before committing that edit.
