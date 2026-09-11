# Model Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `model-report` so that a showcase example, once it runs, produces a report and an X post carrying measured numbers with their conditions stated and no figure that lacks a source.

**Architecture:** The skill is documents plus two small assets. Accuracy measurement is delegated to two open harnesses rather than reimplemented; what is built here is the one axis nobody else measures — how a single model behaves across a MacBook, an RTX 4090 and a DGX Spark.

**Tech Stack:** Python for the hardware benchmark (extending `benchmarks/common/metrics.py`), Node for capture, Markdown for the skill's documents. Open ASR Leaderboard and `chime-utils` for accuracy, both run rather than rewritten.

**Spec:** `docs/superpowers/specs/2026-09-11-model-showcase-skills-design.md`, section "Skill D: `model-report`"

## Global Constraints

- Line endings are LF. Verify byte-exactly with `tr -cd '\r' < <file> | wc -c`, never with `grep -c $'\r'` — in a nested command substitution under this shell it degenerates to an empty pattern and reports a CR count equal to the line count for files with none.
- No comments in source files. Reasoning goes in the commit message.
- No truncated abbreviations. `documents` not `docs`, `configuration` not `config`. Initialisms and real identifiers stay.
- Function bodies read as declaration, work, return, separated by blank lines.
- Every ban in the skill's prose is written as ban, replacement, reason.
- Prose down, structure up: a table where the content is tabular, and no detail that will go stale.
- No `Co-Authored-By` trailer; backtick every identifier in the commit body.
- The skill lives at `.claude/skills/model-report/` and is versioned with the repository.
- Never kill Chrome by image name. Every Chrome invocation self-exits.

## What this plan does not contain

Plan 1's Task 14 — the first real run of `examples/showcase/transcribe-long-meeting` — was deferred into this plan rather than completed in its own, because it needs the same machine and the same audio as the benchmark runs. It is Task 5 here.

Three questions ride on it and are unresolved until it happens: the workflow's actual output schema, the checkpoint's parameter count, and whether `acoustic_tokenizer_chunk_size` changes the transcription.

## Hardware and data prerequisites

Tasks 1 through 4 need neither. Tasks 5 through 8 need both, and the machine this plan was written on has neither.

| Requirement | Why |
|---|---|
| A machine with roughly 18 GB of accelerator memory | the checkpoint is 8,674,021,857 parameters; bfloat16 needs about 17.3 GB |
| A multi-speaker recording of at least ten minutes | a short or single-voiced clip settles none of the three open questions |
| AMI test set, IHM condition | the accuracy run's reference data, and the self-test against the published 17.20% |

The machine used for Plan 1 is an RTX 4050 laptop with 6141 MiB of video memory and 15.3 GB of system memory. It cannot run Task 5.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `.claude/skills/model-report/SKILL.md` | create | when to invoke, the axes, the two gates |
| `references/benchmark.md` | create | what is measured where, the precision trap, the delegation |
| `references/report.md` | create | the report's six sections and what each must carry |
| `references/social.md` | create | the X thread's shape and its one prohibition |
| `assets/bench-hw.py` | create | the hardware axis, extending the existing collector |
| `assets/capture.mjs` | create | screenshot and screencast for the demo media |
| `benchmarks/common/metrics.py` | modify | `SystemSample` gains `vram_bytes` |

---

## Task 1: Give the metrics collector a memory axis

**Files:**
- Modify: `benchmarks/common/metrics.py`
- Test: `tests/unit/` — follow the existing convention there

**Interfaces:**
- Consumes: `SystemSample`, `MetricsCollector` as they stand.
- Produces: `SystemSample` with a `vram_bytes` field, and a sampler that populates it on CUDA and on MPS and records zero elsewhere. `bench-hw.py` in Task 4 depends on this.

The existing collector records `rss_bytes`, `cpu_percent` and `num_threads`. For a three-machine comparison that is disqualifying: on the 4090 the weights sit in video memory separate from resident set size, while the Mac and the DGX Spark use unified memory where the two overlap. Comparing resident set size alone reports that the Mac uses far more memory, which is an artefact of what is being measured rather than a fact about the machines.

- [ ] **Step 1: Write the failing test**

A test that constructs a `SystemSample` with a video-memory reading and asserts the collector's rollup reports its peak alongside the existing resident-set peak. Follow the conventions already in `tests/`; read a neighbouring test first.

