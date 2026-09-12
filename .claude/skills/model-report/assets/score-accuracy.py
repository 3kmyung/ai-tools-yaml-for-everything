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
one under matching conditions — the leaderboard's own normaliser, and AMI's
IHM microphone condition rather than SDM.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from meeteval.io.seglst import SegLST
from meeteval.wer import cpwer, tcpwer, wer

COLLAR_SECONDS = 5.0


def parse_arguments(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", required=True, type=Path)
    parser.add_argument("--hypothesis", required=True, type=Path)
    parser.add_argument("--session", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--collar", type=float, default=COLLAR_SECONDS)

    return parser.parse_args(argv)


def segments_of(payload):
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

    for index, segment in enumerate(segments_of(payload)):
        text = segment.get("text")
        start = segment.get("start_time", segment.get("start"))
        end = segment.get("end_time", segment.get("end"))
        speaker = segment.get("speaker_id", segment.get("speaker"))

        if text is None or start is None or end is None:
            raise ValueError(
                f"segment {index} is missing text or timing; tcpWER cannot score a "
                f"segment whose position is unknown, and dropping it silently would "
                f"flatter the score"
            )

        segments.append({
            "session_id": session,
            "speaker": str(speaker) if speaker is not None else "unknown",
            "start_time": float(start),
            "end_time": float(end),
            "words": str(text),
        })

    if not segments:
        raise ValueError("the hypothesis holds no segments")

    return SegLST(segments)


def collapse_speakers(seglst, speaker):
    return SegLST([ { **segment, "speaker": speaker } for segment in seglst ])


def main():
    arguments = parse_arguments()

    reference = SegLST.load(str(arguments.reference))
    hypothesis = to_seglst(json.loads(arguments.hypothesis.read_text()), arguments.session)

    timed = tcpwer(reference, hypothesis, collar=arguments.collar)
    permuted = cpwer(reference, hypothesis)
    plain = wer(collapse_speakers(reference, "all"), collapse_speakers(hypothesis, "all"))

    result = {
        "session": arguments.session,
        "reference": str(arguments.reference),
        "hypothesis": str(arguments.hypothesis),
        "scorer": "meeteval",
        "collar_seconds": arguments.collar,
        "reference_words": len(reference),
        "hypothesis_segments": len(hypothesis),
        "tcpwer": timed[arguments.session].error_rate,
        "cpwer": permuted[arguments.session].error_rate,
        "wer": plain[arguments.session].error_rate,
    }

    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(result, indent=2))

    print(json.dumps(result, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
