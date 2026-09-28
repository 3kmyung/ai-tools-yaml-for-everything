import argparse
import datetime
import pathlib
import sys

EXIT_SUCCESS = 0
EXIT_USAGE = 2

LICENSE_FILE = "LICENSE"
COPYRIGHT_HOLDER = "MindrLabs"
MIT_LICENSE = """MIT License

Copyright (c) {year} {holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""


def main():
    program_name = pathlib.Path(__file__).name
    parser = argparse.ArgumentParser(prog=program_name)
    parser.add_argument("release_directory", type=pathlib.Path)
    arguments = parser.parse_args()

    if not arguments.release_directory.is_dir():
        print(
            f"{program_name}: error: {arguments.release_directory} is not a "
            f"directory",
            file=sys.stderr,
        )

        return EXIT_USAGE

    license_path = arguments.release_directory / LICENSE_FILE

    if license_path.exists():
        print(f"kept {license_path}")

        return EXIT_SUCCESS

    license_path.write_text(
        MIT_LICENSE.format(
            year=datetime.date.today().year, holder=COPYRIGHT_HOLDER
        ),
        encoding="utf-8",
        newline="\n",
    )
    print(f"wrote {license_path}")

    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main())
