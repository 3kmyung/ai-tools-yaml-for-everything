import pathlib
import subprocess
import sys
import tempfile
import unittest

import shell_files

SCRIPTS_DIRECTORY = pathlib.Path(__file__).resolve().parent
SCAFFOLD_SCRIPT = SCRIPTS_DIRECTORY / "scaffold.py"
VERIFY_SCRIPT = SCRIPTS_DIRECTORY / "verify.py"
PACKAGE_NAME = "fixture-web"
RELEASE_NAME = "fixture-release"
PAGE_TITLE = "픽스처 & <화면>"
RELEASE_FILE = "src/release/index.tsx"
DOMAIN_TEST_FILE = "test/domain/result.test.ts"
DOMAIN_TEST_TEXT = (
    'import { expect, it } from "vitest";\n'
    'import { readCapturedOutput } from "../support/captured-output";\n'
    'it("reads", () => expect(readCapturedOutput("beta")).toBeTruthy());\n'
)
RELEASE_TEXT = 'export { release } from "./definition";\n'
EXIT_SUCCESS = 0
EXIT_VIOLATION = 1
EXIT_USAGE = 2


class VerifyTest(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory(prefix="verify-test-")
        self.addCleanup(directory.cleanup)
        repository = pathlib.Path(directory.name)
        self.web_directory = repository / "releases" / RELEASE_NAME / "web"
        self.workspace_web_directory = (
            repository / "workspaces" / RELEASE_NAME / "web"
        )

    def scaffold(self) -> subprocess.CompletedProcess[str]:
        return run_script(
            SCAFFOLD_SCRIPT,
            str(self.web_directory),
            "--name",
            PACKAGE_NAME,
            "--title",
            PAGE_TITLE,
        )

    def verify(self) -> subprocess.CompletedProcess[str]:
        return run_script(VERIFY_SCRIPT, str(self.web_directory))

    def write_web_file(self, relative_path: str, text: str) -> None:
        owner = shell_files.owner_directory(self.web_directory, relative_path)
        path = owner / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def add_domain_test(self) -> None:
        self.write_web_file(DOMAIN_TEST_FILE, DOMAIN_TEST_TEXT)
        self.write_web_file(RELEASE_FILE, RELEASE_TEXT)

    def test_a_fresh_scaffold_reports_the_stub_and_the_missing_domain_test(
        self,
    ) -> None:
        scaffolded = self.scaffold()
        verified = self.verify()

        self.assertEqual(
            scaffolded.returncode, EXIT_SUCCESS, scaffolded.stderr
        )
        self.assertEqual(verified.returncode, EXIT_VIOLATION)
        self.assertEqual(
            verified.stdout.strip().split("\n"),
            [
                (
                    f"{RELEASE_FILE}: still the scaffold stub,"
                    " write the release definition"
                ),
                (
                    "test/domain/: no test calls readCapturedOutput()"
                    " from test/support/captured-output"
                ),
            ],
        )

    def test_verify_reports_stub_left_beside_domain_test(self) -> None:
        self.scaffold()
        self.write_web_file(DOMAIN_TEST_FILE, DOMAIN_TEST_TEXT)

        verified = self.verify()

        self.assertEqual(verified.returncode, EXIT_VIOLATION)
        self.assertIn(
            f"{RELEASE_FILE}: still the scaffold stub", verified.stdout
        )

        for copy_path in shell_files.fixed_copies():
            owner = shell_files.owner_directory(self.web_directory, copy_path)
            self.assertTrue((owner / copy_path).is_file(), copy_path)

    def test_release_with_domain_test_passes_verify(self) -> None:
        self.scaffold()
        self.add_domain_test()
        self.write_web_file(
            "src/domain/result.ts",
            "export const windowSize = 3;\n"
            "export function readWindow() { return 1; }\n",
        )

        verified = self.verify()

        self.assertEqual(verified.returncode, EXIT_SUCCESS, verified.stdout)

    def test_verify_reports_files_outside_release_directories(self) -> None:
        self.scaffold()
        self.add_domain_test()
        self.write_web_file("src/features/thread/Extra.tsx", "export {};\n")
        self.write_web_file("test/core/extra.test.ts", "export {};\n")

        verified = self.verify()

        self.assertEqual(verified.returncode, EXIT_VIOLATION)
        self.assertIn(
            "src/features/thread/Extra.tsx: not a shell file", verified.stdout
        )
        self.assertIn(
            "test/core/extra.test.ts: not a shell file", verified.stdout
        )

    def test_verify_reports_impure_domain_code(self) -> None:
        self.scaffold()
        self.add_domain_test()
        self.write_web_file(
            "src/domain/impure.ts",
            'import { useState } from "react";\n'
            'import { createRoot } from "react-dom/client";\n'
            'export const load = () => fetch("/api");\n'
            'export const socket = new WebSocket("ws://x");\n'
            "export const title = () =>"
            " document.title + window.location.href;\n",
        )

        verified = self.verify()

        self.assertEqual(verified.returncode, EXIT_VIOLATION)

        for expected in (
            "src/domain/impure.ts:1: domain code imports React",
            "src/domain/impure.ts:2: domain code imports React",
            "src/domain/impure.ts:3: domain code calls fetch",
            "src/domain/impure.ts:4: domain code uses WebSocket",
            "src/domain/impure.ts:5: domain code touches document",
            "src/domain/impure.ts:5: domain code touches window",
        ):
            self.assertIn(expected, verified.stdout)

    def test_verify_reports_native_media_controls(self) -> None:
        self.scaffold()
        self.add_domain_test()
        self.write_web_file(
            "src/release/Player.tsx",
            "export const Player = () => (\n  <div>\n    <audio\n"
            "      src={source}\n"
            "      controls\n    />\n    <video controls />\n"
            "    <audio src={source} />\n"
            "  </div>\n);\n",
        )

        verified = self.verify()

        self.assertIn(
            "src/release/Player.tsx:3: <audio controls>", verified.stdout
        )
        self.assertIn(
            "src/release/Player.tsx:7: <video controls>", verified.stdout
        )
        self.assertNotIn("src/release/Player.tsx:8", verified.stdout)

    def test_verify_reports_korean_and_chinese_outside_localized_lines(
        self,
    ) -> None:
        self.scaffold()
        self.add_domain_test()
        self.write_web_file(
            "src/release/copy.ts",
            "export const TITLE = {\n"
            '  en: "Beta",\n'
            '  ko: "베타",\n'
            '  "zh": "贝塔",\n'
            "};\n"
            'export const inline = { en: "Beta", ko: "베타", zh: "贝塔" };\n'
            'export const hangul = "베타";\n'
            'export const chinese = "贝塔";\n'
            "export const Label = () => <span>원본</span>;\n",
        )
        self.write_web_file(
            "src/domain/names.ts", 'export const name = "이름";\n'
        )

        verified = self.verify()

        self.assertEqual(verified.returncode, EXIT_VIOLATION)
        reported = [
            line.split(":")[1]
            for line in verified.stdout.split("\n")
            if line.startswith("src/release/copy.ts:")
        ]
        self.assertEqual(reported, ["6", "7", "8", "9"])
        self.assertIn("outside a ko: or zh: line", verified.stdout)
        self.assertNotIn("src/domain/names.ts", verified.stdout)

    def test_verify_accepts_localized_stub_release_lines(self) -> None:
        self.scaffold()
        self.add_domain_test()
        stub = shell_files.stub_files()[RELEASE_FILE]
        self.write_web_file(
            "src/release/definition.tsx", shell_files.read_normalized(stub)
        )

        verified = self.verify()

        self.assertEqual(verified.returncode, EXIT_SUCCESS, verified.stdout)

    def test_verify_requires_domain_test_to_read_captured_output(self) -> None:
        self.scaffold()
        self.write_web_file(
            DOMAIN_TEST_FILE,
            'import { readFileSync } from "node:fs";\n'
            'readFileSync("../captured-output.json", "utf8");\n',
        )
        self.write_web_file(
            "test/domain/helpers.ts", "readCapturedOutput();\n"
        )

        verified = self.verify()

        self.assertEqual(verified.returncode, EXIT_VIOLATION)
        self.assertIn(
            "test/domain/: no test calls readCapturedOutput()", verified.stdout
        )

    def test_verify_reports_changed_fixed_and_rendered_files(self) -> None:
        self.scaffold()
        card = self.web_directory / "src/ui/Card.tsx"
        card.write_text(
            card.read_text(encoding="utf-8") + "\n", encoding="utf-8"
        )
        package = self.web_directory / shell_files.PACKAGE_FILE
        package.write_text(
            package.read_text(encoding="utf-8").replace('"8.3.0"', '"^8.3.0"'),
            encoding="utf-8",
        )

        verified = self.verify()

        self.assertEqual(verified.returncode, EXIT_VIOLATION)
        self.assertIn("src/ui/Card.tsx: differs", verified.stdout)
        self.assertIn("package.json: differs", verified.stdout)

    def test_scaffold_puts_tests_in_the_workspace_and_nothing_else(
        self,
    ) -> None:
        self.scaffold()

        self.assertFalse((self.web_directory / "test").exists())
        self.assertTrue(
            (
                self.workspace_web_directory
                / "test/support/captured-output.ts"
            ).is_file()
        )
        self.assertEqual(
            {
                path.relative_to(self.workspace_web_directory).parts[0]
                for path in self.workspace_web_directory.rglob("*")
                if path.is_file()
            },
            {"test"},
        )
        self.assertIn(
            f'"../../../workspaces/{RELEASE_NAME}/web"',
            (
                self.web_directory / shell_files.TYPESCRIPT_CONFIG_FILE
            ).read_text(encoding="utf-8"),
        )

    def test_verify_reports_tests_and_captures_left_in_the_release(
        self,
    ) -> None:
        self.scaffold()
        self.add_domain_test()
        stray_test = self.web_directory / "test/core/stray.test.ts"
        stray_test.parent.mkdir(parents=True)
        stray_test.write_text("export {};\n", encoding="utf-8")
        (self.web_directory.parent / "captured-output.json").write_text(
            "{}", encoding="utf-8"
        )

        verified = self.verify()

        self.assertEqual(verified.returncode, EXIT_VIOLATION)
        self.assertIn(
            "test/: ships with the release, move it to"
            f" workspaces/{RELEASE_NAME}/web/test/",
            verified.stdout,
        )
        self.assertIn(
            "../captured-output.json: ships with the release, move it to"
            f" workspaces/{RELEASE_NAME}/",
            verified.stdout,
        )

    def test_scaffold_and_verify_refuse_a_directory_outside_releases(
        self,
    ) -> None:
        outside = self.web_directory.parent.parent.parent / "web"

        scaffolded = run_script(
            SCAFFOLD_SCRIPT,
            str(outside),
            "--name",
            PACKAGE_NAME,
            "--title",
            PAGE_TITLE,
        )
        verified = run_script(VERIFY_SCRIPT, str(outside))

        self.assertEqual(scaffolded.returncode, EXIT_USAGE)
        self.assertEqual(verified.returncode, EXIT_USAGE)
        self.assertFalse(outside.exists())

    def test_a_missing_web_directory_exits_with_usage(self) -> None:
        self.assertEqual(run_script(VERIFY_SCRIPT).returncode, EXIT_USAGE)


def run_script(
    script: pathlib.Path, *arguments: str
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-B", str(script), *arguments],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )


if __name__ == "__main__":
    unittest.main()
