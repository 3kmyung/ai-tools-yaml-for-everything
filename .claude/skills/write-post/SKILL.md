---
name: write-post
description: Use when a release's `report.md` is finished and needs an X post, or when the user says "포스트 써줘", "X 포스트", "트윗", "SNS 홍보", "social.md".
---

# write-post

Turns a finished `releases/<example>/report.md` and its benchmark results into
`social.md`: one X post, its reply, and the RTF table images. Measuring is
`analyze-model`'s job; the report is `report-model`'s.

## Where to start

| `releases/<example>/` holds | Do |
|---|---|
| `report.md` and `benchmarks/results/*.json` | write the post — `references/social.md` |
| no `report.md` | **STOP** and hand over to `report-model`. The post never carries a figure the report does not |

## Reference files

| File | Read it when |
|---|---|
| `references/social.md` | writing the post and its reply — the voice, the template, the five required elements, the RTF table images, the length check, the one prohibition |

When `assets/rtf-table.mjs` or `assets/post-length.mjs` exits non-zero, report its output
verbatim. Never attach an image that did not render, and never hand over a post the
length check rejected.
