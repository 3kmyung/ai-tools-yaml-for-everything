# verify.md

Step 5 (fast loop) and step 6 (real run, the second human gate).

## Two verification loops

| Loop | Verifies | Mechanism | Cost |
|---|---|---|---|
| Fast, run dozens of times | generated `ui/` code, layout, accessibility, responsiveness | `assets/ui-check.mjs` against `ui/test.html` and a fixture, headless Chrome, no model | seconds |
| Slow, run once or twice | compose wiring, the real model, the real schema | `model-compose up` with real input | tens of minutes |

Run the fast loop after every regeneration in step 4, before ever reaching step 6. It
needs no GPU and no downloaded weights, so there is no reason to skip it on the way to
the slow loop.

## The fast loop

1. Write `ui/fixture.json` matching the workflow's output shape — see the fixture
   lifecycle below.
2. Run, from the repository root:

   ```
   node .claude/skills/model-showcase/assets/ui-check.mjs <example>/ui --width=1440 --height=900
   node .claude/skills/model-showcase/assets/ui-check.mjs <example>/ui --width=800 --height=900
   node .claude/skills/model-showcase/assets/ui-check.mjs <example>/ui --width=390 --height=844
   ```

   The harness's own flags take the `=` form (`--width=1440`, not `--width 1440`).
   `assets/ui-check.mjs` copies `test.html` and `checks.js` into the target `ui/` itself,
   starts `assets/serve.mjs`, and runs headless Chrome with `--dump-dom` against
   `test.html`, printing one `PASS`/`FAIL` line per check.
3. Capture a screenshot at each of the three widths by adding `--screenshot=<path>`,
   which switches Chrome to load `index.html` directly instead of `test.html`. Look at
   all three — the narrowest one is the one most likely to have never been looked at.
4. Self-critique the screenshots against `ui-house-style`'s checklist before treating the
   iteration as done.

`assets/serve.mjs` exists in place of Python's `http.server` because Python serves `.js`
with a MIME type that blocks ES module loading, and a Node static server with correct
types does not.

## The checks every generated example must pass

`assets/checks.js` is the current, versioned source of truth for what `CHECKS`
contains — read it directly rather than reconstructing the list from any single task's
code block, including this one. As of this writing it groups into:

| Group | Checks |
|---|---|
| Contrast | `--accent-text` against `--background` at 4.5:1; the primary action button's rendered text against its rendered fill at 4.5:1; instructional text (`#hint`) does not fall back to `--disabled`'s contrast; `--link` resolves to the same colour as `--accent-text`; no text rule in `components.css` paints with `--accent` directly |
| Focus | `base.css` declares a default `:focus-visible` ring (`2px solid`, `-2px` offset, coloured `--accent`); no rule turns an outline off without a replacement indicator in the same declaration |
| Motion | `base.css` collapses `transition-duration` and `animation-duration` under `prefers-reduced-motion`, with `!important` on both |
| Component hygiene | `components.css` carries no ID selectors and no domain nouns; the fixed component vocabulary (`.action-primary`, `.action-add`, `.action-cancel`, `.action-resume`, `.caption-warning`, `.status-message`, `.item`, `.item-label`, `.item-remove`) is present |
| Responsive | no sideways scroll at the current width; `main` is single-column below 900px; `.field-body` is container-queried |
| Icons | every entry in `ICONS` keeps Lucide's 24-unit `viewBox`; a rendered icon is 16px wide with `aria-hidden="true"` |

## Portable checks versus this example's furniture

Every `CHECKS` entry was written against one interface — the playlist editor. Eleven of
the seventeen measure house style and travel unchanged to any generated interface. Six
name this example's own elements, vocabulary or structure and must be re-decided, in the
open, before the first run against a new one.

