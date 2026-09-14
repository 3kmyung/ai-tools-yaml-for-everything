---
name: report-model
description: Use when a release's benchmark and accuracy results exist and need writing up as its `report.md`, or when the user says "리포트 써줘", "성능 리포트", "결과 정리", "report.md".
---

# report-model

Turns a release's measured results into `releases/<example>/report.md` and the media it
shows. Measuring is `analyze-model`'s job; the post is `write-post`'s.

## Where to start

| `releases/<example>/benchmarks/` holds | Do |
|---|---|
| `results/*.json` with every run `valid: true`, and `accuracy/*.json` | write the report — `references/report.md` |
| anything less | **STOP** and hand over to `analyze-model`. A missing figure is never filled in |

## Section 3's media

Capture the release's own UI, from the release directory:

```
node ../../.claude/skills/report-model/assets/capture.mjs ui --screenshot=media/<example>.png
node ../../.claude/skills/report-model/assets/capture.mjs ui --video=media/<example>.mp4 --duration=6000
```

`--width` and `--height` default to 1440 and 900. The video needs `ffmpeg` on the path.
When a capture fails, report its error verbatim and leave that medium out of section 3
rather than substituting another image.

## Reference files

| File | Read it when |
|---|---|
| `references/report.md` | writing any section — the language, the six sections, section 4's interpretation, section 5's verbatim usage-scope quote, the example link |

No figure reaches the report without a source and a stated condition
(`conditions.numerics`, batch setting, sample length).
