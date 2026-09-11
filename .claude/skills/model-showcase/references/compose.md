# compose.md

Step 2 (mapping) and step 4 (generating `model-compose.yml`).

## Picking the task and the base example

- Model tasks live under `src/mindor/core/component/services/model/tasks/`, one directory
  per task (`speech_to_text`, `text_to_speech`, `image_to_video`, and so on). Match the
  researched model's input and output shape against these names first — the task decides
  the driver, and the driver decides the shape of the `action` block.
- Never write a component block from scratch. Search `examples/model-tasks/` for the
  example nearest the chosen task and copy its `component:` block whole, adjusting only
  `model:`, `precision:`, and `action:`. Speech-to-text already has an example for every
  VibeVoice checkpoint family (`speech-to-text-vibevoice`,
  `speech-to-text-vibevoice-streaming`); a new speech-to-text model starts from whichever
  is nearer in checkpoint shape, not from the task documentation. A hand-written block
  encodes driver wiring — model loading, hardware dispatch, the shape of `action:` — that
  only step 6's real run exercises; a mismatch there surfaces tens of minutes into the one
  step this skill cannot self-certify, not as a fast-loop failure that costs seconds.

## The static webui, always

`controller.webui.driver` is `static` with `static_dir: ./ui`:

```yaml
controller:
  webui:
    driver: static
    static_dir: ./ui
```

Gradio is what `examples/model-tasks/` uses; a showcase example never uses it. The whole
point of `model-showcase` is a purpose-built screen for one model's distinguishing
mechanism, and Gradio's generic component set is the opposite of that.

## Every UI-facing workflow needs an `id`

The static UI reaches a workflow through `run_workflow` over the WebSocket endpoint,
which addresses workflows by `id`. An example copied from `examples/model-tasks/`
typically has no `id`, because Gradio does not need one — adding it is part of adapting
the base example, not an optional cleanup.

A single workflow's `id` lives happily under either key: the singular `workflow:` key
takes one mapping, and the loader wraps that mapping in a list on its own — no plural
required. Only a *list* of workflow mappings forces the plural key; writing a list under
the singular `workflow:` key double-wraps it instead — `workflows: [[{...}]]`, which
fails validation. Once an example needs more than one workflow, the plural `workflows:`
key takes the list directly, and every workflow inside it needs its own `id`:

```yaml
workflows:
  - id: transcribe-meeting
    title: Transcribe a Long Meeting
    description: ...
    job:
      input: ${input}
      output:
        transcription: ${output as json}
```

Every example that already addresses a workflow by `id` uses this plural form anyway,
even though each carries only one workflow —
`examples/showcase/find-person-scenes/model-compose.yml:10` and
`examples/media-processing/youtube-to-playlist-video/model-compose.yml:11` are both
`workflows:` with a single-item list under it, never `workflow:` with a mapping under it.
Match that convention for a new example too, regardless of how many workflows it has.

## Do not rewrite `ui/src/websocket-client.js`

Copy it verbatim from
`examples/media-processing/youtube-to-playlist-video/ui/src/websocket-client.js`. Its
`stream_pull` backpressure, its post-reconnect task resubscription, and its binary chunk
framing are the model-compose WebSocket protocol itself, not a design decision this skill
gets to make per example. Regenerating that file from prose produces protocol bugs that a
fixture-driven fast loop cannot catch, because the fast loop never opens a WebSocket.

File drop needs no new work on top of the copy: `streamFile(file)` in that client already
builds the `__variable__` stream descriptor the server pulls from. A showcase example
that accepts a local file upload calls it as-is.

## Directory naming: verb-object

`examples/showcase/` holds `find-person-scenes`, `upscale-video`, `analyze-disk-usage`,
`make-inspiring-quote-voice`, `echo-server`, and `vibevoice-realtime-tts`. Four of the six
are verb-object; `vibevoice-realtime-tts` is the outlier, named after the model rather
than the capability. Name every new directory verb-object — `transcribe-long-meeting`,
not `vibevoice-asr-demo` — because an example sells what it lets someone do, and the
model behind it is an implementation detail that can change.

## The fixture lives behind an adapter

The output schema of a model task is not reliably knowable before the step 6 real run.
One model can document two shapes at once:

| Source | Output shape |
|---|---|
| This repository's `speech-to-text-vibevoice` README | `{ text, start_time, end_time, speaker_id }[]` |
| The Transformers model doc, same model, `processor.decode(..., return_format="parsed")` | `{ Start, End, Speaker, Content }` |

Rather than betting the whole UI on one of those shapes, put one adapter function
between the fixture (or the real WebSocket payload) and the render functions:

```javascript
function segmentsFromResponse(response) {
  return response.map((segment) => ({
    text: segment.text ?? segment.Content,
    startTime: segment.start_time ?? segment.Start,
    endTime: segment.end_time ?? segment.End,
    speakerId: segment.speaker_id ?? segment.Speaker,
  }));
}
```

When step 6 settles which shape the real run actually produces, this one function
changes — render functions, the fixture's own shape, and every other module stay as they
are.