| # | Check | Portable | Adaptation for a new interface |
|---|---|---|---|
| 1 | `--accent-text` / `--text-caption` contrast | Portable | — |
| 2 | `#render-playlist` rendered-text contrast | Per-example | rename the id literal to the new interface's own primary-action element |
| 3 | `--link` resolves to `--accent-text` | Portable | — |
| 4 | no text rule paints with `--accent` | Portable | — |
| 5 | `#hint` does not fall back to `--disabled` | Per-example | rename the id literal to the new interface's own instructional-caption element if one exists; delete the check if it does not |
| 6 | `base.css` declares a default focus ring | Portable | — |
| 7 | no rule removes the outline without a replacement | Portable | — |
| 8 | `base.css` honours `prefers-reduced-motion` | Portable | — |
| 9 | `components.css` carries no ID selectors | Portable | — |
| 10 | `components.css` carries no domain nouns | Per-example | replace the banned word list with the new interface's own domain nouns |
| 11 | the component vocabulary is present | Per-example | drop any required class whose role this interface has no equivalent for; never rename or invent a replacement class — these are the design system's own fixed names, not domain nouns |
| 12 | no sideways scroll at the current width | Portable | — |
| 13 | `main` is single-column below 900px | Portable | — |
| 14 | field bodies are container-queried | Per-example | if the interface has no `.field`/`.field-body` construct at all, delete the check |
| 15 | icons keep Lucide's 24-unit `viewBox` | Portable | — |
| 16 | a rendered icon is 16px with `aria-hidden` | Per-example | delete if the interface has no dropdown at all — the check hardcodes `icon("check")`, and a `check` icon exists only to mark a dropdown's selected option; an interface with no dropdown has no reason to carry that entry in `ICONS` |
| 17 | the viewport is the width that was asked for | Portable | — |

A per-example check whose named element, vocabulary or structure genuinely has no
counterpart in the new interface is deleted from `CHECKS`, not left red and not rewritten
so it vacuously passes. Both are how the suite stops meaning anything.

**Edit `assets/checks.js` itself, never the copy inside an example's own `ui/`.**
`assets/ui-check.mjs` copies `assets/checks.js` into the target `ui/` unconditionally on
every invocation. An edit made only to `ui/checks.js` survives until the next fast-loop
run and is then silently overwritten. Adapt the five per-example checks in
`assets/checks.js` itself, right after writing the new interface's `components.css` and
before that interface's first fast-loop run.

**Check 10's word list is derived by the same agent that just wrote the new interface's
`components.css`, not by a separate reviewer.** Read that file's own class names,
subtract every name already listed in `components.md`'s component vocabulary, and
whatever domain-specific stems remain are the new banned list. For a transcription
interface with a file drop zone, a speaker timeline and a segment list, that list is
`speaker|segment|transcript` in place of `track|playlist|render`.

**Check 14 has no surviving subject in a transcription interface.** A file drop zone, a
speaker timeline and a segment list are not editable metadata fields, so an interface
built from them has no `.field`/`.field-body` construct at all. Its subject is absent,
not merely relocated: the check is deleted for this interface, not left failing and not
softened to pass when `.field-body` is missing.

**Check 16 has no surviving subject either, for the same reason, whenever the interface
has no dropdown.** The check calls `icon("check")` because a dropdown's selected option
is marked with a check icon — that is the only reason `ICONS` ever needs an entry by that
name. An interface with no settings dropdown at all (a file-drop transcription screen has
no scalar setting worth a closed set of options) has nothing for a check icon to mark, so
`ICONS.check` does not exist and the check is deleted, not left failing.

**A scalar setting that is free text, not a closed set of options, is neither a dropdown
nor a `.field`.** A hotword list typed into the header belongs in `#settings` beside any
dropdowns the interface does have, styled by extending the existing `header .setting`
rule to cover an `input` child rather than by introducing a new component class or
reaching for `.field`, which check 14's own reasoning has already ruled out for an
interface with no editable metadata records.

## The ritual

Follow this, in order, whenever `checks.js` is carried into a newly generated interface:

1. Finish the new interface's `index.html`, `styles/`, and `src/` first. The checks
   describe a finished house style; they are not a spec to satisfy before the UI exists.
