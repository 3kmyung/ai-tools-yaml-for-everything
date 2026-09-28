import base64
import contextlib
import io
import json
import pathlib
import tempfile
import unittest
import unittest.mock

import screenshot
import shoot_screens

PAGE_URL = "http://127.0.0.1:8201/"
REQUIRED_ARGUMENTS = ["--url", PAGE_URL, "--out-directory", "screens"]
PNG_BYTES = b"\x89PNG\r\n\x1a\n"
VIEW = ((390, 844), "dark")
VISIBLE_PLACEMENT = {"top": 12.0, "firstRowBottom": 68.0, "viewport": 844.0}
CUT_OFF_PLACEMENT = {"top": -118.0, "firstRowBottom": -62.0, "viewport": 844.0}


class WithLanguageTest(unittest.TestCase):
    def test_appends_language_to_a_bare_url(self) -> None:
        self.assertEqual(
            screenshot.with_language(PAGE_URL, "ko"), f"{PAGE_URL}?lang=ko"
        )

    def test_merges_language_into_an_existing_query(self) -> None:
        self.assertEqual(
            screenshot.with_language(
                f"{PAGE_URL}?thread=a%20b&lang=en#top", "zh"
            ),
            f"{PAGE_URL}?thread=a+b&lang=zh#top",
        )

    def test_replaces_every_earlier_language(self) -> None:
        self.assertEqual(
            screenshot.with_language(
                f"{PAGE_URL}?lang=ko&lang=zh&empty=", "en"
            ),
            f"{PAGE_URL}?empty=&lang=en",
        )


class ScreenFileTest(unittest.TestCase):
    def test_suffixes_only_non_english_screens(self) -> None:
        self.assertEqual(
            [
                shoot_screens.screen_file("empty-1440-light", language)
                for language in ("en", "ko", "zh")
            ],
            [
                "empty-1440-light.png",
                "empty-1440-light.ko.png",
                "empty-1440-light.zh.png",
            ],
        )


class ArgumentTest(unittest.TestCase):
    def test_screens_default_to_english_and_the_full_set(self) -> None:
        options = shoot_screens.parse_arguments(REQUIRED_ARGUMENTS)

        self.assertEqual(
            (options.language, options.only_sample), ("en", False)
        )

    def test_screens_accept_a_language_and_the_sample_set(self) -> None:
        options = shoot_screens.parse_arguments(
            [*REQUIRED_ARGUMENTS, "--lang", "zh", "--only-sample"]
        )

        self.assertEqual((options.language, options.only_sample), ("zh", True))

    def test_screenshot_accepts_a_language(self) -> None:
        options = screenshot.parse_arguments(
            ["--url", PAGE_URL, "--out", "shot.png", "--lang", "ko"]
        )

        self.assertEqual(options.language, "ko")

    def test_unsupported_language_is_a_usage_error(self) -> None:
        with (
            self.assertRaises(SystemExit) as raised,
            contextlib.redirect_stderr(io.StringIO()),
        ):
            screenshot.parse_arguments(
                ["--url", PAGE_URL, "--out", "shot.png", "--lang", "ja"]
            )

        self.assertEqual(raised.exception.code, 2)

    def test_sample_views_are_the_two_light_desktop_shots(self) -> None:
        self.assertEqual(shoot_screens.SAMPLE_VIEWS, (((1440, 900), "light"),))


class FakeSession:
    def __init__(self, placements: list[dict[str, float]]) -> None:
        self.placements = placements
        self.alignments = 0

    def send(
        self, method: str, params: dict[str, object] | None = None
    ) -> dict[str, object]:
        if method == "Page.captureScreenshot":
            return {"data": base64.b64encode(PNG_BYTES).decode()}

        if method != "Runtime.evaluate":
            return {}

        return {
            "result": {
                "value": self.value_of(str((params or {})["expression"]))
            }
        }

    def value_of(self, expression: str) -> object:
        if expression == shoot_screens.ALIGN_LAST_REPLY_EXPRESSION:
            self.alignments += 1
            return True

        if expression == shoot_screens.RESULT_TOP_PLACEMENT_EXPRESSION:
            index = min(self.alignments, len(self.placements)) - 1
            return json.dumps(self.placements[index])

        if expression == screenshot.MEASURE_EXPRESSION:
            width = VIEW[0][0]
            return json.dumps(
                {"href": PAGE_URL, "inner": width, "scroll": width}
            )

        if expression == "window.innerHeight":
            return VIEW[0][1]

        return False


class ResultTopPlacementTest(unittest.TestCase):
    def test_a_first_row_inside_the_viewport_is_visible(self) -> None:
        self.assertTrue(shoot_screens.result_top_is_visible(VISIBLE_PLACEMENT))

    def test_a_card_top_above_the_viewport_is_not_visible(self) -> None:
        self.assertFalse(
            shoot_screens.result_top_is_visible(CUT_OFF_PLACEMENT)
        )

    def test_a_first_row_below_the_viewport_is_not_visible(self) -> None:
        placement = {"top": 800.0, "firstRowBottom": 860.0, "viewport": 844.0}

        self.assertFalse(shoot_screens.result_top_is_visible(placement))

    def test_the_report_rounds_every_measurement(self) -> None:
        self.assertEqual(
            shoot_screens.describe_result_top(CUT_OFF_PLACEMENT),
            "top=-118 firstRowBottom=-62 viewport=844",
        )


class CaptureResultTopsTest(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory(prefix="result-top-test-")
        self.addCleanup(directory.cleanup)
        self.out_directory = pathlib.Path(directory.name)
        sleeping = unittest.mock.patch.object(shoot_screens.time, "sleep")
        self.addCleanup(sleeping.stop)
        sleeping.start()

    def capture(
        self, placements: list[dict[str, float]], language: str
    ) -> tuple[FakeSession, list[str], str]:
        session = FakeSession(placements)
        output = io.StringIO()

        with contextlib.redirect_stdout(output):
            overflowing = shoot_screens.capture_result_tops(
                session, self.out_directory, (VIEW,), language
            )

        return session, overflowing, output.getvalue()

    def test_an_aligned_card_is_shot_once_under_its_language_name(
        self,
    ) -> None:
        session, overflowing, printed = self.capture([VISIBLE_PLACEMENT], "ko")
        shot = self.out_directory / "result-top-390-dark.ko.png"

        self.assertEqual((session.alignments, overflowing), (1, []))
        self.assertEqual(shot.read_bytes(), PNG_BYTES)
        self.assertNotIn("note:", printed)

    def test_a_late_shift_is_realigned_before_the_shot(self) -> None:
        session, _, printed = self.capture(
            [CUT_OFF_PLACEMENT, VISIBLE_PLACEMENT], "en"
        )

        self.assertEqual(session.alignments, 2)
        self.assertNotIn("note:", printed)
        self.assertTrue(
            (self.out_directory / "result-top-390-dark.png").is_file()
        )

    def test_a_card_that_stays_cut_off_is_noted_and_still_shot(self) -> None:
        session, overflowing, printed = self.capture([CUT_OFF_PLACEMENT], "en")

        self.assertEqual(session.alignments, shoot_screens.RESULT_TOP_ATTEMPTS)
        self.assertIn(
            "note: result-top 390 dark still cuts off the card's first row"
            " (top=-118 firstRowBottom=-62 viewport=844)",
            printed,
        )
        self.assertEqual(overflowing, [])
        self.assertTrue(
            (self.out_directory / "result-top-390-dark.png").is_file()
        )


if __name__ == "__main__":
    unittest.main()
