import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from diagnose_hscode_gaps import (
    classify_chapter_gap,
    summarize_chapter_prefixes,
)


class DiagnoseHsCodeGapsTests(unittest.TestCase):
    def test_summarize_chapter_prefixes_detects_contiguous_boundary_without_internal_gaps(self):
        summary = summarize_chapter_prefixes(
            chapter="55",
            existing_prefixes={f"55{i:02d}" for i in range(1, 17)},
        )

        self.assertEqual(summary["min_prefix"], "5501")
        self.assertEqual(summary["max_prefix"], "5516")
        self.assertEqual(summary["contiguous_end"], "5516")
        self.assertEqual(summary["internal_missing"], [])
        self.assertEqual(summary["boundary_candidates"][:3], ["5517", "5518", "5519"])

    def test_summarize_chapter_prefixes_detects_internal_missing_prefixes(self):
        summary = summarize_chapter_prefixes(
            chapter="29",
            existing_prefixes={"2901", "2902", "2904", "2905"},
        )

        self.assertEqual(summary["internal_missing"], ["2903"])
        self.assertEqual(summary["contiguous_end"], "2902")

    def test_classify_chapter_gap_marks_false_positive_when_boundary_prefixes_have_no_hits(self):
        summary = summarize_chapter_prefixes(
            chapter="55",
            existing_prefixes={f"55{i:02d}" for i in range(1, 17)},
        )

        classification = classify_chapter_gap(
            chapter="55",
            summary=summary,
            probe_hits={
                "5517": 0,
                "5518": 0,
                "5519": 0,
            },
        )

        self.assertEqual(classification["status"], "likely_complete_boundary")

    def test_classify_chapter_gap_marks_incomplete_when_missing_prefix_has_hits(self):
        summary = summarize_chapter_prefixes(
            chapter="29",
            existing_prefixes={"2901", "2902", "2904"},
        )

        classification = classify_chapter_gap(
            chapter="29",
            summary=summary,
            probe_hits={
                "2903": 5,
            },
        )

        self.assertEqual(classification["status"], "likely_incomplete")


if __name__ == "__main__":
    unittest.main()
