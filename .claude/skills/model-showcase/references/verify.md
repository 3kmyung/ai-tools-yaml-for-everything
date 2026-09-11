# verify.md

Step 5 (fast loop) and step 6 (real run, the second human gate).

## Two verification loops

| Loop | Verifies | Mechanism | Cost |
|---|---|---|---|
| Fast, run dozens of times | generated `ui/` code, layout, accessibility, responsiveness | `assets/ui-check.mjs` against `ui/test.html` and a fixture, headless Chrome, no model | seconds |
| Slow, run once or twice | compose wiring, the real model, the real schema | `model-compose up` with real input | tens of minutes |

Run the fast loop after every regeneration in step 4, before ever reaching step 6. The
fast loop needs no GPU and no downloaded weights, so there is no reason to skip it on the
way to the slow loop.

## The fast loop

1. Copy `assets/test.html` and `assets/checks.js` from this skill's `assets/` into the
   generated example's `ui/`.
2. Write `ui/fixture.json` matching the workflow's output shape — see the fixture
   lifecycle below.
3. Run, from the example's `ui/` directory:

   ```
   node assets/ui-check.mjs <example>/ui --width=1440 --height=900
   node assets/ui-check.mjs <example>/ui --width=800 --height=900
   node assets/ui-check.mjs <example>/ui --width=390 --height=844
   ```

   The harness's own flags take the `=` form (`--width=1440`, not `--width 1440`); pass
   them that way. `assets/ui-check.mjs` copies `test.html` and `checks.js` into the target
   `ui/` itself, starts `assets/serve.mjs`, and runs headless Chrome with `--dump-dom`
   against `test.html`, printing one `PASS`/`FAIL` line per check.
4. Capture a screenshot at each of the three widths by adding `--screenshot=<path>`,
   which switches Chrome to load `index.html` directly instead of `test.html`. Look at
   all three: the narrowest one is the one most likely to have never been looked at.
5. Self-critique the screenshots against `ui-house-style`'s checklist before treating the
   iteration as done.

`node`'s http.server equivalent is deliberately not Python's `http.server` here:
`assets/serve.mjs` exists because Python serves `.js` with a MIME type that blocks ES
module loading, and a Node static server with correct types does not.

## The checks every generated example must pass

`assets/checks.js` is the current, versioned source of truth for what `CHECKS` contains —
read it directly rather than reconstructing the list from any single task's code block,
including this one. As of this writing it groups into:

- **Contrast.** `--accent-text` against `--background` at 4.5:1; the primary action
  button's rendered text against its rendered fill at 4.5:1; instructional text (`#hint`)
  does not fall back to `--disabled`'s contrast; `--link` resolves to the same colour as
  `--accent-text`; no text rule in `components.css` paints with `--accent` directly.
- **Focus.** `base.css` declares a default `:focus-visible` ring (`2px solid`, `-2px`
  offset, coloured `--accent`); no rule turns an outline off without a replacement
  indicator in the same declaration.
- **Motion.** `base.css` collapses `transition-duration` and `animation-duration` under
  `prefers-reduced-motion`, with `!important` on both.
- **Component hygiene.** `components.css` carries no ID selectors and no domain nouns;
  the fixed component vocabulary (`.action-primary`, `.action-add`, `.action-cancel`,
  `.action-resume`, `.caption-warning`, `.status-message`, `.item`, `.item-label`,
  `.item-remove`) is present.
- **Responsive.** no sideways scroll at the current width; `main` is single-column below
  900px; `.field-body` is container-queried.
- **Icons.** every entry in `ICONS` keeps Lucide's 24-unit `viewBox`; a rendered icon is
  16px wide with `aria-hidden="true"`.

**Adapt the domain-noun list on every copy.** The regex behind "carries no domain nouns"
and any element-specific check such as the primary-action contrast check are written
against the previous example's own vocabulary. Copying `checks.js` into a new example
without updating that word list to the new example's domain nouns does not fail loudly —
it passes, silently, because the pattern never matches anything in the new file. That is
exactly the failure mode the next rule names.

## Two rules about checks

**A check that cannot distinguish "the thing I measure is absent" from "the thing I
measure is fine" is worse than no check.** A check that greps for a forbidden word and
finds none because the file does not exist yet, or because the selector it queries is not
on the page, reports the same `PASS` as a check that found the file and confirmed the
word is truly absent from it. Write every check so a missing target — a missing element,
an empty stylesheet, an unmatched selector — is its own reported failure, not a silent
pass.

**A check whose red state has never been observed is not yet a check.** Writing an
assertion is not the same as knowing it can fail. Before trusting any new entry in
`CHECKS`, break the thing it is supposed to catch on purpose — add the banned ID selector
back, remove the focus ring, use the wrong contrast — and confirm the check actually turns
red. A check that has only ever been seen passing might be checking nothing.

**When a check and the thing it checks disagree, say so and decide in the open.** If a
check fails and the honest fix is to change the UI, change the UI. If the check itself is
wrong — testing the wrong selector, the wrong ratio, a rule that no longer applies — say
that plainly and fix the check. Do not adjust prose or markup just to make a checker stop
complaining without deciding, out loud, which of the two was actually wrong.

## The fixture lifecycle

The fixture is hand-written from the model card's own example output on the first pass —
step 1's research, not invention. It is what makes the fast loop possible before any
model has been downloaded or run.

After step 6's real run produces real output, replace the hand-written fixture with one
saved from that real run. From that point on, the fast loop renders real data, and any
schema ambiguity research step 1 could not resolve (see `compose.md`'s fixture adapter)
is settled by what the real run actually produced — the fixture no longer waits for step
6 to be believed; it is step 6.

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
