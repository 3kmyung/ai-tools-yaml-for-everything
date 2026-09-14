---
name: analyze-model
description: Use when a model-compose release's real run works and its speed, memory or accuracy needs measuring across machines, or when the user says "성능 분석", "벤치마크", "benchmark", "RTF", "WER 측정".
---

# analyze-model

`compose` and `build-ui` produce a runnable release; this skill produces the measured
numbers about it. It starts after the human's real run has already succeeded — there is
nothing to measure before that. Writing the numbers up is `report-model`'s job, and the
post is `write-post`'s.

## Where to start

Look in `releases/<example>/benchmarks/` before doing anything else.

| What is there | Start at |
|---|---|
| no `results/*.json` | measurement — `references/benchmark.md` and both gates below |
| `results/*.json` with every run `valid: true`, but no `accuracy/*.json` | the accuracy run alone — `references/benchmark.md`'s accuracy section and both gates |
| `results/*.json` with every run `valid: true`, and `accuracy/*.json` | nothing — measuring is done, and `report-model` takes it from there. No runner is started and no machine is asked for |

## Two axes

| Axis | Where | What varies | Reference data |
|---|---|---|---|
| Speed and memory | every machine under comparison | hardware, and whatever build each machine can actually load | none needed |
| Accuracy | two machines | precision, build, and the spread between two machines at the same precision | required: the corpus's own annotation, scored through MeetEval |

Accuracy varies with hardware more than it looks like it should. Two machines running
one checkpoint at `bfloat16` returned different transcripts here, because low precision
plus a different kernel flips a token and the decode follows the flip. Score a second
machine to learn the size of that spread; without it, every later difference is
attributed to precision or quantization by default. `references/benchmark.md` has the
measurement that overturned the older rule.

A machine that cannot load the reference checkpoint still gets a row, measured on
whatever build it can run — quantized, converted, or both. Three columns say what that
was: `conditions.runtime`, `conditions.build`, `conditions.numerics`. Such a row's speed
figures never go in the same column as the baseline's without those three beside them,
but its accuracy is worth scoring on its own: a converted build's publisher usually ships
no evaluation at all, which makes that score the one number in the report nobody else
has. `references/benchmark.md` has the toolchain table, the modules a speech
model must be told not to quantize, and how to size the decision before running
anything.

| Runner | For a machine that |
|---|---|
| `scripts/analyze-model/bench_hw.py` | runs the reference checkpoint through `model-compose` and PyTorch |
| `scripts/analyze-model/bench_mlx.py` | has no PyTorch build and runs an MLX conversion instead |

Both write the same result shape through `scripts/analyze-model/harness.py`, so their rows
land in one table. Accuracy is scored from the transcript a runner saved:

| Script | Does |
|---|---|
| `scripts/analyze-model/ami_reference.py` | turns one AMI meeting's word annotation into a MeetEval SegLST reference |
| `scripts/analyze-model/score_accuracy.py` | scores a saved transcript against that reference through MeetEval, writing tcpWER, cpWER and WER |

## Reference files

| File | Read it when |
|---|---|
| `references/benchmark.md` | measuring anything — what belongs on which axis, the precision trap, quantizing a machine that cannot hold the weights, scoring accuracy through MeetEval rather than a scorer written here |

> **STOP — hardware and data gate.** Every row of the table, and the accuracy run, needs
> a physical machine this skill cannot reach on its own, plus a reference dataset for the
> accuracy run. Hand the matching runner and the scoring scripts to a human
> on that hardware, then read back `releases/<example>/benchmarks/results/*.json` and
> `releases/<example>/benchmarks/accuracy/*.json`. Never invent a figure for a machine that has
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
