"""Score one saved transcript against a SegLST reference, through MeetEval.

    python score-accuracy.py \\
        --reference ES2004a.reference.json \\
        --hypothesis ES2004a.hypothesis.json \\
        --session ES2004a \\
        --output benchmarks/transcribe-long-meeting/accuracy/bfloat16.json

MeetEval computes every number here. What this file does is convert the
workflow's own output into the SegLST shape MeetEval reads, and record which
metric came from which call — see `references/benchmark.md` for why a scorer
written in this repository would produce figures comparable to nothing.

Three metrics, and the reason each is present:

    tcpWER   words, speakers and timing together — the headline for a model
             that decodes all three in one pass, and the ranking metric for
             CHiME-8 DASR and NOTSOFAR-1
    cpWER    the same permutation of speakers with the time constraint removed;
             the gap between it and tcpWER is the size of the timestamp error
    WER      speaker labels collapsed away, for comparability with a plain
             transcriber and with a published single-number leaderboard

A local figure means nothing until it has been checked against the published
one under matching conditions. Both sides are therefore passed through
`EnglishTextNormalizer`, the normaliser the Open ASR Leaderboard applies. The
microphone condition cannot be matched the same way: the published table labels
its row `ami_test` and names no condition, so the report states which recording
the local run used and claims nothing about the published one.

Two shapes of hypothesis arrive here. A `model-compose` run hands back one object
with `text`, `start_time`, `end_time` and `speaker_id` per segment. The MLX
conversion streams the same content as text fragments that concatenate into JSON
whose fields are `Content`, `Start`, `End` and `Speaker`. Both are read; a
converted build is free to rename its fields and the scorer is not free to
assume it did not.

VibeVoice-ASR also emits non-speech events as segments of their own —
`[Breathing]`, `[Music]`, `[Environmental Sounds]` — carrying no speaker. AMI's
manual annotation does not transcribe those, so scoring them would count every
one as an inserted word against a reference that never asked for them. They are
dropped, and the count is written into the result: a normalisation that changes
the score is not allowed to be invisible.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from meeteval.io.seglst import SegLST
from meeteval.wer import cpwer, siso_word_error_rate, tcpwer

COLLAR_SECONDS = 5.0
NON_SPEECH_TAG = re.compile(r"^\s*[\[\(][^\]\)]*[\]\)]\s*$")


def parse_arguments(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", required=True, type=Path)
    parser.add_argument("--hypothesis", required=True, type=Path)
    parser.add_argument("--session", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--collar", type=float, default=COLLAR_SECONDS)

    return parser.parse_args(argv)


def field(segment, *names):
    for name in names:
        if name in segment:
            return segment[name]

    return None


def segments_of(payload):
    if isinstance(payload, list) and payload and all(isinstance(item, str) for item in payload):
        return segments_of(json.loads("".join(payload)))

    if isinstance(payload, dict):
        for key in ("transcription", "segments", "output", "result"):
            if key in payload:
                return segments_of(payload[key])

        raise ValueError(
            f"the hypothesis object carries none of transcription, segments, output or "
            f"result; its keys are {sorted(payload)}"
        )

    if not isinstance(payload, list):
        raise ValueError(f"expected a list of segments, got {type(payload).__name__}")

    return payload


def to_seglst(payload, session):
    segments = []
    non_speech = 0

    for index, segment in enumerate(segments_of(payload)):
        text = field(segment, "text", "Content", "words")
        start = field(segment, "start_time", "start", "Start")
        end = field(segment, "end_time", "end", "End")
        speaker = field(segment, "speaker_id", "speaker", "Speaker")

        if text is None or start is None or end is None:
            raise ValueError(
                f"segment {index} is missing text or timing; tcpWER cannot score a "
                f"segment whose position is unknown, and dropping it silently would "
                f"flatter the score"
            )

        if NON_SPEECH_TAG.match(str(text)):
            non_speech += 1
            continue

        segments.append({
            "session_id": session,
            "speaker": str(speaker) if speaker is not None else "unknown",
            "start_time": float(start),
            "end_time": float(end),
            "words": str(text),
        })

    if not segments:
        raise ValueError("the hypothesis holds no segments")

    return SegLST(segments), non_speech


def normalise(seglst, normaliser):
    kept = []

    for segment in seglst:
        words = normaliser(segment["words"]).strip()

        if words:
            kept.append({ **segment, "words": words })

    return SegLST(kept)


def english_normaliser():
    from transformers.models.whisper.english_normalizer import EnglishTextNormalizer

    return EnglishTextNormalizer({})


def collapse_to_one_line(seglst, session):
    ordered = sorted(seglst, key=lambda segment: segment["start_time"])

    return SegLST([ {
        "session_id": session,
        "speaker": "all",
        "start_time": min(segment["start_time"] for segment in ordered),
        "end_time": max(segment["end_time"] for segment in ordered),
        "words": " ".join(segment["words"] for segment in ordered),
    } ])


def main():
    arguments = parse_arguments()

    normaliser = english_normaliser()

    reference = normalise(SegLST.load(str(arguments.reference)), normaliser)
    hypothesis, non_speech = to_seglst(json.loads(arguments.hypothesis.read_text()), arguments.session)
    hypothesis = normalise(hypothesis, normaliser)

    timed = tcpwer(reference, hypothesis, collar=arguments.collar)
    permuted = cpwer(reference, hypothesis)
    plain = siso_word_error_rate(
        collapse_to_one_line(reference, arguments.session),
        collapse_to_one_line(hypothesis, arguments.session),
    )

    result = {
        "session": arguments.session,
        "reference": str(arguments.reference),
        "hypothesis": str(arguments.hypothesis),
        "scorer": "meeteval",
        "normaliser": "transformers EnglishTextNormalizer",
        "collar_seconds": arguments.collar,
        "reference_words": len(reference),
        "hypothesis_segments": len(hypothesis),
        "non_speech_segments_dropped": non_speech,
        "tcpwer": timed[arguments.session].error_rate,
        "cpwer": permuted[arguments.session].error_rate,
        "wer": plain.error_rate,
    }

    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(result, indent=2))

    print(json.dumps(result, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
