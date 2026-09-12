# benchmark.md

Read this before running or describing any measurement — before touching
`assets/bench-hw.py`, before invoking either external accuracy harness, and before
writing a single number into `report.md`.

## Why accuracy is measured once and hardware once per machine

The hardware axis (cold start, TTFO, E2E, RTF, peak video memory, peak resident set) is
measured on every machine, because the whole point is how one model behaves across them.
The accuracy axis is measured once, on one machine, and then checked on a second one.

This file used to say accuracy could be measured once because the same weights on the
same input produce the same output. That was measured and it is false. Two machines ran
the same checkpoint at `bfloat16` on the same audio and returned different transcripts —
17.88% against 17.66% word error rate, 152 segments against 153. At low precision a
different kernel or a different reduction order flips one token, and everything decoded
after it follows the flip.

```
✗ Reporting one machine's accuracy as the model's accuracy.
→ Score a second machine too, and quote the spread between them as the noise floor
  before attributing any difference to precision, quantization or build.
Why: the spread was 0.22 points here, which is small — and it was larger than the gap
between the reference checkpoint and a 4-bit conversion. Without the second baseline
that conversion's score reads as a quantization penalty it did not cause.
```

Scoring every machine is still the wrong default: a long accuracy run per machine buys
little once the spread is known. Two is the number that makes the third interpretable.

A row measured under a second inference stack is the exception that proves this: its
accuracy would differ, because a different implementation is not the same weights
arithmetic. That is why such a row carries no accuracy figure at all rather than a
separately measured one — see the runtime section below.

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
`cpu_percent`, and `num_threads`, read from whichever accelerator the process actually
allocated on:

| Backend | Read from |
|---|---|
| CUDA, including a Grace Blackwell part | `torch.cuda.max_memory_allocated()` |
| MPS under PyTorch | `torch.mps.current_allocated_memory()` |
| MLX | `mlx.core.get_peak_memory()` |
| Anything else, or no accelerator library installed | zero |

A machine running a converted build has no `torch` allocation to report, and a zero
there is indistinguishable from "this machine has no accelerator" — which is precisely
the difference a cross-machine table exists to show.

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
✗ Reporting peak resident set as "the" memory figure for every machine.
→ Report peak video memory and peak resident set side by side, with the note that a
  unified-memory machine's two figures describe overlapping memory rather than two
  separate pools.
Why: on a discrete card the weights sit in video memory separate from resident set size;
on a unified-memory machine the two numbers describe the same bytes twice. Reporting
resident set alone makes the unified-memory machine look like it uses far more memory,
which is an artefact of what got measured, not a fact about the machines.
```

## The precision trap

`precision: auto` does not mean one fixed numeric type across every machine — what it
resolves to is a decision made inside each model's own driver, not a blanket
model-compose behaviour. The VibeVoice speech-to-text driver's own resolution function
(`src/mindor/core/component/services/model/tasks/speech_to_text/custom/vibevoice.py`,
`_resolve_torch_dtype`) picks `bfloat16` on CUDA, `float16` on MPS, and `float32` on CPU
when precision is left on `auto`. So an MPS run and a CUDA run under `auto` are not
running the same numerics, and reporting "15s here, 4s there" without saying so compares
two different computations, not two speeds of the same one. Check the
equivalent resolution function for whichever model this skill measures next — `auto`'s
meaning is decided per driver, and nothing guarantees the same three-way split for a
different model.

```
✗ Comparing "N seconds here, M seconds there" under `precision: auto` with no further
  comment.
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

## Quantization, when a machine cannot hold the weights

A machine too small for the checkpoint gets one question before anything is run: does a
configuration exist that still measures the machine? Quantizing the weights does.
Offloading part of the model to system memory does not — that row measures the offload,
and the machine it names had little to do with the result. When no such configuration
exists, the machine leaves the table and its arithmetic goes to the report's limits
section, where "this does not fit in N gigabytes" is a checkable claim that needs no run
at all.

When the row does survive, `assets/bench-hw.py` takes `--quantization`,
`--quantization-backend`, and `--quantization-skip-modules`, and renders them into
`conditions.numerics`, which is the label the report table carries verbatim.

Sizing that decision takes no hardware and no download. A checkpoint's
`model.safetensors.index.json` names every tensor, each shard's header carries its byte
offsets, and summing by top-level module gives the split between what will be quantized
and what must not be:

| Quantity | Read from |
|---|---|
| Bytes per module | shard headers, summed by the first two name segments |
| Quantized size | the backbone's bytes, times the target bit width over the source bit width |
| Key-value cache per token | `2 × layers × key_value_heads × head_dimension × bytes per element`, from `config.json` |

