## 포스트 1

✓

```
🎙️ A one-hour meeting, transcribed in 4 minutes

Whisper large-v3 keeps up with heavy accents and 99 languages.
Every line comes back timestamped, so finding a line takes one click.
OpenAI's open model, 109k stars on GitHub.

✅ Offline on a laptop, nothing uploaded
```

✓

```
🎹 Lyrics and a genre in, a full song with a singer out

YuE is one of the few open music models that sings.
It writes the voice and the band together, so the vocal sits on the beat.
One line of text sets the genre, mood and voice.

✅ One GPU, nothing left the machine
```

✓

```
🖼️ 12 images from one prompt, and none of them left the machine

FLUX.1 draws hands with five fingers and spells shop signs right, two things open image models kept missing.
Made by the team behind Stable Diffusion.

✅ 12 images in 90 seconds, no credits
```

✗

```
I built an example using Whisper large-v3, a speech recognition model that runs locally.
github.com/hanyeol/model-compose
```

✗

```
🎙️ A one-hour meeting, transcribed in 4 minutes

Whisper large-v3 is OpenAI's speech recognition model.

✅ RTF 0.08, 14.2 GB peak video memory, 121 Tokens/s on the 4090
```

## 포스트 2

✓

```
Hand it a meeting recording and get back a markdown summary with timestamps.
Decisions and action items come out as their own lines, and the small talk does not make it in.
Two people talking at once land in one line, since nothing here tells speakers apart.
```

✓

```
It reads a scanned report and returns markdown with the tables still tables.
A page of figures stays a page of figures instead of collapsing into a wall of text.
Two-column pages keep their reading order.
Handwritten notes in the margin come back rough.
```

✓

```
Give it lyrics and a genre and it returns a finished track.
The first bars come back while the rest is still rendering, so you know early whether the take is worth keeping.
Tag the lyrics "[verse]" and "[chorus]", about 30 seconds of singing each, or the song loses its shape.
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

Greedy decoding, fp16 on the RTX 4090 and DGX Spark, 4-bit on the MacBook.
```

✓

```
The same prompt on three machines, fastest first.

RTX 4090 | qwen3-8b | 121 Tokens/s
DGX Spark | qwen3-8b | 94 Tokens/s
MacBook M1 | qwen3-8b-4bit | 38 Tokens/s

Batch size 1, 512 tokens out, greedy decoding.
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
