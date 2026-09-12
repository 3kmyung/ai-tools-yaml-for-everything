# streaming.md

Read this whenever the model produces incremental output or consumes live input — audio,
tokens, transcript lines, frames. Decide batch or streaming before opening `layout.md`: a
list that fills once and a list that keeps growing while the reader watches want
different skeletons, and the wrong one does not fail loudly, it just quietly picks up the
other file's assumptions.

Streaming is not one more component dropped into the fixed skeleton. It is a layout that
changes along a time axis, and the batch rules the rest of this house style assumes can
actively harm it: a `translate` entry animation that looks perfectly fine on a dozen items
rendered once induces motion sickness at ten arrivals a second — same code, same easing,
a failure that only exists at the higher rate. That difference in kind, not degree, is why
streaming gets its own document instead of a paragraph inside `css-patterns.md`.

Neither reference example in this repository streams, so nothing below was extracted from
a shipped stylesheet the way the other five files were — every rule here is reasoned from
platform primitives and the existing tokens, not checked against code that already works.
Treat a future streaming example that disagrees with a rule below as a reason to reopen
this file and say so, not as a mistake in the example to quietly fix.

## Output streaming

1. A growing list of arrivals gets a fixed-height container that scrolls inside itself —
   `overflow-y: auto`, `min-height: 0` — the same shape `#track-scroller` already uses.
   The page itself does not grow with every arrival.
2. Auto-scroll to the newest arrival only while the scroller is pinned to its bottom edge.
   The moment the reader scrolls up, tracking stops until they scroll back down
   themselves.
   ```
   ✗ Scrolling to the newest arrival on every update, regardless of where the reader has
     scrolled.
   → Track whether the scroller sits at its own bottom edge and auto-scroll only while
     pinned there.
   Why: a reader scrolled up to reread an earlier line made that choice on purpose;
   snapping them back down on the next arrival overrides a decision they just made, and
   is the single most common complaint about live chat and log interfaces.
   ```
   Reading `scrollTop`/`scrollHeight` to decide whether the scroller is pinned is not the
   scroll-event-listener pattern `css-patterns.md` bans. That ban is about a listener
   painting a visual effect — a mask, an offset — from scroll position on every scroll
   frame, which `animation-timeline: scroll(...)` now does with no listener at all.
   Deciding whether to auto-scroll is control flow evaluated once per arrival, not a
   paint evaluated once per scroll frame, and no scroll-timeline primitive can express
   "move the scroll position" in the first place — every one of them reads a position
   that has already settled. The two rules meet here without contradicting each other;
   `css-patterns.md` names the same exception where its own ban is stated.
3. Unconfirmed (partial) text — a word a transcription model has not yet finalized, a
   token still subject to revision — is `--text-caption`. Once confirmed it becomes
   `--text`. The colour change transitions on `--duration-fast`.
   ```
   ✗ A new token — `--pending`, `--partial` — to mark unconfirmed text.
   → `--text-caption`, the token `tokens.md` already reserves for secondary and
     provisional text.
   Why: "not yet settled" is exactly the meaning `--text-caption` already carries
   everywhere else in this house style; a second token for the same meaning duplicates a
   colour instead of reusing one.
   ```
4. No `translate` on item entry.
   ```
   ✗ A `translate` entry animation on each arriving item.
   → `@starting-style` animating `opacity` only.
   Why: translate reads as motion at batch rates and as noise at streaming rates — the
   opening paragraph's dozen-items-versus-ten-a-second example is this rule. Opacity has
   no direction for the reader's eye to track, so it does not compound as arrivals speed
   up.
   ```
   This is deliberately stricter than the footer's own reveal in `layout.md`, which pairs
   `opacity` with `translate: 0 100%`. That combination is fine there because the footer
   appears once per render, not once per arrival — a translate that can never repeat
   faster than an operation finishing has no rate to compound at. An item entering a
   streaming list has no such floor; the footer is the contrast that shows why one-off
   reveals get to keep translate and per-arrival ones do not.
5. A number that changes while the reader is looking at it — a timecode, a running
   counter — uses `font-variant-numeric: tabular-nums`, the property
   `.color-picker-readout` already sets.
   ```
   ✗ Leaving a live-updating number in the font's default proportional figures.
   → `font-variant-numeric: tabular-nums`.
   Why: proportional digits have different widths, so a counter that changes every tick
   reflows its own container on every tick. This is layout-shift prevention, not
   decoration — the number would be wrong to look different even if nobody found the
   jitter distracting.
   ```
6. No DOM write per chunk.
   ```
   ✗ Writing to the DOM once per incoming chunk — once per token, once per audio frame.
   → Buffer arrivals in a plain variable and flush the buffer to the DOM at most once a
     frame, inside a `requestAnimationFrame` callback.
   Why: a model or socket can emit chunks faster than the display repaints; a write per
   chunk spends layout work on frames the reader can never actually see as separate,
   which a single `requestAnimationFrame` flush does not.
   ```
