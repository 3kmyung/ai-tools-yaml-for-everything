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
   node .claude/skills/build-model-release/assets/ui-check.mjs <example>/ui --width=1440 --height=900
   node .claude/skills/build-model-release/assets/ui-check.mjs <example>/ui --width=800 --height=900
   node .claude/skills/build-model-release/assets/ui-check.mjs <example>/ui --width=390 --height=844
   ```

   The harness's own flags take the `=` form (`--width=1440`, not `--width 1440`).
   `assets/ui-check.mjs` copies `test.html` and `checks.js` into the target `ui/` itself
   on every run, starts `assets/serve.mjs`, and runs headless Chrome with `--dump-dom`
   against `test.html`. `test.html` imports the portable `CHECKS` from the just-copied
   `checks.js`, then fetches that example's own tracked `ui/checks.local.js` and merges
   its `CHECKS` in before running the combined list — printing one `info` line stating how
   many per-example checks it found (zero included, if the example carries no
   `checks.local.js`), then one `PASS`/`FAIL` line per check.
3. Capture a screenshot at each of the three widths by adding `--screenshot=<path>`,
   which switches Chrome to load `index.html` directly instead of `test.html`. Look at
   all three — the narrowest one is the one most likely to have never been looked at.
4. Self-critique the screenshots against `style-web-interface`'s checklist before treating the
   iteration as done.

`assets/serve.mjs` exists in place of Python's `http.server` because Python serves `.js`
with a MIME type that blocks ES module loading, and a Node static server with correct
types does not.

## The checks every generated example must pass

Two files hold the seventeen checks between them, and each has a different owner and a
different lifecycle.

`assets/checks.js` is the current, versioned source of truth for the eleven checks that
travel unchanged to every generated interface — read it directly rather than
reconstructing the list from any single task's code block, including this one.
`assets/ui-check.mjs` copies it over `ui/checks.js` on every invocation, so it is edited
only in the skill directory, never in the copy. It also exports the four helpers
(`contrast`, `requireTokenColor`, `stylesheetSource`, `escapeRegExp`) that a per-example
check needs, so `ui/checks.local.js` can import them from the sibling copy instead of
duplicating them.

| Group | Portable checks (`assets/checks.js`) |
|---|---|
| Contrast | `--accent-text` / `--text-caption` against `--background` and `--background-panel` at 4.5:1; `--link` resolves to the same colour as `--accent-text`; no text rule in `components.css` paints with `--accent` directly |
| Focus | `base.css` declares a default `:focus-visible` ring (`2px solid`, `-2px` offset, coloured `--accent`); no rule turns an outline off without a replacement indicator in the same declaration |
| Motion | `base.css` collapses `transition-duration` and `animation-duration` under `prefers-reduced-motion`, with `!important` on both |
| Component hygiene | `components.css` carries no ID selectors |
| Responsive | no sideways scroll at the current width; `main` is single-column below 900px |
| Icons | every entry in `ICONS` keeps Lucide's 24-unit `viewBox` |
| Harness | the rendered viewport is the width the harness asked for |

`ui/checks.local.js` is each example's own file, committed alongside its `index.html`,
`styles/` and `src/` — `ui-check.mjs` never writes it and never overwrites it. It holds
whichever of the remaining slots have a subject in that interface:

| Slot | What it checks | `youtube-to-playlist-video` | `speaker-diarization-vibevoice` |
|---|---|---|---|
| Primary-action contrast | the id'd primary action's rendered text against its rendered fill at 4.5:1 | `#render-playlist` | `#transcribe` |
| Instructional caption | `#hint` does not fall back to `--disabled`'s contrast | present | present |
| Domain nouns | `components.css` carries none of this interface's own domain words | `track\|playlist\|render` | `speaker\|transcript\|meeting` |
| Component vocabulary | the fixed classes this interface actually uses are present | `.action-primary`, `.action-add`, `.action-cancel`, `.action-resume`, `.caption-warning`, `.status-message`, `.item`, `.item-label`, `.item-remove` | `.action-primary`, `.action-cancel`, `.caption-warning`, `.status-message`, `.item`, `.item-label` |
| Field bodies | `.field-body` is container-queried | present | absent — no `.field`/`.field-body` construct, no entry in this file |

