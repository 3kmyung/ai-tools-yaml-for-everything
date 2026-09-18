## 포스트 1

✓

```
🎙️ A one-hour meeting, transcribed in 4 minutes

✅ Offline on a laptop
✅ No API key
✅ Nothing uploaded

Whisper large-v3 is OpenAI's speech recognition model, 1.5B parameters and 109k stars.
This run quantizes the decoder to 4 bits, which is what fits it on a laptop.
```

✓

```
🎹 A 12-bar chord chart in, 3 minutes of audio out, 40 seconds of compute

✅ One GPU under a desk
✅ Nothing left the machine

YuE comes from HKUST and M-A-P, 9.6k stars.
It writes vocals and backing together, so the singing is generated against the track, not over it.
```

✓

```
🖼️ The cloud is just someone else's computer, and this never touched one

✅ 12 images in 90 seconds
✅ No subscription, no credits, no queue
✅ Offline from prompt to file

FLUX.1 comes from Black Forest Labs, the Stable Diffusion team, 26k stars.
This run is the 4-bit build.
```

✗

```
I built an example using Whisper large-v3, a speech recognition model that runs locally.
github.com/hanyeol/model-compose
```

✗

```
🎙️🚀 Transcribes a one-hour meeting in 4 minutes.
Real-time factor 0.08, 14.2 GB peak video memory.
```

✗

```
🎙️ A one-hour meeting, transcribed in 4 minutes

✅ RTF 0.08
✅ 14.2 GB peak video memory
✅ 121 Tokens/s on the 4090

Whisper large-v3 is OpenAI's speech recognition model.
```

## 포스트 2

✓

```
Hand it a meeting recording and get back a markdown summary with timestamps.
Decisions and action items come out as their own lines, and the small talk does not make it in.
```

✓

```
It reads a scanned report and returns markdown with the tables still tables.
A page of figures stays a page of figures instead of collapsing into a wall of text.
```

✓

```
Give it a chord chart and lyrics and it returns a finished track.
The first bars come back while the rest is still rendering, so you know early whether the take is worth keeping.
```

✗

```
The workflow is three components in one YAML file, and model-compose runs it with one command.
```

✗

```
Check out the video below 👇
This seamless pipeline unlocks next-level transcription.
```

✗

```
It beats every cloud API on accuracy and it is completely free.
```

## 포스트 3

✓

```
🎬 A two-hour podcast, summarized with timestamps, recorded at the speed it ran
```

✓

```
🖼️ Twelve images from one prompt, 90 seconds start to finish
```

✓

```
📄 The markdown it wrote, unedited
```

✗

```
Watch the magic happen below 👇🔥
```

✗

```
Real-time in the GIF, and just as fast on any laptop
```

✗

```
🎬 Rendered in 12 seconds flat
```

## 포스트 4

✓

```
The same 30-minute clip on three machines, fastest first.

RTX 4090 | whisper-large-v3 | 0.08 Output RTF
DGX Spark | whisper-large-v3 | 0.12 Output RTF
MacBook M1 | whisper-large-v3-4bit | 0.31 Output RTF

Greedy decoding, fp16 on the desktop cards and 4-bit on the MacBook.
```

✓

```
The same prompt on three machines, fastest first.

RTX 4090 | qwen3-8b | 121 Tokens/s
DGX Spark | qwen3-8b | 94 Tokens/s
MacBook M1 | qwen3-8b-4bit | 38 Tokens/s

Batch size 1, 512 tokens out, greedy decoding.
```

✓

```
The same 240-page scan on three machines, fastest first.

RTX 4090 | dots-ocr | 0.67 Pages/s
DGX Spark | dots-ocr | 0.41 Pages/s
MacBook M1 | dots-ocr-4bit | 0.08 Pages/s

200 DPI, batch size 4, greedy decoding.
```

✗

```
Machine | Model | Value
--- | --- | ---
RTX 4090 | qwen3-8b | 121 Tokens/s
DGX Spark | qwen3-8b | 94 Tokens/s
MacBook M1 | qwen3-8b-4bit | 38 Tokens/s
```

✗

```
MacBook M1 | qwen3-8b-4bit | 38 tok/sec
DGX Spark | qwen3-8b | 94 tok/sec
RTX 4090 | qwen3-8b | 121 tok/sec
```

✗

```
The same 30-minute clip on three machines, fastest first.

RTX 4090 | whisper-large-v3 | 0.08 Output RTF
DGX Spark | whisper-large-v3 | 0.12 Output RTF
MacBook M1 | whisper-large-v3-4bit | 0.31 Output RTF
```

## 포스트 5

✓

```
The YAML that ran all of this is one file in the repo.

➡️ github.com/hanyeol/model-compose
```

✓

```
Every workflow in this thread is one file, and that file is in the repo.

➡️ github.com/hanyeol/model-compose
```

✓

```
Every number in this thread came off machines I own, and the file that ran them is public.

➡️ github.com/hanyeol/model-compose
```

✗

```
➡️ github.com/hanyeol/model-compose
➡️ huggingface.co/openai/whisper-large-v3
```

✗

```
➡️ The YAML that ran all of this is one file in the repo.

github.com/hanyeol/model-compose
```

✗

```
➡️ github.com/hanyeol/model-compose/tree/main/releases/meeting-transcriber
```