- [ ] **Step 2: Run it to verify it fails**

Expected: the field does not exist.

- [ ] **Step 3: Add the field and the reading**

`vram_bytes` on `SystemSample`, and in the sampler: `torch.cuda.max_memory_allocated()` where CUDA is present — which covers the DGX Spark's GB10 — and `torch.mps.current_allocated_memory()` on MPS. Neither import may be required: a machine without torch must still collect the other metrics rather than failing to start.

- [ ] **Step 4: Run it to verify it passes**

- [ ] **Step 5: Confirm the existing benchmarks still run**

`benchmarks/llm-tts-streaming` and `benchmarks/stt-embed-streaming` both import this module. Neither should change behaviour.

- [ ] **Step 6: Commit**

---

## Task 2: `model-report` — the skill and the benchmark reference

**Files:**
- Create: `.claude/skills/model-report/SKILL.md`
- Create: `.claude/skills/model-report/references/benchmark.md`

**Interfaces:**
- Consumes: the spec's "Skill D" section; `benchmarks/common/metrics.py` as amended by Task 1.
- Produces: the skill's entry point and the document that says what is measured where.

**Source text:** spec sections "Skill D: `model-report`", "Reusing the existing harness", "Metrics", "Accuracy: measured once, by existing harnesses", "The precision trap".

`SKILL.md` stays one page: when to invoke, the two axes, and the human gates made unmissable. Rules live in `references/`.

What `benchmark.md` must carry, none of which is negotiable because each was argued into the spec:

| Content | Why it is there |
|---|---|
| The two axes, and that accuracy is measured once rather than three times | accuracy does not vary with hardware; precision is the only exception |
| The precision trap and the two tables it forces | `precision: auto` resolves to bfloat16 on CUDA, float16 on MPS, float32 on CPU, so the machines are not running the same numerics |
| The delegation to Open ASR Leaderboard and `chime-utils` | building a scorer here produces numbers comparable to nothing |
| Which metric belongs to which task | tcpWER for multi-speaker long-form, and why WER alone scores half of this model's output |
| The published figures as a self-test | a local run far from 7.77% average or 17.20% on AMI means the setup is wrong, not the model |
| The two conditions that must match first | the leaderboard's normaliser, and AMI's microphone condition — 17.20% is IHM |
| The hardware axis's metrics | cold start, TTFO, E2E, RTF, peak video memory, peak resident set, each with its definition |
| That resident set overlaps video memory on unified-memory machines | otherwise the annotation is missing and the table lies |

- [ ] **Step 1: Write `SKILL.md`**
- [ ] **Step 2: Write `references/benchmark.md`**
- [ ] **Step 3: Check every repository fact it asserts**

It names `benchmarks/common/metrics.py`, its three-event contract, and the existing benchmark directories. Verify each against the repository. A skill that misdirects on its first use fails on its first use.

- [ ] **Step 4: Commit**

---

## Task 3: `model-report` — the report and the post

**Files:**
- Create: `.claude/skills/model-report/references/report.md`
- Create: `.claude/skills/model-report/references/social.md`

**Interfaces:**
- Consumes: `benchmark.md` from Task 2.
- Produces: the two documents that turn measurements into published output.

**Source text:** spec sections "Report structure", "Media capture", "Social post".

`report.md` carries the six sections and what each must contain. Two of them are where reports usually fail:

- Section 4's interpretation is mandatory. A bare table goes unread. One sentence such as "the 4090 leads at RTF 0.08, but the Mac's 0.4 is still 2.5× real time, so a laptop is practical" is what carries the result.
- Section 4 also states the accuracy figures with the harness that produced them and the published numbers they were checked against, and does not quote only the flattering row. Where a model's worst published dataset is the demo's own domain — as AMI's 17.20% is for a meeting transcriber — that row appears in the body with its caveat.
- Section 5 carries any usage-scope statement the research step recorded, quoted rather than summarised. A permissive licence and an author saying not to ship it are both true at once.

`social.md` is one template: X only, Korean, 280 characters, extended as a thread, with the link in a reply so the first post's reach is not reduced. Four required elements — one line on the model, exactly one performance number, the demo media, the GitHub example link.