2. Open `assets/checks.js` in the skill directory — not the copy under the new example's
   own `ui/` — and apply the table above: rename checks 2 and 5's id literals, or delete
   either one that has no counterpart; rewrite check 10's word list from the new
   interface's own class names; trim check 11's required list to the roles this interface
   actually has; delete check 14 if the interface has no `.field-body`.
3. Leave the twelve portable checks untouched.
4. Run the fast loop (`ui-check.mjs` at all three widths). It copies the just-edited
   `assets/checks.js` into the target `ui/` automatically.
5. For every red line still standing after step 2, decide in the open which of the two
   rules below applies: fix the interface if the interface is wrong, fix the check if it
   is the check that no longer applies and step 2 missed it. Never edit a check merely to
   change its color.
6. Before deleting a check, confirm its element or workflow truly has no equivalent by
   rereading the new interface's own plan, not by the check's silence.

## Two rules about checks

**A check that cannot distinguish "the thing I measure is absent" from "the thing I
measure is fine" is worse than no check.** A missing element, an empty stylesheet, an
unmatched selector must each be its own reported failure, never a silent `PASS`.

**A check whose red state has never been observed is not yet a check.** Before trusting
any new entry in `CHECKS`, break the thing it is supposed to catch on purpose — add the
banned ID selector back, remove the focus ring, use the wrong contrast — and confirm the
check actually turns red.

When a check and the thing it checks disagree, say so and decide in the open. If the
honest fix is to change the UI, change the UI; if the check itself is wrong — wrong
selector, wrong ratio, a rule that no longer applies — say that plainly and fix the check.
Never adjust prose or markup just to make a checker stop complaining without deciding,
out loud, which of the two was wrong.

## The fixture lifecycle

The fixture is hand-written from the model card's own example output on the first
pass — step 1's research, not invention. It is what makes the fast loop possible before
any model has been downloaded or run.

After step 6's real run produces real output, replace the hand-written fixture with one
saved from that real run. From that point on, the fast loop renders real data, and any
schema ambiguity step 1 could not resolve (see `compose.md`'s fixture adapter) is settled
by what the real run actually produced.

**`checks.js` never reads `fixture.json`.** Every check operates on static stylesheet
text or on DOM structure that exists whether or not the page has ever received real
output — the fixture makes screenshots worth looking at, not the pass/fail lines. Wire it
in through the same code path the page already needs for a real backend, not a
harness-only branch: on load, the page tries the real API (the schema fetch every
generated example already makes) and, only if that call fails — refused locally with no
`model-compose up` running, exactly the fast loop's own condition — fetches
`./fixture.json` and renders it through the same function a completed `run_workflow`
would call. Say so in the rendered page itself (a status line, not a silent
substitution), so nobody mistakes sample output for a real transcription. A query-string
flag the harness would have to know to pass is the wrong shape for this: the harness
never adds one, so a flag-gated fixture renders only in a screenshot nobody remembers to
open with the flag by hand.

## The Chrome rule

Every invocation is self-exiting: `--dump-dom` or `--screenshot`, always paired with
`--virtual-time-budget`, so Chrome renders, dumps or captures, and quits on its own.
`assets/ui-check.mjs` already does this — do not add a wrapper that waits and then kills
the process.

**Never kill Chrome by image name.** `taskkill /IM chrome.exe` or an equivalent closes
every Chrome window on the machine, including the person's own browser with their own
tabs. If a headless run ever hangs, the fix is a shorter `--virtual-time-budget` or a
process-specific kill by the PID the harness itself spawned — never a kill by name.

## `.gitignore`

Add to the generated example's `.gitignore`, alongside the existing `.output/` entry:

```
ui/test.html
ui/checks.js
ui/fixture.json
```

All three are copied or hand-written by this skill for the fast loop, not part of the
example's own source; a fresh `model-showcase` run regenerates them from `assets/` and
from the researched output shape.
