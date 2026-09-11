# Transcribe a Long Meeting

## Overview

This example transcribes a long recording — a meeting, an interview, a podcast — with
Microsoft's `VibeVoice-ASR`, a non-streaming speech-to-text checkpoint built to process up
to an hour of audio in a single pass rather than in externally chunked windows. The
purpose-built screen is a speaker-coloured timeline sitting above a segment list: dropping
one audio file in produces a set of `{ text, start_time, end_time, speaker_id }` segments,
and the screen renders each speaker as its own colour across both the timeline and the
list so a reader can see who spoke when without reading a single line of the transcript.
A hotword field feeds `context_info` for domain vocabulary the model would otherwise
mishear.

## Preparation and prerequisites

- `model-compose` installed and available on `PATH`.
- 16GB+ RAM; a GPU is strongly recommended for the 7B-class checkpoint. CPU-only inference
  works but is slow.
- Around 20GB of free disk space for the checkpoint download and cache on first run.
- No account, token, or external service is required — the model runs entirely offline
  once downloaded, and the only input is a local audio file dropped into the page.

## Environment configuration

This example reads no `.env` variables. Every setting the workflow exposes —
`context_info`, decoding parameters — is either passed from the page or left at the
default already baked into `model-compose.yml`.

## How to run

```bash
cd examples/showcase/transcribe-long-meeting
model-compose up
```

Open the web UI at `http://localhost:8081`. The first run downloads the checkpoint, which
can take several minutes depending on connection speed; subsequent runs start from the
local cache.

## API

The static page is a WebSocket client over `run_workflow`, not a CLI or a curl example.
It calls the `transcribe-meeting` workflow with:

```json
{
  "audio": "<streamed file>",
  "context_info": "Microsoft,VibeVoice"
}
```

and receives, on completion:

```json
{
  "transcription": [
    { "text": "Let's start with the quarterly numbers.", "start_time": 0.0, "end_time": 2.8, "speaker_id": 0 }
  ]
}
```

That is the shape this repository's own `speech-to-text-vibevoice` README documents. The
Transformers model documentation instead shows `processor.decode(...,
return_format="parsed")` returning `{ Start, End, Speaker, Content }` for the same model.
Which shape `model-compose` actually hands the page is not settled until a real
`model-compose up` run produces output — see "How it works" below. The page never reads
either shape directly: `ui/src/segments.js` exports a single adapter,
`segmentsFromResponse`, that normalises whichever shape arrives into
`{ text, startTime, endTime, speakerId }` before any rendering code sees it, so the day
the real shape is confirmed, one function changes rather than every module that draws a
segment.

## Input parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `audio` | audio | Yes | — | The recording to transcribe (MP3, WAV, FLAC, etc.) |
| `context_info` | text | No | — | Comma-separated hotwords that bias recognition toward domain vocabulary, e.g. `Microsoft,VibeVoice` |

## How it works

`VibeVoice-ASR`'s acoustic tokenizer runs at a 7.5 Hz frame rate, which is what lets a
64K-token language model span roughly an hour of audio in one context window. "Single-pass"
describes the pipeline, not the tokenizer: internally, the model still chunks audio into
60-second segments and caches the convolution states between each segment, but no chunk
boundary resets context — the states carry across, so the language model sees the whole
recording as one continuous span rather than a series of independently-decided windows.
That is a different kind of number from Whisper's 30-second window: Whisper's limit is an
architectural constant fixed by what the encoder was trained on, while VibeVoice's
60-second internal chunk size is a runtime memory parameter the documentation invites you
to lower on constrained hardware — a value that could not be user-adjustable if it changed
the result. Neither number touches the frame rate that determines how much audio a single
context window can hold.

The speaker-coloured timeline is what makes that single continuous pass visible: every
segment the model returns carries a `speaker_id`, and the screen turns that into a
horizontally-scrollable strip of coloured blocks positioned by their real start and end
times, with a matching colour on every segment's row in the list beside it. A plainer
screen — a scrolling text transcript with speaker names inline — would show the same data
without showing the shape of the conversation: who talks over whom, how long each turn
runs, where the silences fall. Every colour on the timeline is derived from the single
`--accent` design token with a CSS `hue-rotate` filter rather than a hand-picked palette,
so the screen tells speakers apart without inventing new colours outside the design
system's own scale.
