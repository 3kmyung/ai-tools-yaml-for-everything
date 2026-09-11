# benchmark.md

Read this before running or describing any measurement — before touching
`assets/bench-hw.py`, before invoking either external accuracy harness, and before
writing a single number into `report.md`.

## Why accuracy is measured once and hardware three times

The hardware axis (cold start, TTFO, E2E, RTF, peak video memory, peak resident set) is
measured on all three machines, because the whole point is how one model behaves across
them. The accuracy axis is measured on one machine only, across the three precisions the
model actually runs under, because word-error rate does not depend on which chip did the
multiplying — the same weights on the same input produce the same output. Precision is
the one exception, and it gets its own section below.

```
✗ Running the accuracy harness on the MacBook, the RTX 4090, and the DGX Spark.
→ Run it once, on one machine, at each of the three precisions the model is actually
  deployed under (`bfloat16`, `float16`, `float32`).
Why: accuracy does not vary with hardware. Three long accuracy runs would buy one number
that hardware had no part in.
```

## Reusing the existing harness

`benchmarks/common/metrics.py` already provides `MetricsCollector` and `SystemSample`
against a three-event JSONL contract that `benchmarks/llm-tts-streaming` and
`benchmarks/stt-embed-streaming` already emit to compare model-compose against LangGraph,
LangChain, and LlamaIndex:

```
{"t": <float>, "stage": "runtime",  "event": "ready"}
{"t": <float>, "stage": "pipeline", "event": "first_output"}
{"t": <float>, "stage": "pipeline", "event": "done"}
```

That contract, and the metric computation built on it, carries over unchanged. Only the
axis under comparison changes: the existing benchmarks hold hardware fixed and compare
frameworks; this one holds the framework fixed and compares hardware.

