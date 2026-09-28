## 스레드

같은 작업을 로컬(Local) 모델(Model)과 클라우드 서비스(Cloud Service)의 모델로 비교하는 포스트 4개다. 비교할 클라우드 서비스가 요청에 없으면 `AskUserQuestion`으로 묻는다.

| 포스트 | 내용 | 첨부 |
| :---: | --- | --- |
| 1 | 클라우드 대안을 찾는지 묻는 질문, 사용 권유, 비교 캡션 | 로컬 결과물, 클라우드 결과물 |
| 2 | 로컬 모델 소개(e.g., 입력과 출력, 차별점, 모드), 사실 체크리스트 | 데모 GIF |
| 3 | 로컬 모델 성능(e.g., 속도 질문, 조건, 기계별 숫자 행) | |
| 4 | 무제한 반복, 비개발자에게 AI 어시스턴트(AI Assistant)로 실행하라는 안내, `github.com/MindrLabs/<example>` | |

- 체크리스트는 라이선스(License), 체크포인트(Checkpoint) 크기, 스타(Star) 수를 이은 `✅` 한 줄
- 숫자 행은 기계당 한 행, 값은 README 콜아웃(Callout)이 읽은 처리량 열

## 예시

### 포스트 1

✓

```
Anyone else looking for a Suno alternative?

Give YuE2 a try.

🎧 YuE2 running on your own machine vs. Suno; same lyrics, same style
```

✓

```
Anyone else tired of paying OpenAI by the minute for transcripts?

Give Whisper large-v3 a try.

🎙️ Whisper running on your own laptop vs. OpenAI's API; same hour of audio
```

✗

```
🎧 YuE2 on your own machine vs. Suno, same lyrics and style
```

✗

```
OpenAI's API is dead. Whisper runs locally and beats it for free.

🎙️ Read both and guess which one came from the cloud
```

### 포스트 2

✓

```
YuE2-3B is an open music model that can sing.

Give it a style prompt and lyrics, and it generates 48 kHz stereo audio with vocals and instruments together.

It can plan an ABC score first, or generate audio directly.

✅ CC BY-NC 4.0 · 7.30 GB checkpoint · 10K stars
```

✓

```
Whisper large-v3 is the open model from the family behind OpenAI's speech API.

It keeps up with heavy accents and 99 languages, and every line comes back timestamped.

✅ MIT · 3.09 GB checkpoint · 109K stars
```

✗

```
YuE2-3B is an open music model that sings.
A style prompt and lyrics come back as 48 kHz stereo, vocal and band together.
CC BY-NC 4.0, 7.30 GB checkpoint, 10k stars.

✅ No account, no credits, nothing uploaded
```

✗

```
Suno is the closed one everyone compares against.

YuE2 is one of the few open ones that sings.
```

### 포스트 3

✓

```
So how fast is it?

Same lyrics, three machines; fastest first.

🔥 RTX 4090 | YuE2-3B | 0.361 Output RTF
💻 DGX Spark | YuE2-3B | 1.46 Output RTF
💻 MacBook M1 | YuE2-3B | 13.0 Output RTF

Medians over 20 lyric sets on the RTX 4090 and DGX Spark, and 1 on the MacBook, with VAE decoding on CPU.
```

✗

```
The same lyrics on three machines, fastest first.

RTX 4090 | YuE2-3B | 0.361 Output RTF
DGX Spark | YuE2-3B | 1.46 Output RTF
MacBook M1 | YuE2-3B | 13.0 Output RTF
```

✗

```
So how fast is it?

Same lyrics; local vs. cloud.

🔥 RTX 4090 | YuE2-3B | 0.361 Output RTF
☁️ Suno | v4.5 | about 30 s per song
```

### 포스트 4

✓

```
And you can iterate as much as you want.

Change a word in the style prompt and run it again; there are no credits to burn.

Not a developer?

Just send the link below to Claude or ChatGPT; ask it to run YuE2 for you.

➡️ github.com/MindrLabs/music-generation-yue2
```

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
Write a chorus tonight and let your own machine sing it back.

➡️ github.com/MindrLabs/music-generation-yue2
```

✗

```
And you can iterate as much as you want.

Not a developer?

Just send the link below to Claude or ChatGPT; ask it to run YuE2 for you.

➡️ github.com/hanyeol/model-compose
```
