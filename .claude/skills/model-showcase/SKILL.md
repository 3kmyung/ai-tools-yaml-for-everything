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

> **STOP — human gate, step 3.** Present the killer property and three candidate screens.
> Do not pick one without the human's answer.

> **STOP — human gate, step 6.** Report the fast-verify screenshots, then wait for the
> human running `model-compose up` to confirm the real run worked. Never run
> `model-compose up` and self-certify the result, even though shell access makes that
> possible: output quality is a judgement call, not an exit code, and an agent inspecting
> its own output has no independent ground to stand on.

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

When a screenshot looks wrong, a check fails, or step 6 surfaces a schema this skill
assumed wrong: fix the skill's prose, `ui-house-style`, or the fixture, then regenerate
the example whole. Hand-patching measures the patch, not the skill, and the next model
repeats the same mistake. Nothing under `examples/showcase/<name>/` is a hand-edit target.
