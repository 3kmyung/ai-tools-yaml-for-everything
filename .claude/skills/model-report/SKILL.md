---
name: model-report
description: Use when a model-compose showcase example has a working real run and needs to be measured and published — benchmarks it across every machine under comparison, delegates accuracy to two external harnesses, and turns both into a report and an X thread where every number carries its source and its condition.
---

# model-report

`model-showcase` produces a runnable example; this skill produces the numbers about it
and the two documents that carry those numbers to a reader. It starts after
`model-showcase`'s step 6 real run has already succeeded — there is nothing to measure
before that.

## Two axes, one measured once

| Axis | Where | What varies | Reference data |
|---|---|---|---|
| Speed and memory | every machine under comparison | hardware, and whatever build each machine can actually load | none needed |
| Accuracy | one machine | precision (`bfloat16` / `float16` / `float32`) | required, from an external harness |

Accuracy does not vary with hardware: the same weights on the same input produce the
same output, with precision as the only exception. Running an accuracy harness once per
machine to learn one number the hardware had no part in is the mistake this split exists
to prevent.

A machine that cannot load the reference checkpoint still gets a row, measured on
whatever build it can run — quantized, converted, or both. Three columns say what that
was: `conditions.runtime`, `conditions.build`, `conditions.numerics`. A row that differs
from the baseline in any of them contributes speed and memory figures only, never an
accuracy figure. `references/benchmark.md` has the toolchain table, the modules a speech
model must be told not to quantize, and how to size the decision before running
anything.

| Runner | For a machine that |
|---|---|
| `assets/bench-hw.py` | runs the reference checkpoint through `model-compose` and PyTorch |
| `assets/bench-mlx.py` | has no PyTorch build and runs an MLX conversion instead |

Both write the same result shape through `benchmarks/common/harness.py`, so their rows
land in one table.

## Reference files

| File | Read it when |
|---|---|
| `references/benchmark.md` | measuring anything — what belongs on which axis, the precision trap, quantizing a machine that cannot hold the weights, delegating accuracy rather than scoring it here |
| `references/report.md` | writing the six-section report, especially section 4's mandatory interpretation and section 5's verbatim usage-scope quote |
| `references/social.md` | writing the X thread — the one template, the four required elements, the one prohibition |

> **STOP — hardware and data gate.** Every row of the table, and the accuracy run, needs
> a physical machine this skill cannot reach on its own, plus a reference dataset for the
> accuracy run. Hand the matching runner and the external accuracy harnesses to a human
> on that hardware, then read back `benchmarks/<example>/results/*.json` and
> `benchmarks/<example>/accuracy/*.json`. Never invent a figure for a machine that has
> not actually run.

> **STOP — self-test gate.** Before a single measured figure goes into the report, check
> it against the published baseline the model's own accuracy leaderboard already
> establishes. A local number far from that baseline means the local setup is wrong, not
> that the model regressed — fix the harness and rerun before writing anything down.
> `references/benchmark.md` has the two conditions to match before trusting the
> comparison at all.

No figure reaches either document without a source and a stated condition
(`conditions.numerics`, batch setting, sample length). A number that cannot state where
it came from does not appear.
