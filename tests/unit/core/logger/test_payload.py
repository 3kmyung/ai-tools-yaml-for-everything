"""Unit tests for ``mindor.core.logger.payload``.

Scope:
- binary payloads never reach the log as raw bytes
- oversized strings / sequences / mappings are bounded
- formatting stays lazy so a disabled log level costs nothing
"""

from __future__ import annotations

from mindor.core.logger.payload import MAX_SEQUENCE_ITEMS, MAX_STRING_CHARS, MAX_TOTAL_CHARS, loggable


class TestBinaryPayloads:
    def test_bytes_are_summarized_not_dumped(self):
        rendered = str(loggable(b"\x89PNG\r\n\x1a\n" + b"\xff" * 4096))

        assert rendered == "<bytes 4.0 KB>"

    def test_small_bytes_report_exact_size(self):
        assert str(loggable(b"abc")) == "<bytes 3 bytes>"

    def test_bytearray_and_memoryview_are_summarized(self):
        assert str(loggable(bytearray(b"abc"))) == "<bytearray 3 bytes>"
        assert str(loggable(memoryview(b"abcd"))) == "<memoryview 4 bytes>"

    def test_nested_bytes_are_summarized(self):
        rendered = str(loggable({ "source": b"\xff" * 2048, "path": "cover.png" }))

        assert rendered == "{'source': <bytes 2.0 KB>, 'path': 'cover.png'}"

    def test_bytes_inside_a_list_are_summarized(self):
        rendered = str(loggable({ "frames": [ b"\x00" * 1024, b"\x00" * 1024 ] }))

        assert rendered == "{'frames': [<bytes 1.0 KB>, <bytes 1.0 KB>]}"


class TestBoundedPayloads:
    def test_short_values_pass_through_unchanged(self):
        assert str(loggable({ "fps": 30, "title": "Untitled", "colors": None })) == (
            "{'fps': 30, 'title': 'Untitled', 'colors': None}"
        )

    def test_long_strings_are_truncated_with_a_remainder_hint(self):
        rendered = str(loggable("a" * (MAX_STRING_CHARS + 50)))

        assert rendered.startswith("'" + "a" * MAX_STRING_CHARS)
        assert rendered.endswith("... (+50 chars)")

    def test_long_sequences_are_truncated_with_a_remainder_hint(self):
        rendered = str(loggable(list(range(MAX_SEQUENCE_ITEMS + 7))))

        assert rendered.startswith("[0, 1, 2,")
        assert rendered.endswith("... (+7 more)]")

    def test_deep_nesting_stops_at_the_depth_limit(self):
        payload = value = {}
        for _ in range(12):
            value["next"] = {}
            value = value["next"]

        assert "..." in str(loggable(payload))

    def test_wide_nesting_stays_within_the_total_budget(self):
        spectrum = { "spectrum": [ [ 0.1 ] * 18 for _ in range(900) ] }

        rendered = str(loggable(spectrum))

        assert len(rendered) <= MAX_TOTAL_CHARS + len("... (+0 chars)") + 12
        assert rendered.endswith("}")

    def test_unknown_objects_fall_back_to_a_bounded_repr(self):
        class Chatty:
            def __repr__(self) -> str:
                return "x" * (MAX_STRING_CHARS + 20)

        rendered = str(loggable(Chatty()))

        assert len(rendered) < MAX_STRING_CHARS + 40
        assert rendered.endswith("... (+20 chars)")


class TestLaziness:
    def test_formatting_is_deferred_until_the_record_is_rendered(self):
        calls = []

        class Counted:
            def __repr__(self) -> str:
                calls.append(1)
                return "counted"

        wrapper = loggable({ "value": Counted() })
        assert calls == []

        assert "counted" in "%s" % (wrapper,)
        assert calls == [ 1 ]


class TestLogHooks:
    def test_log_hook_replaces_the_default_rendering(self):
        class Spectrum(dict):
            def __log__(self) -> str:
                return "<AudioSpectrum bands=18 frames=900 duration=30.00s>"

        spectrum = Spectrum({ "frames": [ [ 0.1 ] * 18 for _ in range(900) ], "band_count": 18 })

        assert str(loggable(spectrum)) == "<AudioSpectrum bands=18 frames=900 duration=30.00s>"

    def test_log_hook_is_honored_for_nested_values(self):
        class Embedding(list):
            def __log__(self) -> str:
                return "<TextEmbedding dims=1536>"

        rendered = str(loggable({ "vector": Embedding([ 0.1 ] * 1536) }))

        assert rendered == "{'vector': <TextEmbedding dims=1536>}"

    def test_log_hook_output_is_bounded(self):
        class Chatty:
            def __log__(self) -> str:
                return "x" * (MAX_STRING_CHARS + 20)

        rendered = str(loggable(Chatty()))

        assert rendered.endswith("... (+20 chars)")


class TestRedaction:
    def test_sensitive_keys_are_redacted(self):
        rendered = str(loggable({ "url": "https://youtu.be/x", "cookies": [ { "name": "SID", "value": "s3cr3t" } ] }))

        assert rendered == "{'url': 'https://youtu.be/x', 'cookies': <redacted>}"

    def test_key_matching_ignores_case_and_dashes(self):
        rendered = str(loggable({ "Api-Key": "abc", "AUTHORIZATION": "Bearer xyz" }))

        assert rendered == "{'Api-Key': <redacted>, 'AUTHORIZATION': <redacted>}"

    def test_cookie_entries_keep_their_shape_but_drop_the_value(self):
        cookies = [
            { "name": "SAPISID", "value": "A" * 70, "domain": ".youtube.com", "path": "/" },
            { "name": "SID", "value": "B" * 120, "domain": ".google.com", "path": "/" },
        ]

        rendered = str(loggable(cookies))

        assert "A" * 70 not in rendered
        assert "B" * 120 not in rendered
        assert rendered == (
            "[{'name': 'SAPISID', 'value': <redacted>, 'domain': '.youtube.com', 'path': '/'}, "
            "{'name': 'SID', 'value': <redacted>, 'domain': '.google.com', 'path': '/'}]"
        )

    def test_ordinary_value_keys_are_left_alone(self):
        rendered = str(loggable({ "name": "cover.png", "value": 42 }))

        assert rendered == "{'name': 'cover.png', 'value': 42}"
