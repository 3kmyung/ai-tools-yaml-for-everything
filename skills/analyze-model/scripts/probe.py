import shutil
import subprocess
import tempfile
import wave
from pathlib import Path


def probe_format(path, entry):
    if shutil.which("ffprobe") is None:
        return None

    try:
        output = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                f"format={entry}",
                "-of",
                "csv=p=0",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
    except (subprocess.SubprocessError, OSError):
        return None

    return output.stdout.strip() or None


def probed_duration_seconds(path):
    duration = probe_format(path, "duration")

    try:
        return round(float(duration), 4)
    except (TypeError, ValueError):
        return None


def file_duration_seconds(path):
    probed = probed_duration_seconds(path)

    if probed is not None or path.suffix.lower() != ".wav":
        return probed

    with wave.open(str(path), "rb") as handle:
        return round(handle.getnframes() / handle.getframerate(), 4)


def content_duration_seconds(content):
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "output"
        path.write_bytes(content)

        return probed_duration_seconds(path)


def content_extension(content):
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "output"
        path.write_bytes(content)
        format_name = probe_format(path, "format_name")

    return format_name.split(",")[0] if format_name else "bin"
