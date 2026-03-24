import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from backfill_hscode_prefixes import (
    build_missing_4digit_prefixes,
    find_truncated_chapters,
    probe_prefixes_with_source_hits,
    select_shard,
)


class BackfillHsCodePrefixesTests(unittest.TestCase):
    def test_find_truncated_chapters_returns_sorted_400_count_chapters(self):
        chapter_counts = {
            "84": 400,
            "85": 399,
            "29": 400,
            "03": 401,
        }

        self.assertEqual(find_truncated_chapters(chapter_counts), ["29", "84"])

    def test_build_missing_4digit_prefixes_returns_chapter_local_missing_prefixes(self):
        existing_prefixes = {
            "84": {"8401", "8402", "8417", "8421"},
            "29": {"2901", "2902"},
        }

        prefixes = build_missing_4digit_prefixes(["84", "29"], existing_prefixes)

        self.assertIn("8403", prefixes)
        self.assertIn("8420", prefixes)
        self.assertIn("8499", prefixes)
        self.assertIn("2903", prefixes)
        self.assertIn("2999", prefixes)
        self.assertNotIn("8401", prefixes)
        self.assertNotIn("8421", prefixes)
        self.assertNotIn("2901", prefixes)

    def test_select_shard_uses_round_robin_distribution(self):
        prefixes = ["8403", "8404", "8405", "8406", "8407"]

        self.assertEqual(select_shard(prefixes, shard_index=0, shard_count=2), ["8403", "8405", "8407"])
        self.assertEqual(select_shard(prefixes, shard_index=1, shard_count=2), ["8404", "8406"])

    def test_probe_prefixes_with_source_hits_filters_empty_prefixes(self):
        class FakeSession:
            def close(self):
                return None

        def fake_search_fn(session, keyword, page, request_delay):
            self.assertEqual(page, 1)
            return ["5501100000"] if keyword in {"5501", "5516"} else []

        prefixes = ["5501", "5517", "5516", "5599"]

        verified = probe_prefixes_with_source_hits(
            prefixes,
            request_delay=0,
            session_factory=FakeSession,
            search_fn=fake_search_fn,
        )

        self.assertEqual(verified, ["5501", "5516"])


if __name__ == "__main__":
    unittest.main()
