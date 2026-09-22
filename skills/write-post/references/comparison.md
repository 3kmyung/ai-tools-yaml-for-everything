## 스레드

같은 작업을 로컬(Local) 모델(Model)과 클라우드 서비스(Cloud Service)의 모델로 비교하는 포스트 6개다. 비교할 클라우드 서비스가 요청에 없으면 `AskUserQuestion`으로 묻는다.

| 포스트 | 내용 |
| :---: | --- |
| 1 | 두 결과물을 비교하게 만드는 캡션 |
| 2 | 클라우드 서비스의 모델이 아닌 로컬 모델만 소개하는 산문, 핵심 장점 체크리스트 한 줄 |
| 3 | 이것으로 무엇을 할 수 있는지, 독자가 체감하는 장점 |
| 4 | GIF에 보이는 실제 입력과 결과를 담은 캡션 |
| 5 | 로컬 모델의 기계별 숫자 행과 그 행들의 조건, 기계당 한 행, 숫자는 README 콜아웃(Callout)이 읽은 처리량 열 |
| 6 | `model-compose` 링크 |

`releases/<example>/comparison.md`에 아래 틀대로 쓴다. 포스트마다 본문과 첨부 줄을 언어 태그 없는 코드 블록(Code Block) 하나에 넣고, `분량 검사`에는 첨부 줄을 빼고 넘긴다.

````
## 포스트 1

```
<포스트 1>

[output](<local.mp4|jpg|gif>)
[output](<cloud.mp4|jpg|gif>)
```

## 포스트 2

```
<포스트 2>
```

## 포스트 3

```
<포스트 3>
```

## 포스트 4

```
<포스트 4>

[image](<recording.gif>)
```

## 포스트 5

```
<포스트 5>
```

## 포스트 6

```
<포스트 6>
```
````

## 예시

### 포스트 1

✓

```
🎧 YuE vs. Suno, same lyrics and genre
```

✓

```
🎙️ Whisper large-v3 on a laptop vs. OpenAI's API, one hour of audio
```

✓

```
🖼️ 4-bit FLUX on a desk GPU vs. Midjourney, same prompt
```

✗

```
🖼️ Can you tell which one is AI?
```

✗

```
🎧 YuE on the left sounds better, obviously
```

✗

```
Suno is dead. YuE runs locally and beats it for free.
```

✗

```
🎧 Same lyrics, same genre, two songs. One came from Suno, the other from a GPU under my desk. Listen before you guess.
```

### 포스트 2

✓

```
Whisper large-v3 is the open model from the family behind OpenAI's speech API.
It keeps up with heavy accents and 99 languages, and every line comes back timestamped.
This run uses a 4-bit decoder.

✅ 4 minutes on a laptop, nothing uploaded
```

✓

```
YuE is one of the few open music models that sings.
It writes the voice and the band together, so the vocal sits on the beat.
One line of text sets the genre, mood and voice.
Apache-2.0, 9.7k stars.

✅ No account, no credits, nothing uploaded
```

✗

```
🎙️ Whisper large-v3 vs OpenAI API

0.08 RTF vs $0.006 per minute
```

✗

```
Suno is the closed one everyone compares against.
YuE is one of the few open ones that sings.
```

### 포스트 3

✓

```
Hand it a meeting recording and get back a markdown summary with timestamps.
Decisions and action items come out as their own lines, and the small talk does not make it in.
Two people talking at once land in one line, since nothing here tells speakers apart.
```

✓

```
Give it lyrics and a genre and it returns a finished track.
Tag the lyrics "[verse]" and "[chorus]", about 30 seconds of singing each, or the song loses its shape.
Rerun the same lyrics as often as you like, since nothing is counting credits.
```

✗

```
It beats every cloud API on accuracy and it is completely free.
```

✗

```
Cloud APIs are a privacy nightmare. Local is the future.
```

✗

```
Suno returns a song in under a minute, YuE takes three.
```

### 포스트 4

✓

```
🎬 A one-hour town hall in, a timestamped summary out
```

✓

```
🪗 A sea shanty from eight lines of lyrics, 2 min 10 s of song out
```

✗

```
🎹 Style and lyrics in, a score and a song out
```

✗

```
🎬 The local run, recorded at the speed it ran
```

✗

```
Watch the magic happen below 👇🔥
```

✗

```
Real-time in the GIF, and just as fast on any laptop
```

### 포스트 5

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
The same lyrics and genre on two machines, fastest first.

RTX 4090 | YuE-s1-7B | 3 min 10 s per song
RTX 4070 Laptop | YuE-s1-7B-4bit | 11 min 40 s per song

2 verses and 1 chorus, 90 s of audio out.
```

✗

```
RTX 4090 | whisper-large-v3 | 0.08 Output RTF
OpenAI API | whisper-1 | $0.006 per minute
```

✗

```
Machine | Model | Value
--- | --- | ---
RTX 4090 | YuE-s1-7B | 3 min 10 s per song
RTX 4070 Laptop | YuE-s1-7B-4bit | 11 min 40 s per song
```

✗

```
The same 30-minute clip on three machines, fastest first.

RTX 4090 | whisper-large-v3 | 0.08 Output RTF
DGX Spark | whisper-large-v3 | 0.12 Output RTF
MacBook M1 | whisper-large-v3-4bit | 0.31 Output RTF
```

### 포스트 6

✓

```
Try your own lyrics next and hear what comes out.

➡️ github.com/hanyeol/model-compose
```

✓

```
No API key, no subscription, and no cap on how many songs you make.

➡️ github.com/hanyeol/model-compose
```

✓

```
Cancel your Suno plan and run it yourself.

➡️ github.com/hanyeol/model-compose
```

✗

```
➡️ github.com/hanyeol/model-compose
➡️ platform.openai.com/docs/guides/speech-to-text
```

✗

```
➡️ The YAML that ran the local side is one file in the repo.

github.com/hanyeol/model-compose
```