A blank cell above is not a vacuous check quietly passing — that interface's
`checks.local.js` simply carries no entry for that slot, and `test.html`'s `info` line
reports the resulting count (four for `speaker-diarization-vibevoice`, five for
`youtube-to-playlist-video`), so the absence is something the operator reads rather than
something that happens silently.

## The trap this split exists to close

`assets/ui-check.mjs` copies `assets/checks.js` over `ui/checks.js` unconditionally, on
every run. Before this split there was one shared file, so adapting `checks.js` for a new
interface meant editing the id literals, word lists and required classes that a previous
interface depended on — and the previous interface broke the next time anyone ran its own
fast loop, since the file it read back described someone else's UI. Splitting the file in
two only closes that trap if the per-example half is never named `checks.js`: give it any
name `ui-check.mjs` does not already copy over (`checks.local.js` here), and list it in
neither `.gitignore`'s copied-artifact block nor anywhere else that would stop it from
being committed. A per-example file that is generated instead of tracked, or that shares
`checks.js`'s name, silently reopens the exact bug this split fixes.

| # | Check | Lives in | Per interface |
|---|---|---|---|
| 1 | `--accent-text` / `--text-caption` contrast | `assets/checks.js` | identical everywhere |
| 2 | primary-action rendered-text contrast | `ui/checks.local.js` | id literal names that interface's own primary-action element |
| 3 | `--link` resolves to `--accent-text` | `assets/checks.js` | identical everywhere |
| 4 | no text rule paints with `--accent` | `assets/checks.js` | identical everywhere |
| 5 | `#hint` does not fall back to `--disabled` | `ui/checks.local.js` | id literal names that interface's own instructional-caption element; omitted from the file if none exists |
| 6 | `base.css` declares a default focus ring | `assets/checks.js` | identical everywhere |
| 7 | no rule removes the outline without a replacement | `assets/checks.js` | identical everywhere |
| 8 | `base.css` honours `prefers-reduced-motion` | `assets/checks.js` | identical everywhere |
| 9 | `components.css` carries no ID selectors | `assets/checks.js` | identical everywhere |
| 10 | `components.css` carries no domain nouns | `ui/checks.local.js` | banned word list is that interface's own domain nouns |
| 11 | the component vocabulary is present | `ui/checks.local.js` | required list trimmed to the roles that interface actually has; never rename or invent a replacement class — these are the design system's own fixed names, not domain nouns |
| 12 | no sideways scroll at the current width | `assets/checks.js` | identical everywhere |
| 13 | `main` is single-column below 900px | `assets/checks.js` | identical everywhere |
| 14 | field bodies are container-queried | `ui/checks.local.js` | omitted from the file if the interface has no `.field`/`.field-body` construct |
| 15 | icons keep Lucide's 24-unit `viewBox` | `assets/checks.js` | identical everywhere |
| 16 | a rendered icon is 16px with `aria-hidden` | `ui/checks.local.js`, when an interface has a dropdown | absent from both current examples' files — neither ships a dropdown whose selected option needs a check icon; a future interface with one adds this slot to its own file, not to `assets/checks.js` |
| 17 | the viewport is the width that was asked for | `assets/checks.js` | identical everywhere |

A per-example check whose named element, vocabulary or structure genuinely has no
counterpart in an interface is left out of that interface's `checks.local.js`, not kept
and rewritten so it vacuously passes. Both are how the suite stops meaning anything.

**Check 10's word list is derived by the same agent that just wrote the new interface's
`components.css`, not by a separate reviewer.** Read that file's own class names,
subtract every name already listed in `components.md`'s component vocabulary, and
whatever domain-specific stems remain are the new banned list. For
`speaker-diarization-vibevoice`'s file drop zone, speaker timeline and segment list, that list
is `speaker|transcript|meeting` in `ui/checks.local.js`, unrelated to
`youtube-to-playlist-video`'s own `track|playlist|render` in its own file.

