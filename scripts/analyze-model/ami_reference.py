"""Convert one AMI meeting's manual word annotations into MeetEval SegLST.

    python ami_reference.py \\
        --annotations ami_public_manual_1.6.2/words \\
        --meeting ES2004a \\
        --output ES2004a.reference.json

This converts; it does not score. Scoring belongs to MeetEval, whose numbers
sit beside everyone else's — see `references/benchmark.md` for why a scorer
written here would produce a figure comparable to nothing.

AMI ships one `<meeting>.<speaker>.words.xml` per participant, each a flat list
of `<w>` elements carrying `starttime`, `endtime` and the word. Elements marked
`punc="true"` are punctuation with zero duration; they are dropped, because a
speech recogniser is not asked to emit them and scoring them as missing words
would inflate the error rate by roughly the number of sentences.

Words with no timing are also dropped rather than defaulted. tcpWER's whole
point is that a word matches only near where the reference places it; a word
placed at a guessed time is worse than an absent one.
"""
from __future__ import annotations

import argparse
import json
import xml.etree.ElementTree as ElementTree
from pathlib import Path

NITE_NAMESPACE = "{http://nite.sourceforge.net/}"


def parse_arguments(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--annotations", required=True, type=Path)
    parser.add_argument("--meeting", required=True)
    parser.add_argument("--output", required=True, type=Path)

    return parser.parse_args(argv)


def speaker_files(annotations, meeting):
    files = sorted(annotations.glob(f"{meeting}.*.words.xml"))

    if not files:
        raise FileNotFoundError(f"no word annotations for {meeting} under {annotations}")

    return files


def speaker_of(path, meeting):
    return path.name[len(meeting) + 1 : -len(".words.xml")]


def words_of(path):
    root = ElementTree.parse(path).getroot()

    for element in root.iter("w"):
        if element.get("punc") == "true":
            continue

        text = (element.text or "").strip()
        start = element.get("starttime")
        end = element.get("endtime")

        if not text or start is None or end is None:
            continue

        yield text, float(start), float(end)


def build_segments(annotations, meeting):
    segments = []

    for path in speaker_files(annotations, meeting):
        speaker = speaker_of(path, meeting)

        for text, start, end in words_of(path):
            segments.append({
                "session_id": meeting,
                "speaker": speaker,
                "start_time": start,
                "end_time": end,
                "words": text,
            })

    segments.sort(key=lambda segment: (segment["start_time"], segment["speaker"]))

    return segments


def main():
    arguments = parse_arguments()
    segments = build_segments(arguments.annotations, arguments.meeting)

    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(segments, indent=2))

    speakers = sorted({ segment["speaker"] for segment in segments })
    duration = max(segment["end_time"] for segment in segments)

    print(f"{arguments.meeting}: {len(segments)} words, speakers {', '.join(speakers)}, "
          f"last word ends at {duration:.2f}s -> {arguments.output}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
