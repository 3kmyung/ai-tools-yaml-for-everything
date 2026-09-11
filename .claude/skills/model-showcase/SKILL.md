---
name: model-showcase
description: Use when building a model-compose showcase example that introduces one model — researches the model, maps it onto a model-compose task, gates on which demo angle to build, then generates the compose file, the web UI, the fixtures, and the three READMEs.
---

# model-showcase

Six steps turn a model name into a runnable `examples/showcase/<verb-object>/` example.
Human judgement sits at exactly two of them; the rest is mechanical and this skill's
prose is what makes it repeatable.

## The six steps

| Step | Who | What |
|---|---|---|
| 1. Research | automatic | variants, sizes, licence, I/O mode, hardware, the distinguishing mechanism — `references/research.md` |
| 2. Map | automatic | which of the model tasks, which driver, which existing example is the base — `references/compose.md` |
| 3. **Demo angle** | **human** | the killer property, three screens that would show it, pick one |
| 4. Generate | automatic | compose, `ui/` via `ui-house-style`, fixture, READMEs, index entry — `references/compose.md`, `references/readme.md` |
| 5. Fast verify | automatic | `ui-check.mjs`, screenshots, self-critique — `references/verify.md` |
| 6. **Real run** | **human** | `model-compose up` once — `references/verify.md` |

**Step 3 stops here and asks.** Present the killer property and three candidate screens;
do not pick one without the human's answer.

**Step 6 stops here and asks.** Report the fast-verify screenshots, then wait for the
person running `model-compose up` to say the real run worked before treating the example
as done. Do not run `model-compose up` and certify the result yourself, even when shell
access makes that possible. "Did the real run work" is a judgement about output quality —
whether the transcription is any good, whether the speakers are right — not an exit code,
and an agent inspecting its own output has no independent ground to stand on. The human's
answer is the gate, not the command's return status.

## Reference files

| File | Read it when |
|---|---|
| `references/research.md` | doing step 1 — sourcing fields, the licence gate, the usage-scope gate, the no-guessing rule |
| `references/compose.md` | doing step 2 or step 4 — picking the base example, writing `model-compose.yml`, the verbatim `websocket-client.js` copy, directory naming |
| `references/readme.md` | doing step 4 — the three READMEs and the `examples/README.md` index entry |
| `references/verify.md` | doing step 5 or step 6 — the fast loop, the fixture lifecycle, the Chrome rule |

Step 4's UI work is `ui-house-style`'s job, not this skill's: read that skill's own
`SKILL.md` when laying down `ui/`.

## The generated example is never hand-patched

If a screenshot looks wrong, if a check fails, or if the real run in step 6 surfaces a
schema this skill assumed wrong — fix the mistake in this skill's prose, in
`ui-house-style`, or in the fixture, then regenerate the example whole. Hand-patching the
generated files measures the patch, not the skill, and the next model repeats the same
mistake. Nothing under `examples/showcase/<name>/` is a hand-edit target.