**The field-bodies check has no surviving subject in a transcription interface.** A file
drop zone, a speaker timeline and a segment list are not editable metadata fields, so an
interface built from them has no `.field`/`.field-body` construct at all. Its subject is
absent, not merely relocated: the check is left out of that interface's
`checks.local.js`, not carried over and left failing, and not softened to pass when
`.field-body` is missing.

**The 16px-icon check has no surviving subject either, for the same reason, in an
interface with no dropdown.** The check calls `icon("check")` because a dropdown's
selected option is marked with a check icon — that is the only reason `ICONS` ever needs
an entry by that name. Neither current example's settings row needs a closed set of
options with a checked one, so neither file carries this slot.

**A scalar setting that is free text, not a closed set of options, is neither a dropdown
nor a `.field`.** A hotword list typed into the header belongs in `#settings` beside any
dropdowns the interface does have, styled by extending the existing `header .setting`
rule to cover an `input` child rather than by introducing a new component class or
reaching for `.field`, which the field-bodies check's own reasoning has already ruled out
for an interface with no editable metadata records.

## The ritual

Follow this, in order, whenever a newly generated interface needs its own checks:

1. Finish the new interface's `index.html`, `styles/`, and `src/` first. The checks
   describe a finished house style; they are not a spec to satisfy before the UI exists.
2. Create that example's own `ui/checks.local.js`. Import the shared helpers from
   `./checks.js` — the copy `ui-check.mjs` places beside it, not `assets/checks.js`
   directly, since that relative path is what will resolve once this file is served — and
   write one entry per row of the slot table above that has a subject in this interface:
   name checks 2 and 5's id literals after this interface's own elements; write check 10's
   word list from this interface's own class names; trim check 11's required list to the
   roles this interface actually has; leave check 14 out if the interface has no
   `.field-body`.
3. Leave `assets/checks.js` untouched — it holds only the eleven checks true for every
   interface, and editing it to fit one interface breaks every other example's own fast
   loop the next time someone runs it.
4. Run the fast loop (`ui-check.mjs` at all three widths). It copies the unchanged
   `assets/checks.js` into the target `ui/checks.js`; `test.html` then fetches this
   example's own `ui/checks.local.js` unchanged and merges it in, printing how many
   per-example checks it found before the `PASS`/`FAIL` lines.
5. For every red line still standing after step 2, decide in the open which of the two
   rules below applies: fix the interface if the interface is wrong, fix the check if it
   is the check that no longer applies and step 2 missed it. Never edit a check merely to
   change its color.
6. Before leaving a slot out of `checks.local.js`, confirm its element or workflow truly
   has no equivalent by rereading the new interface's own plan, not by the check's
   silence.

## Two rules about checks

**A check that cannot distinguish "the thing I measure is absent" from "the thing I
measure is fine" is worse than no check.** A missing element, an empty stylesheet, an
unmatched selector must each be its own reported failure, never a silent `PASS`.

**A check whose red state has never been observed is not yet a check.** Before trusting
any new entry in `CHECKS`, break the thing it is supposed to catch on purpose — add the
banned ID selector back, remove the focus ring, use the wrong contrast — and confirm the
check actually turns red.

The same rule applies one level up, to the file that carries the checks rather than to
one check inside it. A fast-loop run that cannot distinguish "this interface genuinely
has no per-example checks" from "`checks.local.js` was renamed or misspelled" is worse
than no reporting. `test.html` states the count of per-example checks it loaded — zero
included — as its own `info` line ahead of the `PASS`/`FAIL` lines, so a missing or
mistyped `ui/checks.local.js` reads as an explicit, visible zero rather than as a suite
that silently ran short.

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
example's own source; a fresh `build-model-release` run regenerates them from `assets/` and
from the researched output shape.

**`ui/checks.local.js` is never added to this list.** It is source, committed alongside
`index.html`, `styles/` and `src/` — `ui-check.mjs` reads it but never writes or
overwrites it, so ignoring it would delete the one place this interface's own checks
live. If the interface genuinely needs no per-example checks, the correct state is no
`checks.local.js` file at all, which `test.html`'s `info` line already reports as a
visible zero rather than needing a placeholder file or a `.gitignore` entry to explain
it.
