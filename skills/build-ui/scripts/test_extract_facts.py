import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

SCRIPTS_DIRECTORY = pathlib.Path(__file__).resolve().parent
EXTRACT_SCRIPT = SCRIPTS_DIRECTORY / "extract_facts.py"
FIXTURES_DIRECTORY = SCRIPTS_DIRECTORY / "test_fixtures" / "releases"
EXIT_SUCCESS = 0
EXIT_USAGE = 2
EXIT_UNSUPPORTED = 3


def run_extract(
    release_directory: pathlib.Path, *arguments: str
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-B",
            str(EXTRACT_SCRIPT),
            str(release_directory),
            *arguments,
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )


def section_rows(output: str, heading: str) -> list[dict[str, str]]:
    lines = output.split("\n")
    start = lines.index(f"## {heading}") + 2
    table_lines: list[str] = []

    for line in lines[start:]:
        if not line.startswith("|"):
            break

        table_lines.append(line)

    headers = [cell.strip() for cell in table_lines[0].strip("|").split(" | ")]

    return [
        dict(zip(headers, (cell.strip() for cell in line[2:-2].split(" | "))))
        for line in table_lines[2:]
    ]


class ExtractFactsTest(unittest.TestCase):
    def extract(
        self, fixture: str, *arguments: str, expected_code: int = EXIT_SUCCESS
    ) -> subprocess.CompletedProcess[str]:
        result = run_extract(FIXTURES_DIRECTORY / fixture, *arguments)
        self.assertEqual(result.returncode, expected_code, result.stderr)

        return result

    def test_singular_workflow_with_job_input_mapping(self) -> None:
        output = self.extract("audio-normalizer").stdout
        workflows = section_rows(output, "Workflows")
        inputs = section_rows(output, "Inputs")

        self.assertEqual(workflows[0]["id"], "__default__")
        self.assertEqual(workflows[0]["default"], "yes")
        self.assertEqual(
            [
                (row["field"], row["as"], row["default"], row["contract"])
                for row in inputs
            ],
            [
                ("audio", "audio", "", "files"),
                ("level", "", "-14", "options"),
                ("true_peak_ceiling", "", "-1", "options"),
            ],
        )

    def test_singular_component_passthrough_and_stream(self) -> None:
        output = self.extract("anthropic-stream").stdout
        workflows = section_rows(output, "Workflows")
        inputs = {row["field"]: row for row in section_rows(output, "Inputs")}
        choices = {
            row["field"]: row["candidates"]
            for row in section_rows(output, "Option choice candidates")
        }
        components = section_rows(output, "Components")

        self.assertEqual(workflows[0]["output as stream"], "yes")
        self.assertEqual(inputs["prompt"]["contract"], "prompt")
        self.assertEqual(inputs["max_tokens"]["as"], "integer")
        self.assertEqual(inputs["max_tokens"]["contract"], "options")
        self.assertTrue(
            inputs["model"]["as"].startswith("select/claude-sonnet")
        )
        self.assertEqual(
            choices["model"],
            "claude-sonnet-4-20250514 (default, select);"
            " claude-haiku-4-5-20251001 (select);"
            " claude-opus-4-20250514 (select)",
        )
        self.assertEqual(components[0]["component"], "__component__")
        self.assertEqual(components[0]["type"], "http-client")
        self.assertEqual(components[0]["action"], "(single action)")

    def test_multiple_workflows_collect_literals_from_other_actions(
        self,
    ) -> None:
        output = self.extract("audio-mixer").stdout
        workflows = section_rows(output, "Workflows")
        choices = {
            (row["workflow"], row["field"]): row["candidates"]
            for row in section_rows(output, "Option choice candidates")
        }
        inputs = section_rows(output, "Inputs")

        self.assertEqual(
            [row["id"] for row in workflows],
            ["concat", "overlay-single", "overlay-multiple"],
        )
        self.assertEqual(
            choices[("overlay-single", "gain")],
            "0.8 (default); 1.0 (overlay-multiple.placement.gain);"
            " 0.6 (overlay-multiple.placement.gain)",
        )
        self.assertEqual(
            choices[("overlay-multiple", "duration_mode")],
            "base (default, select); longest (select); shortest (select)",
        )
        self.assertEqual(
            [
                row["field"]
                for row in inputs
                if row["workflow"] == "overlay-multiple"
            ],
            ["base", "narration", "sfx", "duration_mode"],
        )

    def test_same_component_default_and_strict_actions(self) -> None:
        output = self.extract("silence-detector").stdout
        choices = {
            row["field"]: row["candidates"]
            for row in section_rows(output, "Option choice candidates")
        }
        inputs = section_rows(output, "Inputs")

        self.assertEqual(
            choices["silence_threshold"],
            "-30.0 (default); -40.0 (strict.silence_threshold)",
        )
        self.assertEqual(
            [
                (row["workflow"], row["field"], row["contract"])
                for row in inputs
            ],
            [
                ("detect-silences", "audio", "files"),
                ("detect-silences", "silence_threshold", "options"),
                ("detect-silences", "min_silence_duration", "options"),
                ("detect-silences-strict", "audio", "files"),
            ],
        )

    def test_selected_workflow_narrows_sections_and_candidates(self) -> None:
        output = self.extract(
            "silence-detector", "--workflow", "detect-silences"
        ).stdout
        choices = {
            row["field"]: row["candidates"]
            for row in section_rows(output, "Option choice candidates")
        }

        self.assertEqual(
            [row["id"] for row in section_rows(output, "Workflows")],
            ["detect-silences"],
        )
        self.assertEqual(
            {row["workflow"] for row in section_rows(output, "Jobs")},
            {"detect-silences"},
        )
        self.assertEqual(
            {row["workflow"] for row in section_rows(output, "Inputs")},
            {"detect-silences"},
        )
        self.assertEqual(choices["silence_threshold"], "-30.0 (default)")
        self.assertEqual(choices["min_silence_duration"], "500ms (default)")

    def test_repeated_workflow_keeps_candidates_from_every_selected_one(
        self,
    ) -> None:
        single = self.extract(
            "audio-mixer", "--workflow", "overlay-single"
        ).stdout
        both = self.extract(
            "audio-mixer",
            "--workflow",
            "overlay-multiple",
            "--workflow",
            "overlay-single",
        ).stdout
        single_choices = {
            (row["workflow"], row["field"]): row["candidates"]
            for row in section_rows(single, "Option choice candidates")
        }
        both_choices = {
            (row["workflow"], row["field"]): row["candidates"]
            for row in section_rows(both, "Option choice candidates")
        }

        self.assertEqual(
            single_choices[("overlay-single", "gain")], "0.8 (default)"
        )
        self.assertEqual(
            both_choices[("overlay-single", "gain")],
            "0.8 (default); 1.0 (overlay-multiple.placement.gain);"
            " 0.6 (overlay-multiple.placement.gain)",
        )
        self.assertEqual(
            [row["id"] for row in section_rows(both, "Workflows")],
            ["overlay-single", "overlay-multiple"],
        )

    def test_unknown_workflow_exits_with_usage(self) -> None:
        result = self.extract(
            "silence-detector",
            "--workflow",
            "missing",
            expected_code=EXIT_USAGE,
        )

        self.assertIn("unknown --workflow missing", result.stderr)
        self.assertEqual(result.stdout, "")

    def test_multi_job_depends_on_and_private_workflows(self) -> None:
        output = self.extract("rag-assistant").stdout
        workflows = {
            row["id"]: row for row in section_rows(output, "Workflows")
        }
        jobs = section_rows(output, "Jobs")

        self.assertEqual(
            workflows["search-knowledge"]["jobs"], "embed-query, search"
        )
        self.assertEqual(workflows["search-knowledge"]["private"], "yes")
        self.assertEqual(workflows["main"]["default"], "yes")
        self.assertIn(
            {
                "workflow": "search-knowledge",
                "job": "search",
                "type": "component",
                "component": "vector-store",
                "action": "search",
                "depends_on": "embed-query",
                "output as stream": "no",
            },
            jobs,
        )

    def test_streaming_pipeline_with_for_each(self) -> None:
        output = self.extract("speech-to-text-with-vad").stdout
        workflows = section_rows(output, "Workflows")
        inputs = section_rows(output, "Inputs")

        self.assertEqual(workflows[0]["jobs"], "detect, clip, transcribe")
        self.assertEqual(workflows[0]["output as stream"], "yes")
        self.assertEqual(
            [(row["field"], row["contract"]) for row in inputs],
            [("audio", "files"), ("language", "options")],
        )

    def test_components_list_model_facts_and_single_actions(self) -> None:
        output = self.extract("speech-to-text-with-vad").stdout
        components = {
            row["component"]: row for row in section_rows(output, "Components")
        }
        silence_components = section_rows(
            self.extract("silence-detector").stdout, "Components"
        )

        self.assertEqual(
            [
                components["stt"][key]
                for key in (
                    "type",
                    "task",
                    "family",
                    "driver",
                    "model",
                    "action",
                )
            ],
            [
                "model",
                "speech-to-text",
                "",
                "huggingface",
                "openai/whisper-large-v3-turbo",
                "(single action)",
            ],
        )
        self.assertEqual(components["vad"]["family"], "silero")
        self.assertEqual(components["clipper"]["task"], "")
        self.assertEqual(
            [row["action"] for row in silence_components],
            ["default", "strict", ""],
        )

    def test_unsupported_inputs_exit_three_and_are_listed_last(self) -> None:
        result = self.extract(
            "image-processor-dual-input", expected_code=EXIT_UNSUPPORTED
        )
        inputs = section_rows(result.stdout, "Inputs")
        unsupported = section_rows(result.stdout, "UNSUPPORTED inputs")

        self.assertEqual(inputs[0]["as"], "image;url")
        self.assertEqual(inputs[0]["contract"], "prompt")
        self.assertEqual(
            [(row["workflow"], row["field"]) for row in unsupported],
            [
                ("resize-from-url", "width"),
                ("resize-from-url", "height"),
                ("resize-from-upload", "width"),
                ("resize-from-upload", "height"),
            ],
        )
        self.assertTrue(
            result.stdout.rstrip().split("\n## ")[-1].startswith("UNSUPPORTED")
        )

    def test_captured_output_paths_types_and_lengths(self) -> None:
        output = self.extract("silence-detector").stdout
        paths = {
            row["path"]: row
            for row in section_rows(
                output, "Captured output: captured-output.json"
            )
        }

        self.assertEqual(paths["__job__.segments.segments"]["type"], "array")
        self.assertEqual(
            paths["__job__.segments.segments"]["array length"], "4"
        )
        self.assertEqual(
            paths["__job__.segments.segments[].end_time"]["examples"],
            "2.000794 \\| 3.500952 \\| 6.500839",
        )
        self.assertEqual(
            paths["__job__.segments.segments[].type"]["examples"],
            '"audible" \\| "silence"',
        )
        self.assertEqual(paths["__job__.segments.segments"]["examples"], "")
        self.assertEqual(paths["__job__.segments.duration"]["examples"], "0.0")

    def test_unreadable_release_exits_with_usage(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            release = pathlib.Path(directory) / "releases" / "broken"
            workspace = pathlib.Path(directory) / "workspaces" / "broken"
            release.mkdir(parents=True)
            workspace.mkdir(parents=True)
            missing = run_extract(release)
            (release / "model-compose.yml").write_text(
                "- a\n- b\n", encoding="utf-8"
            )
            not_mapping = run_extract(release)
            shutil.copy(
                FIXTURES_DIRECTORY / "audio-normalizer" / "model-compose.yml",
                release,
            )
            (workspace / "captured-output.json").write_text(
                "{", encoding="utf-8"
            )
            broken_capture = run_extract(release)

        self.assertEqual(missing.returncode, EXIT_USAGE)
        self.assertEqual(not_mapping.returncode, EXIT_USAGE)
        self.assertEqual(broken_capture.returncode, EXIT_USAGE)


if __name__ == "__main__":
    unittest.main()
