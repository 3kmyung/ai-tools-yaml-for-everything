---
name: compose
description: Use when starting a model-compose release or writing its `model-compose.yml`, or when the user says "릴리스 만들고 싶음", "compose 써줘", "model-compose.yml", "release compose".
---

# compose

Turns the human's answers into `releases/<task>-<model>/model-compose.yml` and hands the
real run back to the human. The web UI is `build-ui`'s job.

## Steps

1. **Ask** — find which rows below the request leaves unanswered, ask all of them in one
   message, and **STOP** until the human replies. Never ask a row the request answered.

   | Question | Feeds |
   |---|---|
   | Model checkpoint id | `component.model` |
   | Task and driver | the `action` shape |
   | Reference example under `examples/` | the `component:` block copied whole |
   | Inputs | `action` fields reading `${input.*}` |
   | Outputs | the workflow's `output` |
   | Licence, when it is not MIT or Apache-2.0 | whether the release may ship at all |

   Never research the model: no model card, paper, or benchmark fetch. The answers and
   this repository's source are the only sources; model facts belong to
   `measure-model-release`.
2. **Write** — follow `references/compose.md`.
3. **Validate** — run `model-compose validate` from the release directory. On a non-zero
   exit, fix the compose file and rerun. If the error points at a value the human chose,
   or `model-compose` itself will not start, report the output verbatim and **STOP**.
4. **Real run** — **STOP.** Ask the human to run `model-compose up` in the release
   directory, run the workflow once with real input, and save the workflow output JSON
   to `ui/fixture.json`. That file is `build-ui`'s input. Never run the model yourself:
   whether the output is right is a judgement call, not an exit code.
