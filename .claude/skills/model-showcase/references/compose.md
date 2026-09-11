# compose.md

Step 2 (mapping) and step 4 (generating `model-compose.yml`).

## Picking the task and the base example

The model tasks live under
`src/mindor/core/component/services/model/tasks/` — one directory per task
(`speech_to_text`, `text_to_speech`, `image_to_video`, and so on). Match the researched
model's input and output shape from step 1 against these task names first; the task
decides the driver, and the driver decides the shape of the `action` block.

Do not write a component block from scratch. Search `examples/model-tasks/` for the
example nearest the chosen task and copy its `component:` block whole, then adjust the
`model:`, `precision:`, and `action:` fields to the researched model. `speech-to-text`
already has an example for every VibeVoice checkpoint family
(`speech-to-text-vibevoice`, `speech-to-text-vibevoice-streaming`); a new speech-to-text
model starts from whichever of those is nearer in checkpoint shape, not from the task
documentation.

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

The static UI reaches a workflow through `run_workflow` over the WebSocket endpoint, which
addresses workflows by `id`. An example copied from `examples/model-tasks/` typically has
no `id` on its workflow, because Gradio does not need one — adding it is part of adapting
the base example, not an optional cleanup:

```yaml
workflow:
  - id: transcribe-meeting
    title: ...
```

## Do not rewrite `ui/src/websocket-client.js`

Copy it verbatim from
`examples/media-processing/youtube-to-playlist-video/ui/src/websocket-client.js`. Its
`stream_pull` backpressure, its post-reconnect task resubscription, and its binary chunk
framing are the model-compose WebSocket protocol itself, not a design decision this skill
gets to make per example. Regenerating that file from prose produces protocol bugs that a
fixture-driven fast loop cannot catch, because the fast loop never opens a WebSocket.

File drop needs no new work on top of the copy: `streamFile(file)` in that client already
builds the `__variable__` stream descriptor the server pulls from. A showcase example that
accepts a local file upload calls it as-is.

## Directory naming: verb-object

`examples/showcase/` holds `find-person-scenes`, `upscale-video`, `analyze-disk-usage`,
`make-inspiring-quote-voice`, `echo-server`, and `vibevoice-realtime-tts`. Four of the six
are verb-object; `vibevoice-realtime-tts` is the outlier, named after the model rather
than the capability. Name every new directory verb-object —
`transcribe-long-meeting`, not `vibevoice-asr-demo` — because an example sells what it
lets someone do, and the model behind it is an implementation detail that can change.

## The fixture lives behind an adapter

The output schema of a model task is not reliably knowable before the step 6 real run.
This repository's own `speech-to-text-vibevoice` README documents
`{ text, start_time, end_time, speaker_id }[]`, while the Transformers model doc for the
same model shows `{ Start, End, Speaker, Content }` coming out of
`processor.decode(..., return_format="parsed")`. Rather than betting the whole UI on one
of those shapes, put one adapter function between the fixture (or the real WebSocket
payload) and the render functions:

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

When step 6 settles which shape the real run actually produces, this one function changes
— render functions, the fixture's own shape, and every other module stay as they are.