```
✗ Deciding a machine is too small from the checkpoint's total size alone.
→ Split the total by module first. The modules that must stay at full precision set the
  floor, and that floor is what a quantized run actually has to fit under.
Why: a total of 17 GB suggests 4-bit brings it to 4 GB. If a fifth of those bytes cannot
be quantized, the real floor is nearly twice that, and the difference decides whether the
row exists.
```

Which toolchain is available is decided by the backend and by whether anyone has ported
the architecture, not by preference:

| Toolchain | CUDA | MPS | Arbitrary architecture | Applied |
|---|---|---|---|---|
| bitsandbytes | yes | no | yes — swaps `nn.Linear` | at load |
| optimum-quanto | yes | partial | yes — swaps `nn.Linear` | at load |
| torchao | yes | partial | yes — swaps `nn.Linear` | at load |
| GPTQ, AWQ | yes | no | no — per-architecture support | ahead of time, with calibration |
| MLX, GGUF | — | yes | no — needs a port | ahead of time, by conversion |

```
✗ Concluding that no quantized build exists because bitsandbytes cannot produce one on
  this machine's accelerator.
→ Search the model's own hub organisation and the community conversion organisations
  before concluding anything. A popular checkpoint frequently has MLX or GGUF builds
  already published, with their converted sizes stated on the repository page.
Why: "the toolchain I reached for does not support this accelerator" and "no quantized
build of this model exists" are different claims, and only the first one follows from a
CUDA-only library.
```

A published conversion answers whether a small machine *can* run the model. It does not
by itself answer whether that machine belongs in this table, because a converted build
runs under its own runtime's kernels rather than the one every other row used:

| Question | Answered by |
|---|---|
| Can this machine run the model at all | any working build, converted or not |
| Does this row compare against the others | only a build running the same inference stack |

```
✗ Putting a row measured under a second inference stack beside rows measured under the
  first, separated only by a precision label.
→ Either give the row its own table with the runtime named, or leave it out and say in
  the limits section which build a reader on that machine should reach for.
Why: two implementations of one architecture differ in kernels, fusion, and memory
layout. The gap between them is not the gap between the machines, which is what the
table claims to show.
```

A speech model is not a language model wearing a hat. Quantizing its audio tokenizer
degrades waveform reconstruction rather than token choice, which does not show up as a
slightly worse score — it shows up as output that is wrong in a way the metric was never
designed to catch.

```
✗ Quantizing a speech model whole, the way a text-only language model is quantized.
→ Quantize the language backbone and list the tokenizer modules in
  `--quantization-skip-modules`, matching whatever the loader was actually told to skip.
Why: the argument records what the compose file did; it does not cause it. A run whose
recorded skip list disagrees with the component's own configuration reports a condition
that never happened.
```

Two rows at different `conditions.numerics` are comparable on speed and memory and are
**not** comparable on accuracy:

| Axis | Across precisions or quantizations |
|---|---|
| Cold start, TTFO, E2E, RTF, peak memory | comparable |
| WER, CER, cpWER, tcpWER | not comparable |

```
✗ A table where one row is nf4 and the rest are bfloat16, with one shared accuracy
  column.
→ Keep the accuracy column on the matched-precision rows only, and state under the table
  that the quantized row carries speed and memory figures alone.
Why: a reader comparing a quantized row's word-error rate against an unquantized row's
attributes the difference to the machine. The machine had nothing to do with it.
```

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

The `microsoft/VibeVoice-ASR-HF` model card publishes an Open ASR Leaderboard table:
`ami_test` 17.20%, average 7.77%, RTFx 51.80. Those are the reference figures, and a
local run landing far from them means the local setup is wrong rather than the model.

Three things about that comparison, none of which the table states and all of which
change what the gap means:

| What the published figure does not say | Consequence |
|---|---|
| Which microphone condition `ami_test` is | The row is labelled `ami_test` and nothing more. A headset mix and a single distant microphone are two different problems; if the local run picks one, the report says which and does not claim the published figure used the same |
| That it is long-form | The leaderboard scores pre-segmented utterances. A run on a whole meeting is measuring something harder, so a slightly worse number is not a regression |
| Anything about speakers or timing | The published figure is WER. cpWER and tcpWER on a full meeting have no published counterpart at all |

```
✗ Writing "17.20% is IHM" — or any other condition the source does not state.
→ Quote the row label the source uses, name the condition the local run actually used,
  and leave the published one unstated because it is unstated.
Why: this exact sentence was written into this file from memory and had to be removed
after checking the card. A condition invented to make two numbers comparable makes them
look comparable without making them so.
```

No expectation about relative DGX Spark performance gets written down before it is
measured — the same no-guessing rule that governs `model-showcase`'s research step
governs every number here.
