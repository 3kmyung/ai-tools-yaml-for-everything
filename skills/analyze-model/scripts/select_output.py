import json

from resolve_metric import TEXT

WILDCARD_KEY = "*"
OUTPUT_PREVIEW_CHARACTERS = 500


def decoded_json(value):
    if not isinstance(value, str) or not value.lstrip().startswith(("{", "[")):
        return value

    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def select_keys(value, keys):
    if not keys:
        return value

    key, rest = keys[0], keys[1:]
    value = decoded_json(value)

    if key == WILDCARD_KEY:
        if not isinstance(value, list):
            return None

        selected = [select_keys(child, rest) for child in value]

        return [child for child in selected if child is not None]

    if isinstance(value, dict):
        return select_keys(value.get(key), rest)

    if isinstance(value, list) and key.lstrip("-").isdigit():
        index = int(key)

        return (
            select_keys(value[index], rest)
            if -len(value) <= index < len(value)
            else None
        )

    return None


def select_field(output, field_path):
    return select_keys(output, field_path.split(".") if field_path else [])


def text_of(value):
    if isinstance(value, str):
        return value

    if (
        isinstance(value, list)
        and value
        and all(isinstance(chunk, str) for chunk in value)
    ):
        return "".join(value)

    return None


def media_bytes_of(value):
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)

    if (
        isinstance(value, list)
        and value
        and all(isinstance(chunk, (bytes, bytearray)) for chunk in value)
    ):
        return b"".join(value)

    return None


def output_field_problem(benchmark, output):
    field_path = benchmark.get("output_field")
    wanted = benchmark["output_kind"]
    value = select_field(output, field_path)
    selected = text_of(value) if wanted == TEXT else media_bytes_of(value)

    if selected:
        return None

    preview = json.dumps(output, ensure_ascii=False, default=str)[
        :OUTPUT_PREVIEW_CHARACTERS
    ]

    return (
        f"output_field {field_path!r} selects no {wanted} from this output, "
        f"so every item would be measured wrong; fix output_field in "
        f"benchmark.json. Output starts with: {preview}"
    )