Its one prohibition: when the research step recorded a usage-scope restriction, the post does not read as a recommendation to deploy. Shipping advice the model's own authors decline to give is the one way this post can do harm.

- [ ] **Step 1: Write `references/report.md`**
- [ ] **Step 2: Write `references/social.md`**
- [ ] **Step 3: Commit**

---

## Task 4: The two assets

**Files:**
- Create: `.claude/skills/model-report/assets/bench-hw.py`
- Create: `.claude/skills/model-report/assets/capture.mjs`

**Interfaces:**
- Consumes: `benchmarks/common/metrics.py` with `vram_bytes` from Task 1; the harness conventions in `model-showcase/assets/`.
- Produces: `bench-hw.py`, which runs one example and writes a result file per machine; `capture.mjs`, which produces the report's screenshots and the post's video.

`bench-hw.py` measures the hardware axis only. It emits the three events the existing collector already understands and writes `benchmarks/<example>/results/<machine>.json`. It does not score transcription.

`capture.mjs` follows the conventions `model-showcase/assets/ui-check.mjs` established, because they were earned: flags in the `=` form, every Chrome invocation self-exiting, and a real viewport rather than a window size — the harness floors at roughly 518 pixels otherwise, which is why the portrait video needs the device-metrics override that file already carries.

**Known limitation to carry, not to solve:** `position: fixed` content does not paint in headless captures even when genuinely open. The dropdown menu uses the native popover API and is positioned fixed, so the demo video cannot show an open menu through this path. State it in `report.md`'s media section rather than discovering it while filming.

- [ ] **Step 1: Write `bench-hw.py`, with a test that exercises the event emission without a model**
- [ ] **Step 2: Write `capture.mjs`**
- [ ] **Step 3: Verify `capture.mjs` against an existing example at 1440x900 and 390x844**
- [ ] **Step 4: Commit**

---

## Task 5: The first real run — Plan 1's Task 14

**Requires the hardware and the audio.**

**Files:**
- Modify: `examples/showcase/transcribe-long-meeting/ui/fixture.json` and its adapter
- Modify: that example's three READMEs, wherever a figure is marked as needing verification
- Modify: `examples/model-tasks/speech-to-text-vibevoice/README.md` if the schema disagreement resolves against it

Read `.superpowers/sdd/2026-09-11-model-showcase-skills/task-14-brief.md` and the blocked run's report in the same directory.

Three questions, each settled by measurement or not at all:

| Question | How it resolves |
|---|---|
| Output schema | record what the workflow returns; rewrite the one adapter function; correct whichever document was wrong |
| Parameter count | what the loaded checkpoint reports, against GitHub's 7B, the card's 9B and the other card's 8B |
| Chunk-size invariance | transcribe twice at 1440000 and 64000 samples and diff; identical earns the sentence, different deletes it |

Then replace the fixture with real output and re-run the fast loop at all three widths. Real segment text is longer than anything hand-written, so this is the first genuine test of truncation and wrapping.

**If `model-compose up` fails, that is the finding.** It means the generating skill produced something that does not run. Record what failed and whether the fault is in the compose file or in the skill that wrote it; do not hand-patch the example into working.

---

## Task 6: The hardware runs

**Requires all three machines.**

Run `bench-hw.py` on the MacBook, the RTX 4090 and the DGX Spark against the same audio, and collect `benchmarks/transcribe-long-meeting/results/*.json`.

Two tables come out of this, and the second only exists if the first justifies it: matched conditions with `float16` forced, and real-world conditions with `precision: auto`. Every figure carries its precision, batch setting and sample length.

---

## Task 7: The accuracy run

**Requires one machine and the AMI test set.**

One machine, three precisions, scored by the external harnesses. Write `benchmarks/transcribe-long-meeting/accuracy/{bfloat16,float16,float32}.json`.

The self-test comes first: if the WER lands far from the published 7.77% average, the setup is wrong before the model is. Check the normaliser and the microphone condition before believing any number.

---

## Task 8: The report and the post

Write both, from the measurements and from nothing else. Any figure without a source or a stated condition does not appear.

---

## Out of scope for this plan

The daily routine this skill set exists to support — a new model every day — starts after this plan lands. Each subsequent model is one pass through `model-showcase` followed by one pass through `model-report`, with no plan document of its own.