`SystemSample` carries a `vram_bytes` field alongside the existing `rss_bytes`,
`cpu_percent`, and `num_threads` — read from `torch.cuda.max_memory_allocated()` on CUDA
(this covers the DGX Spark's GB10 as well as the RTX 4090) and from
`torch.mps.current_allocated_memory()` on MPS, and left at zero anywhere else, including
a machine with no `torch` import available. Without it, a three-machine comparison
cannot be made honestly at all — see the annotation below.

```
✗ Trusting `vram_bytes` from `assets/bench-hw.py` when the component's `runtime` is
  `virtualenv` or `docker`.
→ Read peak video memory from the component's own subprocess for those runtimes; treat
  `bench-hw.py`'s own reading as a confirmed zero, not a missing one.
Why: a CUDA context is per-process. `bench-hw.py` runs the orchestrator in its own
process and calls `torch.cuda.max_memory_allocated()` there; a component with `runtime:
type: virtualenv` (VibeVoice's transcriber, for one) loads its model in a separate
interpreter whose CUDA allocations that call cannot see.
```

## The hardware axis's metrics

| Metric | Definition | Purpose |
|---|---|---|
| Cold start | wall time from the `model-compose up` invocation to `runtime.ready` | checkpoint load plus venv or docker build; the largest hardware spread. Not part of the existing three-event contract — the harness times its own launch against the `runtime.ready` timestamp, since `MetricsCollector` only starts its own clock once that event has already arrived |
| TTFO | `pipeline.first_output` − the moment `runtime.ready` was observed | existing contract |
| E2E | `pipeline.done` − the moment `runtime.ready` was observed | existing contract |
| RTF | E2E ÷ audio duration | the ASR standard; below 1 is faster than real time. This is the number that goes in the post |
| Peak video memory | the peak of `SystemSample.vram_bytes` across the run | does this run on this machine at all |
| Peak resident set | the peak of `SystemSample.rss_bytes` across the run, as the existing collector already reports | overlaps peak video memory on unified-memory machines — see below |

```
✗ Reporting peak resident set as "the" memory figure for all three machines.
→ Report peak video memory and peak resident set side by side, with the note that on the
  MacBook and the DGX Spark they describe overlapping memory rather than two separate
  pools.
Why: on the RTX 4090 the weights sit in video memory separate from resident set size; on
the MacBook and the DGX Spark, unified memory means the two numbers describe the same
bytes twice. Reporting resident set alone makes the Mac look like it uses far more memory
than the 4090, which is an artefact of what got measured, not a fact about the machines.
```

## The precision trap

`precision: auto` does not mean one fixed numeric type across every machine — what it
resolves to is a decision made inside each model's own driver, not a blanket
model-compose behaviour. The VibeVoice speech-to-text driver's own resolution function
(`src/mindor/core/component/services/model/tasks/speech_to_text/custom/vibevoice.py`,
`_resolve_torch_dtype`) picks `bfloat16` on CUDA, `float16` on MPS, and `float32` on CPU
when precision is left on `auto`. So a MacBook run and an RTX 4090 run under `auto` are
not running the same numerics, and reporting "MacBook 15s, 4090 4s" without saying so
compares two different computations, not two speeds of the same one. Check the
equivalent resolution function for whichever model this skill measures next — `auto`'s
meaning is decided per driver, and nothing guarantees the same three-way split for a
different model.

```
✗ Comparing "MacBook Ns, RTX 4090 Ms" under `precision: auto` with no further comment.
→ Two tables: one with `float16` forced on every machine for the actual hardware
  comparison, one with `auto` left alone for what a reader gets by just installing it.
Why: `auto` resolves to a different numeric type per accelerator, so an unqualified
side-by-side compares different arithmetic, not different speeds of the same arithmetic.
```

| | Matched conditions (`float16` forced) | Real-world conditions (`auto`) |
|---|---|---|
| Purpose | the hardware comparison | what a reader gets by installing it as shipped |
| Placement | report body | report appendix |

Every figure in either table carries its precision, its batch setting, and its sample
length. The accuracy run (below) is what tells you whether the second table is honest to
publish at all: if precision moves `tcpWER` by a rounding error, the appendix
side-by-side is fine as a body figure too; if it moves the score materially, only the
matched table belongs in the body and the report says so.

## Accuracy: delegated, not reimplemented

Two open harnesses cover the whole job. Building a scorer in this repository would
produce numbers comparable to nothing anyone else has published.

```
✗ Writing a WER, cpWER, or tcpWER scorer in this repository.
→ Run the Open ASR Leaderboard for WER and RTFx; run `chime-utils`, scoring through
  MeetEval, for cpWER and tcpWER.
Why: a scorer built here produces a number with no other number in the world to sit
beside. The two harnesses below already carry that comparability.
```

- **[Open ASR Leaderboard](https://github.com/huggingface/open_asr_leaderboard)**
  ([arXiv:2510.06961](https://arxiv.org/abs/2510.06961)) downloads its own reference
  datasets, applies its own normaliser, and reports WER and RTFx across ESPnet, NeMo,
  SpeechBrain, and Transformers backends.
- **[chime-utils](https://github.com/chimechallenge/chime-utils)** prepares CHiME-6,
  DiPCo, MX6, and NOTSOFAR-1 and scores through
  [MeetEval](https://github.com/fgnt/meeteval), which is where cpWER and tcpWER come
  from.

Which metric belongs to which task is not a style choice:

| Task | Metric |
|---|---|
| Single-speaker short-form transcription | WER |
| Chinese or Japanese transcription | CER |
| Diarisation alone | DER |
| Multi-speaker long-form — transcription, speaker, and timing together | **tcpWER**, the ranking metric for CHiME-8 DASR and NOTSOFAR-1 |

cpWER concatenates each speaker's words and permutes speaker labels to find the best
match, so it is blind to timing. tcpWER adds a time constraint that refuses to match a
word far from where the reference places it — the gap between the two scores is the size
of the timestamp error. For a model that emits transcription, diarisation, and
timestamps in one decode, WER alone scores half of what the model produced: report
tcpWER as the headline, cpWER beside it, and WER for comparability with a plain
transcriber.

## The published numbers are the harness's own self-test

VibeVoice-ASR's 7.77% average WER, 17.20% on AMI, and RTFx 51.80 come from the Open ASR
Leaderboard. A local run landing far from those means the local setup is wrong, not that
the model changed. Two conditions have to match before any comparison means anything:

| Condition | Why it matters |
|---|---|
| The leaderboard's own normaliser | a different text normaliser changes the score independent of the model |
| AMI's microphone condition | 17.20% is IHM (individual headset microphones); scoring SDM (single distant microphone) against it compares two different recording setups, not a regression |

```
✗ Comparing a local WER against 17.20% before checking the normaliser and the microphone
  condition.
→ Confirm the normaliser matches the leaderboard's own, and confirm the local run used
  AMI's IHM condition, before treating any gap as a finding about the model.
Why: 17.20% is IHM. SDM against IHM is two different problems, not two different scores
of the same one.
```

No expectation about relative DGX Spark performance gets written down before it is
measured — the same no-guessing rule that governs `model-showcase`'s research step
governs every number here.
