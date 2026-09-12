# VibeVoice-ASR across three machines

## 1. What it is

Microsoft's speech-to-text model that transcribes a meeting, labels who spoke, and
timestamps every segment, in one pass over audio up to sixty minutes long.

## 2. What is different

Two things, and the second is what the benchmark below is actually about.

**A 7.5 Hz tokenizer.** Audio at 24000 Hz is compressed by a hop length of 3200 into
7.5 tokens per second, so an hour of speech is 27000 acoustic tokens rather than the
hundreds of thousands a frame-level model would produce. That is what lets an hour fit
inside the context window at all.

```
24000 Hz audio ─▶ acoustic tokenizer ─┐
                                      ├─▶ Qwen2 decoder ─▶ text, speaker, timestamps
                  semantic tokenizer ──┘   28 layers, hidden 3584, 4 key-value heads
                     both at 7.5 Hz
```

**One pass, not a pipeline.** The usual approach runs a transcriber and a separate
diarisation model and then aligns their outputs. Here a single decode emits the words,
the speaker and the times together, which is why the accuracy section below reports
tcpWER rather than word error rate alone — word error rate scores one third of what
this model produces.

The checkpoint is 8,674,021,857 parameters, 17.35 GB at `bfloat16`, and not evenly
distributed:

| Module | Size | Share |
|---|---|---|
| `model.language_model` | 14.14 GB | 81.5% |
| `model.acoustic_tokenizer` | 1.37 GB | 7.9% |
| `lm_head` | 1.09 GB | 6.3% |
| `model.semantic_tokenizer` | 0.69 GB | 4.0% |
| connectors | 0.06 GB | 0.4% |

Read from the checkpoint's own weight index, not estimated. It matters for section 5.

## 3. What was built

`examples/showcase/speaker-diarization-vibevoice` — a `model-compose.yml` that wires the
model to an HTTP endpoint and a web interface: drop an audio file, optionally supply
hotwords, get a speaker-coloured segment list and a timeline.

