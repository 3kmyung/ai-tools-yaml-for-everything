## 스레드

로컬(Local) 모델(Model) 하나를 소개하는 포스트 4개다.

| 포스트 | 내용 | 첨부 |
| :---: | --- | --- |
| 1 | 독자의 문제를 묻는 질문, 사용 권유, 데모 GIF 속 입력과 결과 캡션 | 데모 GIF |
| 2 | 모델 소개(e.g., 입력과 출력, 차별점, 모드), 사실 체크리스트 | |
| 3 | 모델 성능(e.g., 속도 질문, 조건, 기계별 숫자 행) | |
| 4 | 무제한 반복, 비개발자에게 AI 어시스턴트(AI Assistant)로 실행하라는 안내, `github.com/MindrLabs/<example>` | |

- 체크리스트는 라이선스(License), 체크포인트(Checkpoint) 크기, 스타(Star) 수를 이은 `✅` 한 줄
- 숫자 행은 기계당 한 행, 값은 README 콜아웃(Callout)이 읽은 처리량 열

## 예시

### 포스트 1

✓

```
Still uploading meeting recordings to get a transcript?

Give Whisper large-v3 a try.

🎙️ A one-hour town hall in, a timestamped transcript out
```

✓

```
Want a summary of a scanned report without sending it anywhere?

Give Qwen3-VL a try.

📄 A 40-page scan in, markdown with the tables still tables out
```

✗

```
I built an example using Whisper large-v3, a speech recognition model that runs locally.

github.com/hanyeol/model-compose
```

✗

```
Watch the magic happen below 👇🔥
```

### 포스트 2

✓

```
Whisper large-v3 is the open speech model from OpenAI.

It keeps up with heavy accents and 99 languages, and every line comes back timestamped.

✅ MIT · 3.09 GB checkpoint · 109K stars
```

✓

```
YuE2-3B is an open music model that can sing.

Give it a style prompt and lyrics, and it generates 48 kHz stereo audio with vocals and instruments together.

It can plan an ABC score first, or generate audio directly.

✅ CC BY-NC 4.0 · 7.30 GB checkpoint · 10K stars
```

✗

```
Whisper large-v3 is OpenAI's speech recognition model.
It keeps up with heavy accents and 99 languages.

✅ RTF 0.08, 14.2 GB peak video memory, 121 Tokens/s on the 4090
```

✗

```
The workflow is three components in one YAML file, and model-compose runs it with one command.
```

### 포스트 3

✓

```
So how fast is it?

Same 30-minute clip, three machines; fastest first.

🔥 RTX 4090 | whisper-large-v3 | 0.08 Output RTF
💻 DGX Spark | whisper-large-v3 | 0.12 Output RTF
💻 MacBook M1 | whisper-large-v3-4bit | 0.31 Output RTF

Greedy decoding, fp16 on the RTX 4090 and DGX Spark, 4-bit on the MacBook.
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
So how fast is it?

Same prompt, three machines; fastest first.

💻 MacBook M1 | qwen3-8b-4bit | 38 tok/sec
💻 DGX Spark | qwen3-8b | 94 tok/sec
🔥 RTX 4090 | qwen3-8b | 121 tok/sec
```

### 포스트 4

✓

```
And you can transcribe as many hours as you want.

Drop in a whole season of a podcast; there is no per-minute bill.

Not a developer?

Just send the link below to Claude or ChatGPT; ask it to run Whisper for you.

➡️ github.com/MindrLabs/speech-recognition-whisper
```

✗

```
Clone it and point it at your own recordings tonight.

➡️ github.com/MindrLabs/speech-recognition-whisper
➡️ huggingface.co/openai/whisper-large-v3
```

✗

```
And you can transcribe as many hours as you want.

Not a developer?

Just send the link below to Claude or ChatGPT; ask it to run Whisper for you.

➡️ github.com/hanyeol/model-compose/tree/main/releases/meeting-transcriber
```
