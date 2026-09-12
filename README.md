# speaker-diarization-vibevoice

One model-compose release: who spoke what and when, transcribed with speakers and
timestamps in a single pass by Microsoft's VibeVoice-ASR. Measured on three machines,
with the report written from those measurements.

| Path | What |
|---|---|
| `releases/speaker-diarization-vibevoice/` | the compose file, the web interface, and the three READMEs |
| `releases/speaker-diarization-vibevoice/report.md` | the report |
| `releases/speaker-diarization-vibevoice/social.md` | the X thread drafted from it |
| `releases/speaker-diarization-vibevoice/benchmarks/` | every measured figure the report quotes, as JSON |

This branch carries deliverables only.

## Running it

```
pip install model-compose
cd releases/speaker-diarization-vibevoice
model-compose up
```

The component declares `runtime: virtualenv`, so the first run builds its own
environment and downloads the checkpoint — 17.35 GB at `bfloat16`. Both land inside
this directory and are ignored by git.

## Reproducing the measurements

The scripts that produced every figure here are on the `workflows/analyze-model`
branch, not this one: they belong to no single release and arrive at the compose file,
the audio and the machine through arguments.

```
git clone --branch workflows/analyze-model <this repository> analyze-model
python analyze-model/scripts/analyze-model/bench_hw.py --help
```

`bench_hw.py` drives a release through `model-compose` and PyTorch. `bench_mlx.py` is
for a machine with no PyTorch build of the checkpoint and runs an MLX conversion
instead. `score_accuracy.py` scores a saved transcript through MeetEval, and
`ami_reference.py` converts AMI's manual annotation into the shape it reads.
