# research.md

Step 1. Read this before filling a single cell of the research table.

## Source order

1. The Hugging Face model card.
2. The project's GitHub README.
3. The arXiv paper.
4. The Transformers model doc.

Prefer the earliest source in this order that states a field. When two sources in this
order disagree, record both rather than picking one — see the no-guessing rule below.

Fetch from files, not from a rendered site. A page that a summarising fetch renders
through a model carries a paraphrase risk a raw file does not: lucide.dev is a JavaScript
application with no static markup, and the same is true of most model-card front ends
that wrap a markdown file in a framework. Fetch the underlying `.md`, `.json`, or `.py`
file directly wherever the source offers one — a GitHub `README.md`'s raw URL, a Hugging
Face card's `raw` link, a `.py` source file — rather than the page that renders it.

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

**Licence gate.** Anything other than MIT or Apache-2.0 stops the work and asks a human
before step 2 begins. VibeVoice is the worked example: the TTS 1.5B and 7B weights were
pulled on 2025-09-04 after Microsoft found out-of-scope use, and the repository came back
on 2025-09-05 without the TTS code. Building on withdrawn weights wastes a day; publishing
about them invites trouble. This gate reads the licence field alone and nothing else.

**Usage-scope gate — separate from the licence gate.** A permissive licence is not an
endorsement of every use. Check it independently, even when the licence gate passes.
VibeVoice is MIT, and its README still says: "We do not recommend using VibeVoice in
commercial or real-world applications without further testing and development. This model
is intended for research and development purposes only." Record such a statement
verbatim in the research table, word for word, not summarised. This gate does not stop
the work — the example still gets built — but the sentence it records is one that
`model-report`'s `report.md` and `social.md` are then required to carry. A licence-only
check would have missed this one entirely, because VibeVoice's licence is clean.

## The no-guessing rule

Parameter counts, context lengths, and benchmark figures each need a source URL next to
the value. Without one, mark the field `needs verification` rather than writing a number
that came from memory or from resolving a conflict by choosing the source you liked best.
A `needs verification` field is settled by the step 6 real run, not by step 1.

**For a parameter-count conflict specifically, check the checkpoint's own weight-index
metadata before falling back to `needs verification`.** A model card's stated size is a
rounded label chosen by whoever wrote the card; the checkpoint's own
`model.safetensors.index.json` (or the equivalent `pytorch_model.bin.index.json`) carries
a `metadata.total_parameters` field computed from the actual weight shapes on disk. This
is one more GET under the same sourcing rule that already governs everything else in this
document — a raw JSON file, not a rendered page — and it turns a guess between two rounded
labels into an exact figure for the exact checkpoint you are about to run.

Worked example: `microsoft/VibeVoice-ASR` is listed as 7B on GitHub, 9B on the
`microsoft/VibeVoice-ASR` Hugging Face card, and 8B on the `microsoft/VibeVoice-ASR-HF`
card — three official figures for one model, none of them wrong on its own terms.
Fetching `model.safetensors.index.json` from each of the two Hugging Face repositories
settles what the card labels only round: `microsoft/VibeVoice-ASR`'s
`metadata.total_parameters` is `8674021857` (≈8.67B, which the "9B" badge rounds up from),
and `microsoft/VibeVoice-ASR-HF`'s is `8330325888` (≈8.33B, which "8B" rounds down from).
GitHub's "7B" is left unresolved by this technique — it names the base language-model
backbone's nominal size, not the checkpoint's total parameter count, and no index file
speaks to a nominal name. The research table records the two exact index-file figures with
their source URLs, records GitHub's "7B" with its own source and what it most likely
refers to, and marks the field `needs verification` only for the part the index files
could not settle — it does not average the numbers, pick the median, or pick the one that
sounds most impressive.

## The baseline rule

Where the model card carries a leaderboard or benchmark table, copy every row into the
research table with its dataset name, including the unflattering rows. This is not
completeness for its own sake: the published numbers are what the step 6 real run gets
checked against. A local measurement that lands far from the published baseline is
evidence the local setup is wrong before it is evidence about the model.

Before comparing a local run to a published number, two conditions have to match, not
one:

- **The normaliser.** A different text normaliser changes the score independent of the
  model. Use the same one the leaderboard used.
- **The measurement condition**, when the benchmark has more than one. VibeVoice-ASR's
  Open ASR Leaderboard row averages 7.77% WER at RTFx 51.80, and its worst dataset is AMI
  at 17.20% — meeting audio, which is this model's own showcase subject, so that row
  belongs in the table rather than being dropped as unflattering. But 17.20% is AMI's IHM
  (individual headset microphone) condition; scoring a local SDM (single distant
  microphone) recording against it compares two different problems, not a regression.

## The I/O mode field feeds step 3

When a family ships both a batch and a streaming checkpoint, the demo angles in step 3
split along that line before any other consideration. `VibeVoice-ASR` and
`VibeVoice-ASR-Streaming` are different screens, not the same screen with a flag.
