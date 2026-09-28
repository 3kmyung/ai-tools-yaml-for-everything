import argparse
import json
import os
import pathlib
import sys

from save_outputs import reset_directory

EXIT_SUCCESS = 0
EXIT_USAGE = 2
ITEM_ID_WIDTH = 5


def parse_arguments(argv=None):
    parser = argparse.ArgumentParser(prog=pathlib.Path(__file__).name)
    parser.add_argument("--inputs-file", required=True, type=pathlib.Path)
    parser.add_argument("--output-directory", type=pathlib.Path)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--dataset")
    source.add_argument("--files", nargs="+", type=pathlib.Path)
    parser.add_argument("--config", default=None)
    parser.add_argument("--split", default=None)
    parser.add_argument("--input-column", default=None)
    parser.add_argument("--reference-column", default=None)
    parser.add_argument("--sample-count", type=int, default=None)
    parser.add_argument("--seed", type=int, default=0)
    arguments = parser.parse_args(argv)

    if arguments.dataset and (
        not arguments.split or not arguments.input_column
    ):
        parser.error("--dataset needs --split and --input-column")

    if arguments.dataset and arguments.output_directory is None:
        parser.error("--dataset needs --output-directory")

    if arguments.files and arguments.output_directory is not None:
        parser.error(
            "--files reads the files where they are and takes no "
            "--output-directory"
        )

    return arguments


def item_id_at(position):
    return f"{position:0{ITEM_ID_WIDTH}d}"


def relative_location(path, inputs_file):
    return pathlib.Path(os.path.relpath(path, inputs_file.parent)).as_posix()


def dataset_rows(arguments):
    from datasets import load_dataset

    dataset = load_dataset(
        arguments.dataset, arguments.config, split=arguments.split
    )
    feature = dataset.features[arguments.input_column]

    if hasattr(feature, "decode"):
        dataset = dataset.cast_column(
            arguments.input_column, type(feature)(decode=False)
        )

    if arguments.sample_count is not None and arguments.sample_count < len(
        dataset
    ):
        dataset = dataset.shuffle(seed=arguments.seed).select(
            range(arguments.sample_count)
        )

    return dataset


def written_value(arguments, item_id, value):
    if isinstance(value, str):
        return {"text": value}

    if isinstance(value, dict) and (
        value.get("bytes") is not None or value.get("path")
    ):
        content = (
            value.get("bytes") or pathlib.Path(value["path"]).read_bytes()
        )
        suffix = pathlib.Path(value.get("path") or "").suffix or ".bin"
        path = arguments.output_directory / f"{item_id}{suffix}"
        path.write_bytes(content)

        return {"file": relative_location(path, arguments.inputs_file)}

    raise ValueError(
        f"item {item_id}: the input column holds {type(value).__name__}, "
        "not text or an encoded file"
    )


def dataset_items(arguments):
    for position, row in enumerate(dataset_rows(arguments)):
        item_id = item_id_at(position)
        item = {
            "id": item_id,
            **written_value(arguments, item_id, row[arguments.input_column]),
        }

        if arguments.reference_column:
            item["reference"] = row[arguments.reference_column]

        yield item


def file_items(arguments):
    for position, path in enumerate(arguments.files):
        yield {
            "id": item_id_at(position),
            "file": relative_location(path, arguments.inputs_file),
            "source": path.name,
        }


def main():
    program_name = pathlib.Path(__file__).name
    arguments = parse_arguments()

    if arguments.files and not all(path.is_file() for path in arguments.files):
        missing = [str(path) for path in arguments.files if not path.is_file()]
        print(
            f"{program_name}: error: not a file: {', '.join(missing)}",
            file=sys.stderr,
        )

        return EXIT_USAGE

    if arguments.dataset:
        reset_directory(arguments.output_directory)

    arguments.inputs_file.parent.mkdir(parents=True, exist_ok=True)
    items = (
        dataset_items(arguments)
        if arguments.dataset
        else file_items(arguments)
    )
    count = 0

    with arguments.inputs_file.open(
        "w", encoding="utf-8", newline="\n"
    ) as handle:
        for item in items:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")
            count += 1

    print(f"{count} items written to {arguments.inputs_file}")

    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main())
