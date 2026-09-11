# report.md

The six sections a report needs, and the two where reports usually fail: section 4's
interpretation, and section 5's verbatim usage-scope quote.

## Structure

| Section | Carries |
|---|---|
| 1. One-line definition | what this model is |
| 2. What is different | one or two architectural points, with a diagram |
| 3. What was built | demo description, plus a screenshot or video |
| 4. Performance | the three-machine table with conditions, the accuracy figures, and the interpretation that connects them |
| 5. Limits | what it cannot do, what to watch for, licence and usage-scope constraints |
| 6. Links | the GitHub example path, the model card, the paper |

## Section 4 is not a bare table

```
✗ A performance table with no prose around it.
→ At least one interpretation sentence per table — for example, "the 4090 leads at RTF
  0.08, but the MacBook's 0.4 is still 2.5× real time, so a laptop is practical."
Why: a bare table goes unread. The sentence is what carries the result to a reader who
will not do the division themselves.
```

Section 4 states each accuracy figure with the harness that produced it and the
published figure it was checked against — `references/benchmark.md` has both. It does
not quote only the flattering row:

```
✗ Quoting only LibriSpeech's 2.20% WER and leaving AMI's 17.20% out of the body.
→ Put the worst published row in the body with its caveat when it is the demo's own
  domain — AMI's 17.20% for a meeting transcriber, not tucked into an appendix or left
  out.
Why: a model decoding diarisation and timestamps alongside words is not comparable on
WER alone to one that only transcribes, but omitting the row entirely because it is the
worst number is not honesty about that difference — it is just omission.
```

## Section 3's media, and a capture limitation to state rather than discover

`position: fixed` content — the house style's popover-based dropdown menu and colour
picker — does not paint in a headless capture even when it is genuinely open on screen.
Both `screenshot` and screencast capture render what the compositor paints for that
frame, and a fixed-position popover opened by the same automation that drives the
capture frequently is not in that frame. State this in section 3 rather than finding it
out mid-recording:

```
✗ Filming the demo video expecting an open dropdown or colour picker to appear in it.
→ Say in section 3 that a fixed-position popover will not appear open in a headless
  capture, and script the recording around states that do capture correctly — the
  dropdown closed, or its result already applied.
Why: this is a known property of headless capture against `position: fixed`, not a bug
in a particular recording. Reading it here costs nothing; finding it while filming costs
a reshoot.
```

## Section 5's usage-scope quote

```
✗ Summarising a usage-scope restriction in the report's own words — "the authors suggest
  caution before production use."
→ Quote the restriction verbatim, exactly as `model-showcase`'s research step recorded
  it in the research table.
Why: a permissive licence and an author writing "do not ship this without further
testing" are both true of the same model at once. A paraphrase can round the second one
away without anyone noticing it happened.
```

When the research table carries no usage-scope statement at all, section 5 says so
plainly rather than staying silent about the absence — an unchecked field and a checked,
clean field read identically to a reader unless the report distinguishes them.

## What does not belong in the report

Any figure without a stated source and a stated condition (precision, batch setting,
sample length) is left out rather than included with a caveat. A caveat on an
unsourced number still puts the number in front of a reader who may not read the
caveat; leaving it out entirely is the only version of this rule that actually works.