![The transcription interface showing a speaker-coloured segment list, a timeline strip and the selected segment's text](media/speaker-diarization-vibevoice.png)

The sample data on screen is this report's own AMI run, not a hand-written fixture.
That swap found two defects a written fixture had hidden: the model emits non-speech
events as segments carrying no speaker, which rendered as `Speaker NaN`, and the
interface had nowhere to read a segment's full text — the list truncates, and the
pane beside it held only a timeline.

A capture limitation worth stating rather than discovering: `position: fixed` content
does not paint in a headless capture even when it is genuinely open on screen, so the
media here is scripted around states that do capture — no open popover.

## 4. Performance

One audio file on every machine: AMI meeting ES2004a, headset mix, 1049.35 seconds
(17.5 minutes), four speakers, downloaded from the AMI corpus.

| Machine | Runtime | Build | Numerics | Cold start | TTFO | E2E | RTF | Peak accelerator memory | Peak resident set |
|---|---|---|---|---|---|---|---|---|---|
| RTX 4090 | model-compose + pytorch 2.11.0+cu128 | `microsoft/VibeVoice-ASR` | `bfloat16` | 17.50 s | = E2E | 233.53 s | **0.223** | 22134 MB | 3064 MB |
| DGX Spark (GB10) | model-compose + pytorch 2.14.0+cu130 | `microsoft/VibeVoice-ASR` | `bfloat16` | 94.76 s | = E2E | 1023.93 s | **0.976** | 23777 MB | 3456 MB |
| MacBook Air M1 | mlx-audio | `mlx-community/VibeVoice-ASR-4bit` | `int4/mlx`, all but the tokenizers and connectors | 4.60 s | 225.36 s | 1134.33 s | **1.081** | 13852 MB | 5957 MB |

**The 4090 transcribes a 17.5-minute meeting in under four minutes; the Spark takes
17.1 minutes, barely faster than listening to it; the M1 is slower than real time.**
Below RTF 1.0 a machine keeps up with live audio, and only one of these three does so
with room to spare.

Only the M1 has a time to first output distinct from its end-to-end figure. The MLX
build streams text as it decodes, so words appear after 3.8 minutes of an 18.9-minute
run; the `model-compose` workflow declares its output `as json` and hands back a
finished value, which makes those two columns equal by construction rather than by
speed.

Three columns read differently across these rows and the table cannot hide it:

| Column | Across these rows |
|---|---|
| Cold start | not comparable — two runners, one bringing a compose stack up and one loading a model, and the M1 loads 5.71 GB where the others load 17.35 GB |
| RTF, E2E | comparable as delivered performance, not as a hardware ranking |
| Memory | the 4090's figure is video memory; the Spark's and the M1's are unified memory shared with the system |

The M1 row is not the same measurement as the other two. It runs a 4-bit MLX
conversion under Metal kernels, not the reference checkpoint under CUDA, so the gap
between it and the Spark is part hardware and part build and this table separates
neither. What it does show is that a 16 GB laptop runs this model at all, with 332 MB
of swap.

### Length costs more than linearly

The same machine, the same model, two audio lengths:

| Audio | RTF | Peak video memory |
|---|---|---|
| 60 s | 0.111 | 19298 MB |
| 1049 s | 0.223 | 22134 MB |

Seventeen times the audio doubles the real-time factor and adds 2.8 GB. Attention
grows with the square of sequence length and the key-value cache grows linearly —
57.3 KB per token for this decoder — so the "sixty minutes in one pass" claim is about
what fits in the context window, not about a cost that stays flat.

### Accuracy

Every machine's transcript was scored, by MeetEval, against AMI's manual word
annotation for the same meeting. Scoring all three was not the plan; it became the
plan once the first two disagreed.

| Machine | Numerics | WER | cpWER | tcpWER | Segments |
|---|---|---|---|---|---|
| RTX 4090 | `bfloat16` | 17.88% | 17.51% | 18.18% | 152 |
| DGX Spark | `bfloat16` | 17.66% | 17.17% | 17.51% | 153 |
| MacBook M1 | `int4/mlx` | 17.47% | 17.28% | 17.66% | 149 |
| *Published* | *`ami_test`* | *17.20%* | *none* | *none* | — |

**Two machines running the same checkpoint at the same precision produced different
transcripts.** `bfloat16` carries little enough precision that a different kernel or a
different reduction order flips a token, and one flipped token changes everything
decoded after it. The 4090 ran PyTorch 2.11.0+cu128 on AD102 and the Spark ran
2.14.0+cu130 on GB10, because GB10 is `sm_121` and no cu128 wheel exists for aarch64.
So the common assumption that accuracy need be measured only once — same weights, same
input, same output — does not hold here. The spread is small enough to be treatable as
noise, but that is a measured conclusion rather than an assumption.

**The 4-bit build is not the worst row.** Its three figures land inside the range the
two `bfloat16` machines already span, and on WER it is the best of the three. Whatever
4-bit quantization cost this model in words, it is smaller than the difference between
two CUDA machines running the reference checkpoint. `mlx-community` publishes no
evaluation numbers for any of its converted builds, so this is the only figure of its
kind here.

That conclusion depended on having two baselines. Measured alone, 17.47% against a
published 17.20% would have read as a 0.27-point quantization penalty.

**17.88% against a published 17.20% is the setup checking out, not a finding.** The
Open ASR Leaderboard table on the `microsoft/VibeVoice-ASR-HF` model card gives
`ami_test` 17.20%, average 7.77% across eight datasets, and RTFx 51.80. AMI is the
worst row in that table and it belongs in the body, because a meeting transcriber is
exactly what AMI measures. The leaderboard scores pre-segmented utterances; this is a
whole meeting decoded in one pass, a harder problem, and the card does not state which
microphone condition its row used. Agreement this close under conditions that differ
this much means the pipeline is sound — the only reason to have measured it, since the
timing figures above would look identical if the model had been producing nonsense.

**tcpWER stays within 0.67 points of cpWER on every machine, and that gap is the size
of the timestamp error.** Adding a time constraint barely moves the score, so the model
places words close to where it says they are. No published figure exists for either
metric.

Two normalisations, both applied to reference and hypothesis alike:

| Step | Effect |
|---|---|
| `EnglishTextNormalizer` | the normaliser the Open ASR Leaderboard applies |
| Non-speech segments dropped | 26 of 179, such as `[Breathing]` and `[Music]`; AMI does not transcribe these and each would otherwise count as an inserted word |

### Published RTFx is not this table's RTF

The leaderboard's RTFx 51.80 is the reciprocal of RTF 0.0193. The 4090 here measures
RTF 0.223, which is RTFx 4.49 — twelve times apart, on conditions that share almost
nothing: short pre-segmented clips against a 17.5-minute single pass, batched
throughput against `batch: 1`, their hardware against ours. The two belong in the same
report and not in the same column.

## 5. Limits

**Sixty minutes is a context-window claim, not a memory claim.** 17.5 minutes already
peaked at 22134 MB on a 24564 MB card. The key-value cache grows at 57.3 KB per token,
so an hour of audio at 27000 acoustic tokens plus text will not fit in 24 GB. Whether
this machine can do what the model card says it can do is an open question this run
does not settle.

**A 6 GB card cannot run it, quantized or not.** An RTX 4050 Laptop with 6141 MiB was
measured out of the table by arithmetic rather than by a failed run: `nf4` on the
backbone leaves 3.65 GB, the modules that cannot be quantized without wrecking waveform
reconstruction add 3.21 GB, and 6.86 GB of weights does not fit in 6.00 GB before a
single activation. Quantizing `lm_head` as well still lands at 6.05 GB. The only
configuration that fits offloads to system memory, which measures the offload rather
than the machine.

**A 16 GB Mac needs a converted build.** `mlx-community` publishes 17.35 GB at
`bf16`, 9.52 GB at 8-bit and 5.71 GB at 4-bit; the 4-bit build ran here with 332 MB of
swap. bitsandbytes cannot produce that build — it compiles CUDA kernels only — so the
route is MLX and the row that results is not directly comparable to the CUDA rows.

**The two machines cannot run the same PyTorch.** GB10 is `sm_121` and needs CUDA 13;
no cu128 wheel is published for aarch64. Part of the 1.6 GB memory difference between
the 4090 and the Spark belongs to the build rather than the hardware, and this run does
not separate them.

**Licence and usage scope.** The model card states: *"This project is licensed under
the MIT License."* It states no out-of-scope use, no deployment restriction and no
responsible-AI limitation. That absence is worth naming rather than passing over — an
unchecked field and a checked, clean field read identically otherwise.

## 6. Links

| What | Where |
|---|---|
| Example | `examples/showcase/speaker-diarization-vibevoice` |
| Model card | https://huggingface.co/microsoft/VibeVoice-ASR |
| Leaderboard figures | https://huggingface.co/microsoft/VibeVoice-ASR-HF |
| Technical report | https://arxiv.org/abs/2601.18184 |
| Open ASR Leaderboard | https://arxiv.org/abs/2510.06961 |
| MeetEval | https://github.com/fgnt/meeteval |
| AMI corpus | https://groups.inf.ed.ac.uk/ami/corpus/ |
| X thread drafted from this report | `docs/reports/2026-09-12-vibevoice-asr.social.md` |
