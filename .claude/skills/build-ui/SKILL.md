---
name: build-ui
description: Use when building or changing the web UI (`ui/`) of a model-compose release, or when the user says "UI 만들어", "웹 UI", "화면", "build the UI", "webui", "frontend".
---

# build-ui

This skill is the source of truth for the house style. No shipped interface is — every
release follows these rules, and a release that disagrees with them is the one to fix.
Rules live in `references/`, read on demand — do not load all of them up front.

## Inputs

| Input | Source |
|---|---|
| The workflow the UI calls | the finished `model-compose.yml` and its workflow `id` |
| The output shape | a workflow output saved from a real `model-compose up` run |

> **STOP — no saved real output, no UI.** Ask for it and stop. Never write a fixture from
> a model card, a README, or memory, and never research the model: a guessed shape plus
> a fallback adapter ships whichever guess was wrong.

## Fixed and free

| Fixed in every UI | Free for each example |
|---|---|
| Tokens and their scales, `base.css` unchanged | Which regions the page has and how they are arranged |
| The bans and patterns in `css-patterns.md` and `js-patterns.md` | Where the primary action, settings and results live |
| Focus, selection and keyboard behaviour in `components.md` | Which components from `components.md` are used, and new widgets named by role |
| The scroll fade on any scroller, a collapsing footer if there is one, one column below 600px | Breakpoint widths above that, and whether there is a header or footer at all |
| A way to save every output the model produces | The file formats offered |

## Process

1. **Demo angle** — unless the human already named one, present three candidate screens
   for what this output lets someone see. **STOP** until the human picks one.
2. **Skeleton** — create `index.html`, `styles/`, and `src/` per `references/layout.md`'s
   "The directory the check suite hardcodes", with `base.css` linked before
   `components.css` and `layout.css`. Copy `assets/websocket-client.js` into `ui/src/`
   byte for byte: it is the WebSocket protocol, not a design choice. Copy the saved real
   output to `ui/fixture.json`.
3. **Tokens** — read `references/tokens.md`, lay down `base.css` unchanged. Do not
   invent a colour or a spacing/type/radius/line-width/duration value outside its scale.
4. **Layout** — decide batch or streaming before choosing a layout; the two produce
   different layouts. Then design the arrangement this output needs, following
   `references/layout.md`'s "Choosing a layout". Its list-and-workspace pattern is one
   worked answer, not a template.
5. **Components** — reuse `references/components.md` where a piece fits. Write new
   widgets freely where none does, named by role, under the same tokens and patterns.
6. **Fast loop** — run `references/verify.md`'s checks and screenshots at three widths.
7. **Self-critique** — go through `references/self-critique.md`. Fix anything it catches
   before calling the screen done.

## Reference files

| File | Read it when |
|---|---|
| `references/tokens.md` | laying down `base.css`, or choosing any colour, spacing, radius, line width, or duration value |
| `references/layout.md` | choosing the page layout, a footer, a scrolling region, or breakpoints |
| `references/components.md` | assembling a dropdown, field, button, list item, popover, status bar, or download |
| `references/css-patterns.md` | writing any CSS rule — elevation, state, focus, motion, or responsiveness |
| `references/js-patterns.md` | writing any `.js` module for the UI |
| `references/streaming.md` | the model produces incremental output or consumes live input |
| `references/verify.md` | doing step 6, writing `ui/checks.local.js`, or wiring the fixture |

## Maintenance

A wrong screenshot or check is fixed in this skill, then `ui/` is regenerated whole —
hand-patching a generated UI measures the patch, not the skill.

After editing any file in `references/`, run `node .claude/skills/build-ui/check-rules.mjs`.
