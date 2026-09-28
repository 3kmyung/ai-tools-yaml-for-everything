import json

from probe import content_extension
from select_output import media_bytes_of

OUTPUTS_FILE_NAME = "outputs.jsonl"


def reset_directory(directory):
    directory.mkdir(parents=True, exist_ok=True)

    for path in directory.iterdir():
        if path.is_file():
            path.unlink()


def saved_media(value, directory, item_id, saved_names):
    if isinstance(value, (bytes, bytearray)):
        name = (
            f"{item_id}-{len(saved_names) + 1}."
            f"{content_extension(bytes(value))}"
        )
        (directory / name).write_bytes(bytes(value))
        saved_names.append(name)

        return {"file": name}

    if isinstance(value, dict):
        return {
            key: saved_media(child, directory, item_id, saved_names)
            for key, child in value.items()
        }

    if isinstance(value, (list, tuple)):
        return [
            saved_media(child, directory, item_id, saved_names)
            for child in value
        ]

    return value


def write_item_output(directory, item_id, output):
    if output is None:
        return (
            f"item {item_id} produced no output; "
            "score_outputs.py has nothing to score"
        )

    joined = media_bytes_of(output)
    record = {
        "id": item_id,
        "output": saved_media(
            joined if joined is not None else output,
            directory,
            item_id,
            [],
        ),
    }

    try:
        with (directory / OUTPUTS_FILE_NAME).open(
            "a", encoding="utf-8", newline="\n"
        ) as handle:
            handle.write(
                json.dumps(record, ensure_ascii=False, default=str) + "\n"
            )
    except (OSError, TypeError, ValueError) as error:
        return (
            f"could not write the output of item {item_id}: "
            f"{error.__class__.__name__}: {error}"
        )

    return None


def read_output_records(directory):
    records = []

    for line in (
        (directory / OUTPUTS_FILE_NAME)
        .read_text(encoding="utf-8")
        .splitlines()
    ):
        if line.strip():
            records.append(json.loads(line))

    return records
