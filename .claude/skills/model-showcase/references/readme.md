# readme.md

Step 4. Three files, not one: `README.md`, `README.ko.md`, `README.zh-cn.md`, each a full
translation carrying the same sections in the same order. A showcase example missing two
of the three is not partially documented; it is documented for one audience only.

## Section order

| # | Section | Content |
|---|---|---|
| 1 | Overview | One paragraph: what the model does, what this example demonstrates, and the demo angle chosen in step 3 |
| 2 | Preparation and prerequisites | What has to exist before `model-compose up` — accounts, tokens, downloaded weights, disk space |
| 3 | Environment configuration | `.env` variables the compose file reads, each with its purpose stated, following the `.env.sample` convention `examples/README.md` documents |
| 4 | How to run | The exact `model-compose up` invocation and the URL the static UI serves on |
| 5 | API | The workflow `id` the UI calls, and its input and output shape stated concretely, using the adapter's input shape from `compose.md` where it differs from the raw model output — a showcase example's UI is a WebSocket client over `run_workflow`, not a CLI or a curl example |
| 6 | Input parameters | Every field the workflow's `action` block exposes, with type and default, mirroring the `job.input` / `Input Parameters` sections the existing `examples/model-tasks/` and `examples/showcase/` READMEs already carry |
| 7 | How it works | The distinguishing mechanism from the research step, in plain language, plus what the chosen demo angle makes visible on screen that a plainer screen would not. This section is what a showcase example is for; do not compress it to a bullet list. |

Component Details and Workflow Details sections that the base example's own README
already carries may be kept if the copied component block did not change shape — but do
not invent them from scratch when a shorter README already covers the same ground under
"API" and "How to run".

## The index entry is not optional

`examples/README.md` carries the Showcase section's index around lines 177-181, one line
per example:

```
- [name](./showcase/name/) — one-line description
```

An example directory missing from this list is invisible to anyone reading
`examples/README.md` top to bottom — which is how this repository's own examples are
discovered. Adding the line is part of step 4's generation, in the same commit as the
example itself, not a follow-up task to remember later.
