# compose.md

Step 2 (writing `model-compose.yml`).

## Picking the task and the base example

- Model tasks live under `src/mindor/core/component/services/model/tasks/`, one directory
  per task (`speech_to_text`, `text_to_speech`, `image_to_video`, and so on). Match the
  human's task answer against these names first — the task decides
  the driver, and the driver decides the shape of the `action` block.
- Never write a component block from scratch. Search `examples/model-tasks/` for the
  example nearest the chosen task and copy its `component:` block whole, adjusting only
  `model:`, `precision:`, and `action:`. Speech-to-text already has an example for every
  VibeVoice checkpoint family (`speech-to-text-vibevoice`,
  `speech-to-text-vibevoice-streaming`); a new speech-to-text model starts from whichever
  is nearer in checkpoint shape, not from the task documentation. A hand-written block
  encodes driver wiring — model loading, hardware dispatch, the shape of `action:` — that
  only the step 4 real run exercises; a mismatch there surfaces tens of minutes in, not as
  a validate failure that costs seconds.

## The static webui, always

`controller.webui.driver` is `static` with `static_dir: ./ui`:

```yaml
controller:
  webui:
    driver: static
    static_dir: ./ui
```

Gradio is what `examples/model-tasks/` uses; a release never uses it. `build-ui`
builds a purpose-built screen for each release, and Gradio's generic component set is the
opposite of that.

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
`releases/youtube-to-playlist-video/model-compose.yml:11` are both
`workflows:` with a single-item list under it, never `workflow:` with a mapping under it.
Match that convention for a new example too, regardless of how many workflows it has.

## Where a release goes

A release is its own directory, `releases/<task>-<model>/`, named task first and model
second the way `examples/model-tasks/` names things — `speaker-diarization-vibevoice`, not
`transcribe-long-meeting` or `vibevoice-asr-demo`.

```
✗ Adding the release to `examples/README.md`.
→ Leave `examples/` alone.
Why: `examples/` mirrors upstream, and a line added there conflicts on the next upstream
merge.
```
