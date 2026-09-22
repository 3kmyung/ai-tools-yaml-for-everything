from __future__ import annotations

import re

SIGNATURES = (
    (
        re.compile(
            r"not compiled with CUDA|"
            r"torch\.cuda\.is_available\(\) is False"
        ),
        "the component runtime installed a CPU-only torch wheel",
        (
            "report this log as it is; if a fix lives on another ref,"
            " open again with --ref instead of editing the source"
        ),
    ),
    (
        re.compile(
            r"no kernel image is available|not implemented for|CUDA error: |"
            r"does not support (bfloat16|float8|flash attention)"
        ),
        "the accelerator does not support an operation this service needs",
        (
            "report it as this machine's failure; do not switch to CPU"
            " or another inference stack"
        ),
    ),
    (
        re.compile(r"ffprobe|ffmpeg"),
        "ffmpeg is a system binary, not a pip dependency",
        (
            "report it; open installs ffmpeg and ffprobe into the virtual"
            " environment when they are missing from PATH"
        ),
    ),
    (
        re.compile(r"No module named 'mindor|mindor\.version"),
        (
            "an older model-compose distribution is in the way"
            " of this repository's code"
        ),
        "report it; never pip install model-compose",
    ),
    (
        re.compile(r"Address already in use|WinError 10048"),
        "another process already listens on a port this service needs",
        "report the port as busy; do not kill processes that are not ours",
    ),
)


def diagnoses(text: str) -> list[str]:
    return [
        f"{cause}; {action}"
        for pattern, cause, action in SIGNATURES
        if pattern.search(text)
    ]


def annotated(text: str) -> str:
    lines = diagnoses(text)

    if not lines:
        return text

    return text + "\n" + "\n".join(f"diagnosis: {line}" for line in lines)
