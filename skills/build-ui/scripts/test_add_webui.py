import pathlib
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest

import yaml

SCRIPTS_DIRECTORY = pathlib.Path(__file__).resolve().parent
ADD_WEBUI_SCRIPT = SCRIPTS_DIRECTORY / "add_webui.py"
FIXTURES_DIRECTORY = SCRIPTS_DIRECTORY / "test_fixtures" / "releases"
COMPOSE_FILE = "model-compose.yml"
PORT_LINE = re.compile(r"^port (\d+)$", re.MULTILINE)
EXCLUDED_LINE = re.compile(r"^excluded ports: (.*)$", re.MULTILINE)
FIRST_CANDIDATE_PORT = 8090
EXIT_SUCCESS = 0
EXIT_USAGE = 2


def excluded_ports(output: str) -> dict[int, str]:
    lines = EXCLUDED_LINE.findall(output)
    assert len(lines) == 1, output

    if lines[0] == "none":
        return {}

    entries = (entry.split(" ", 1) for entry in lines[0].split("; "))

    return {int(port): reason for port, reason in entries}


def run_add_webui(
    release_directory: pathlib.Path,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-B", str(ADD_WEBUI_SCRIPT), str(release_directory)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )


def webui_of(document: dict) -> dict:
    return next(
        item for item in document["components"] if item.get("id") == "webui"
    )


class AddWebuiTest(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory(prefix="add-webui-test-")
        self.addCleanup(directory.cleanup)
        self.release = pathlib.Path(directory.name)

    def use_fixture(self, fixture: str) -> bytes:
        shutil.copy(FIXTURES_DIRECTORY / fixture / COMPOSE_FILE, self.release)

        return (self.release / COMPOSE_FILE).read_bytes()

    def run_script(self) -> tuple[subprocess.CompletedProcess[str], int]:
        result = run_add_webui(self.release)
        self.assertEqual(result.returncode, EXIT_SUCCESS, result.stderr)
        match = PORT_LINE.search(result.stdout)
        assert match is not None

        return result, int(match.group(1))

    def parsed(self) -> dict:
        return yaml.safe_load(
            (self.release / COMPOSE_FILE).read_text(encoding="utf-8")
        )

    def test_appends_to_components_list_preserving_the_rest(self) -> None:
        original = yaml.safe_load(self.use_fixture("audio-normalizer"))
        result, port = self.run_script()
        document = self.parsed()
        webui = webui_of(document)

        self.assertEqual(document["workflow"], original["workflow"])
        self.assertEqual(document["components"][:-1], original["components"])
        self.assertGreaterEqual(port, 8090)
        self.assertEqual(webui["port"], f"${{env.WEBUI_PORT | {port}}}")
        self.assertEqual(webui["manage"]["working_dir"], "web")
        self.assertEqual(
            webui["manage"]["start"],
            [
                "node",
                "node_modules/vite/bin/vite.js",
                "preview",
                "--port",
                f"${{env.WEBUI_PORT | {port}}}",
                "--strictPort",
                "--host",
            ],
        )
        self.assertEqual(webui["manage"]["install"][0], "node")
        excluded = excluded_ports(result.stdout)
        self.assertEqual(excluded[8080], "controller.adapter.port")
        self.assertEqual(excluded[8081], "controller.webui.port")
        self.assertIn("removed controller.webui", result.stdout)
        self.assertNotIn("webui", document["controller"])
        self.assertEqual(
            document["controller"]["adapter"],
            original["controller"]["adapter"],
        )

    def test_converts_singular_component_into_a_list(self) -> None:
        original = yaml.safe_load(self.use_fixture("anthropic-stream"))
        result, _ = self.run_script()
        document = self.parsed()

        self.assertNotIn("component", document)
        self.assertEqual(len(document["components"]), 2)
        self.assertEqual(
            document["components"][0],
            {**original["component"], "default": True},
        )
        self.assertEqual(document["workflow"], original["workflow"])
        self.assertEqual(
            document["controller"],
            {
                key: value
                for key, value in original["controller"].items()
                if key != "webui"
            },
        )
        self.assertIn(
            "marked the only other component default: true", result.stdout
        )

    def test_keeps_an_existing_webui_component(self) -> None:
        original = yaml.safe_load(self.use_fixture("silence-detector"))
        result, port = self.run_script()
        document = self.parsed()

        self.assertEqual(port, 4290)
        self.assertIn("kept the existing webui component", result.stdout)
        self.assertIn("removed controller.webui", result.stdout)
        self.assertEqual(
            document,
            {
                **original,
                "controller": {
                    key: value
                    for key, value in original["controller"].items()
                    if key != "webui"
                },
            },
        )

    def test_skips_declared_and_listening_ports(self) -> None:
        (self.release / COMPOSE_FILE).write_text(
            "controller:\n"
            "  adapter:\n"
            "    port: 8090\n"
            '    origins: "http://localhost:3000"\n'
            "workflow:\n"
            "  job:\n"
            "    component: helper\n"
            "components:\n"
            "- id: helper\n"
            "  type: http-server\n"
            "  port: ${env.HELPER_PORT | 8091}\n",
            encoding="utf-8",
        )

        with socket.socket() as listener:
            try:
                listener.bind(("127.0.0.1", 8092))
                listener.listen()
                is_listening = True
            except OSError:
                is_listening = False

            result, port = self.run_script()

        webui = webui_of(self.parsed())
        excluded = excluded_ports(result.stdout)

        self.assertNotIn(port, (8090, 8091, 8092))
        self.assertEqual(excluded[8090], "controller.adapter.port")
        self.assertEqual(
            excluded[8091], "components[0].port in model-compose.yml"
        )
        self.assertIn(
            'warning: controller.adapter.origins is not "*"', result.stdout
        )
        self.assertEqual(webui["type"], "http-server")
        self.assertIn(
            "- id: webui\n  type: http-server",
            (self.release / COMPOSE_FILE).read_text(encoding="utf-8"),
        )

        if is_listening:
            self.assertRegex(excluded[8092], r"^listening \(")

    def test_lists_declared_ports_above_the_chosen_port(self) -> None:
        (self.release / COMPOSE_FILE).write_text(
            "controller:\n"
            "  adapter:\n"
            "    port: 20000\n"
            "components:\n"
            "- id: helper\n"
            "  type: http-server\n"
            "  port: ${env.HELPER_PORT | 30000}\n",
            encoding="utf-8",
        )
        result, port = self.run_script()
        excluded = excluded_ports(result.stdout)

        self.assertLess(port, 20000)
        self.assertEqual(excluded[20000], "controller.adapter.port")
        self.assertEqual(
            excluded[30000], "components[0].port in model-compose.yml"
        )

    def test_reports_no_excluded_ports_when_nothing_is_declared(self) -> None:
        (self.release / COMPOSE_FILE).write_text(
            "controller:\n  adapter:\n    base_path: /api\n", encoding="utf-8"
        )
        result, port = self.run_script()
        excluded = excluded_ports(result.stdout)

        self.assertEqual(
            list(excluded),
            list(range(FIRST_CANDIDATE_PORT, port)),
            result.stdout,
        )

        if port == FIRST_CANDIDATE_PORT:
            self.assertIn("excluded ports: none\n", result.stdout)

    def test_adds_components_when_there_are_none_and_keeps_crlf(self) -> None:
        original = b"controller:\r\n  adapter:\r\n    port: 8380\r\n"
        (self.release / COMPOSE_FILE).write_bytes(original)
        self.run_script()
        updated = (self.release / COMPOSE_FILE).read_bytes()

        self.assertTrue(updated.startswith(original))
        self.assertNotIn(b"\n", updated.replace(b"\r\n", b""))
        self.assertEqual(
            webui_of(self.parsed())["manage"]["working_dir"], "web"
        )

    def test_unreadable_yml_exits_with_usage(self) -> None:
        missing = run_add_webui(self.release)
        (self.release / COMPOSE_FILE).write_text(
            "components: [\n", encoding="utf-8"
        )
        broken = run_add_webui(self.release)

        self.assertEqual(missing.returncode, EXIT_USAGE)
        self.assertEqual(broken.returncode, EXIT_USAGE)


if __name__ == "__main__":
    unittest.main()
