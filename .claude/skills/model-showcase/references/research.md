# research.md

Step 1. Read this before filling a single cell of the research table.

## Source order

1. The Hugging Face model card.
2. The project's GitHub README.
3. The arXiv paper.
4. The Transformers model doc.

Prefer the earliest source in this order that states a field. When two sources disagree,
record both rather than picking one — see the no-guessing rule below.

Fetch the underlying `.md`, `.json`, or `.py` file directly wherever the source offers
one — a GitHub `README.md`'s raw URL, a Hugging Face card's `raw` link — rather than the
page that renders it. A fetch that goes through a model to summarise a rendered page can
paraphrase or drop data silently; a raw file cannot.

## Required fields

| Field | Notes |
|---|---|
| Variants and parameter counts | every checkpoint in the family, not just the one chosen |
| Licence | feeds the licence gate below |
| Input and output shape | the literal types the driver's `action` block will carry |
| Streaming, batch, or both | feeds step 3 directly — see below |
| Hardware floor | minimum VRAM/RAM the card or README states |
| The one distinguishing mechanism | the thing that makes this model worth a showcase, in one sentence |
| Withdrawal or restriction history | anything the authors pulled, walked back, or restricted after release |

## Two gates

| Gate | Stops the work? | Rule |
|---|---|---|
| Licence | Yes — asks a human before step 2 begins | Anything other than MIT or Apache-2.0. Reads the licence field alone, nothing else. |
| Usage scope | No — the example still gets built | Checked independently of the licence gate. Any restriction statement is recorded verbatim in the research table; that record is an obligation on the not-yet-built `model-report` skill's `report.md` and `social.md`, once that skill exists, not on anything this skill produces itself. |

**Licence, worked example.** VibeVoice's TTS 1.5B and 7B weights were pulled on
2025-09-04 after Microsoft found out-of-scope use; the repository returned on 2025-09-05
without the TTS code. Building on withdrawn weights wastes a day; publishing about them
invites trouble.

**Usage scope, worked example.** VibeVoice is MIT — a clean licence — yet its README
says: "We do not recommend using VibeVoice in commercial or real-world applications
without further testing and development. This model is intended for research and
development purposes only." A licence-only check would have missed this entirely, which
is why the two gates are checked separately.

## The no-guessing rule

Parameter counts, context lengths, and benchmark figures each need a source URL next to
the value. Without one, mark the field `needs verification` rather than writing a number
from memory or from picking the source you liked best. A `needs verification` field is
settled by the step 6 real run, not by step 1.

**For a parameter-count conflict specifically, check the checkpoint's own weight-index
metadata before falling back to `needs verification`.** A model card's stated size is a
rounded label chosen by whoever wrote the card; the checkpoint's own
`model.safetensors.index.json` (or `pytorch_model.bin.index.json`) carries a
`metadata.total_parameters` field computed from the actual weight shapes on disk. This is
one more raw-file fetch under the same sourcing rule above, and it turns a guess between
two rounded labels into an exact figure for the exact checkpoint about to run.

Worked example — `microsoft/VibeVoice-ASR` carried three official sizes at once:

| Source | Stated size | What it actually means |
|---|---|---|
| GitHub README | 7B | Names the base language-model backbone's nominal size, not the checkpoint's total parameter count |
| `microsoft/VibeVoice-ASR` HF card | 9B | Rounds up from the index file's exact `8674021857` (≈8.67B) |
| `microsoft/VibeVoice-ASR-HF` HF card | 8B | Rounds down from the index file's exact `8330325888` (≈8.33B) |

Fetching each repository's `model.safetensors.index.json` settled what the card labels
only round. The research table records both exact figures with their source URLs,
records GitHub's 7B with its own source and likely meaning, and marks `needs
verification` only for the part the index files could not settle — never an average, a
median, or the number that sounds most impressive.

## The baseline rule

Copy every benchmark row from the model card into the research table, unflattering rows
included. The published numbers are what step 6's real run gets checked against: a local
score that lands far from a published baseline is evidence the local setup is wrong
before it is evidence about the model.

Before comparing a local run to a published number, two conditions have to match, not
one:

| Condition | Why it matters |
|---|---|
| The normaliser | A different text normaliser changes the score independent of the model. Use the same one the leaderboard used. |
| The measurement condition | Some benchmarks report more than one. VibeVoice-ASR's AMI row is 17.20% WER under the IHM (individual headset microphone) condition; scoring a local SDM (single distant microphone) recording against it compares two different problems, not a regression. |

## The I/O mode field feeds step 3

When a family ships both a batch and a streaming checkpoint, the demo angles in step 3
split along that line before any other consideration. `VibeVoice-ASR` and
`VibeVoice-ASR-Streaming` are different screens, not the same screen with a flag.
