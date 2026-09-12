# readme.md

Step 4. Three files, not one: `README.md`, `README.ko.md`, `README.zh-cn.md`, each a full
translation carrying the same sections in the same order. A release missing two
of the three is not partially documented; it is documented for one audience only.

## Section order

| # | Section | Content |
|---|---|---|
| 1 | Overview | One paragraph: what the model does, what this example demonstrates, and the demo angle chosen in step 3 |
| 2 | Preparation and prerequisites | What has to exist before `model-compose up` — accounts, tokens, downloaded weights, disk space |
| 3 | Environment configuration | `.env` variables the compose file reads, each with its purpose stated, following the `.env.sample` convention `examples/README.md` documents |
| 4 | How to run | The exact `model-compose up` invocation and the URL the static UI serves on |
| 5 | API | The workflow `id` the UI calls, and its input and output shape stated concretely, using the adapter's input shape from `compose.md` where it differs from the raw model output — a release's UI is a WebSocket client over `run_workflow`, not a CLI or a curl example |
| 6 | Input parameters | Every field the workflow's `action` block exposes, with type and default, mirroring the `job.input` / `Input Parameters` sections the existing `examples/model-tasks/` and `examples/showcase/` READMEs already carry |
| 7 | How it works | The distinguishing mechanism from the research step, in plain language, plus what the chosen demo angle makes visible on screen that a plainer screen would not. This section is what a release is for; do not compress it to a bullet list. |

Component Details and Workflow Details sections that the base example's own README
already carries may be kept if the copied component block did not change shape — but do
not invent them from scratch when a shorter README already covers the same ground under
"API" and "How to run".

## Where a release goes

A release is its own directory under `releases/`, named task first and model second the
way `examples/model-tasks/` names things — `speaker-diarization-vibevoice`, not
`transcribe-long-meeting`. It holds everything about itself:

```
releases/<name>/
├── model-compose.yml
├── ui/
├── README.md, README.ko.md, README.zh-cn.md
├── report.md, social.md, media/
└── benchmarks/
```

```
✗ Adding the release to `examples/README.md`.
→ Leave `examples/` alone. It mirrors upstream, and a line added there is a line that
  conflicts on the next upstream merge.
Why: the boundary between what this repository produces and what it inherits is the
`releases/` path. Putting a produced thing in the inherited tree erases it.
```
