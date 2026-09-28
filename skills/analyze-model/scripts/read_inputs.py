import hashlib
import json

from probe import file_duration_seconds

INPUT_PLACEHOLDER = "@input"


def read_benchmark(path):
    return json.loads(path.read_text(encoding="utf-8"))


def read_inputs(path):
    items = []

    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue

        item = json.loads(line)

        if item.get("file") is not None:
            item["file"] = path.parent / item["file"]

        items.append(item)

    return items


def digest_bytes(value):
    return value if isinstance(value, bytes) else str(value).encode("utf-8")


def item_input_value(item):
    if item.get("file") is not None:
        return item["file"].read_bytes()

    if item.get("text") is not None:
        return item["text"]

    raise ValueError(
        f"input item {item.get('id')!r} carries neither 'file' nor 'text'"
    )


def inputs_digest(path):
    items = sorted(read_inputs(path), key=lambda item: str(item.get("id")))
    digest = hashlib.sha256()

    for item in items:
        digest.update(digest_bytes(item.get("id")))
        digest.update(b"\0")
        digest.update(digest_bytes(item_input_value(item)))
        digest.update(b"\0")
        digest.update(digest_bytes(item.get("reference") or ""))
        digest.update(b"\0")

    return digest.hexdigest()


def item_workflow_input(template, item):
    keys = [
        key for key, value in template.items() if value == INPUT_PLACEHOLDER
    ]

    if not keys:
        raise ValueError(
            "workflow_input in benchmark.json carries no "
            f"{INPUT_PLACEHOLDER!r} value"
        )

    value = item_input_value(item)

    return {**template, **{key: value for key in keys}}


def item_input_duration_seconds(item):
    if item.get("duration_seconds") is not None:
        return item["duration_seconds"]

    if item.get("file") is None:
        return None

    return file_duration_seconds(item["file"])