7. The streaming region is `aria-live="polite"` with `aria-atomic="false"`. Each confirmed
   unit — a word, a line, a sentence — is added with `appendChild`, once, and never
   removed or rewritten; the in-flight partial renders elsewhere and never touches the
   live region's own children.
   ```
   ✗ Updating the live region's text on every partial revision, including the word still
     being finalized.
   → Append a unit once it is confirmed, with `appendChild`; let the partial render
     visually somewhere else without ever touching the live region's own children.
   Why: a screen reader announces every change made to a polite live region. Rewriting
   the same partial word several times a second before it settles makes the region
   unusable; announcing each confirmed unit once is what "polite" is for.
   ```
   `js-patterns.md`'s `replaceChildren` mandate does not reach this region.
   `replaceChildren` is for a region whose whole content changes at once, the way the
   status bar swaps a message for a video; this region only grows, so calling
   `replaceChildren` per chunk would rebuild — and re-announce — every unit already
   confirmed, exactly what the ban above exists to prevent.

   A model can revise text it already confirmed — live captioning does this routinely —
   and this house style does not let that revision reach back into the node that already
   announced it.
   ```
   ✗ Rewriting or removing an already-appended confirmed unit because the model revised
     its content.
   → Append the revision as its own new unit, marked as a correction in whatever way the
     screen fits (a leading "Correction:" span, a class the style sheet paints
     differently); the earlier unit stays exactly as it was announced.
   Why: an append-only region is predictable only because nothing already announced ever
   changes again. Mutating a past node reopens the two-source-of-truth problem
   `css-patterns.md` already bans JS class toggling for — here the second source of truth
   is a screen reader's own memory of what it already read aloud, which no code can
   revise after the fact.
   ```
8. Progress and cancellation reuse the existing `showProgress({ onCancel })` language
   already rendered into the footer by `status.js`. A streaming screen does not grow a
   second progress UI of its own.
   ```
   ✗ A dedicated progress bar or a second cancel button built for the streaming view.
   → Call the existing `showProgress({ onCancel })`, the same call `render-runner.js`
     already makes for a batch render.
   Why: the footer is already the one place progress and cancellation live; a second one
     on the same screen asks the reader to learn where "an operation is running and can
     be stopped" lives twice for the one underlying fact.
   ```

## Input streaming

9. Request microphone permission only from inside the click handler of the control that
   starts recording — immediately after a user gesture, never on page load or on mount.
   ```
   ✗ Calling `getUserMedia` on page load, or from any path not itself started by a click
     the browser can see.
   → Request it inside the record control's own click handler, at the moment the reader
     asks for it.
   Why: a permission prompt with no visible cause is the exact pattern browsers now
   throttle or bury behind an extra warning, and a reader who did nothing to trigger it
   has no idea what just asked for their microphone.
   ```
10. No red dot for recording state.
    ```
    ✗ A red dot, or a red-filled circle, to indicate that recording is active.
    → An `--accent` pulse, or a level meter driven by input volume.
    Why: red appears nowhere else in this palette. A red recording indicator would be the
    one place in the interface borrowing meaning from outside the token set instead of
    reusing `--accent`, which already means "active, engaged" everywhere else it appears.
    ```
11. A level meter is a `<div>` painted with tokens, not `<meter>`.
    ```
    ✗ The native `<meter>` element for an audio level indicator.
    → A plain `<div>` whose extent is set from script and painted through a custom
      property, the same mechanism `.color-picker-swatch` already uses for its own fill.
    Why: `<meter>` is chrome the browser draws itself; it cannot be restyled to the token
    palette and renders visibly differently across browsers. A div under this house
    style's own painting stays consistent everywhere the UI runs.
    ```
12. Stop changes the primary control's own label; it does not add a second button.
    ```
    ✗ A separate "Stop" button placed beside the existing record control.
    → Swap the one control's own `textContent` and behaviour in place — "Record" becomes
      "Stop" the way `.action-cancel` already swaps between "Cancel" and "Cancelling…".
    Why: `layout.md` gives the header's right edge exactly one action slot. A second
    button for the opposite phase of the same action asks for a slot the skeleton only
    budgeted once.
    ```
13. Play PCM audio through WebAudio, scheduling buffers on an `AudioContext`.
    ```
    ✗ Swapping an `<audio>` element's `src` for each incoming chunk of PCM audio.
    → Decode and schedule each chunk through WebAudio (`AudioContext`,
      `AudioBufferSourceNode`).
    Why: reassigning `src` restarts a new element load per chunk, which clicks, gaps, and
    re-buffers audio at every chunk boundary. WebAudio schedules buffers back-to-back on
    one audio graph with nothing to reload between them.
    ```

## Common

14. Every streaming-specific animation this file introduces — the `--accent` recording
    pulse, a blinking cursor on the in-flight partial — stops entirely under
    `prefers-reduced-motion`, through the same universal block `tokens.md` already
    carries. Once it stops, the state it was communicating has to still read from colour
    alone: a recording control that only pulsed to say "active" needs a solid `--accent`
    fallback, not silence with no state left to see.
