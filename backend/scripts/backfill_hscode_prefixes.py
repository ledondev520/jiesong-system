#!/usr/bin/env python3
"""
Input: existing `backend/data/hscode-live/records/*.json`
Output: safe shardable 4-digit-prefix backfill runs for chapters that show 400-record truncation
Pos: HSCode 低频分片补抓编排脚本

Environment prerequisite:
- Reuses `backend/scripts/scrape_hscode_raw.py` for actual network capture.
- Intended to be run in multiple terminals with different shard indexes.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import subprocess
import sys
import time

DEFAULT_RECORDS_DIR = Path(__file__).resolve().parents[1] / "data" / "hscode-live" / "records"
DEFAULT_SCRAPER = Path(__file__).resolve().parent / "scrape_hscode_raw.py"
DEFAULT_THRESHOLD = 400


def scan_existing_records(records_dir: Path) -> tuple[dict[str, int], dict[str, set[str]]]:
    chapter_counts: Counter[str] = Counter()
    existing_prefixes: dict[str, set[str]] = defaultdict(set)

    for path in records_dir.glob("*.json"):
        stem = path.stem
        if len(stem) < 4 or not stem[:4].isdigit():
            continue
        chapter = stem[:2]
        chapter_counts[chapter] += 1
        existing_prefixes[chapter].add(stem[:4])

    return dict(chapter_counts), dict(existing_prefixes)


def find_truncated_chapters(chapter_counts: dict[str, int], threshold: int = DEFAULT_THRESHOLD) -> list[str]:
    return sorted(chapter for chapter, count in chapter_counts.items() if count == threshold)


def build_missing_4digit_prefixes(chapters: list[str], existing_prefixes: dict[str, set[str]]) -> list[str]:
    missing_prefixes: list[str] = []

    for chapter in sorted(chapters):
        existing = existing_prefixes.get(chapter, set())
        base = int(chapter) * 100
        for value in range(base + 1, base + 100):
            prefix = f"{value:04d}"
            if prefix in existing:
                continue
            missing_prefixes.append(prefix)

    return missing_prefixes


def select_shard(prefixes: list[str], shard_index: int, shard_count: int) -> list[str]:
    if shard_count <= 1:
        return list(prefixes)
    return [prefix for index, prefix in enumerate(prefixes) if index % shard_count == shard_index]


def parse_comma_list(raw_value: str | None) -> list[str]:
    if not raw_value:
        return []
    return [item.strip() for item in raw_value.split(",") if item.strip()]


def run_prefix(prefix: str, scraper_path: Path, request_delay: float, workers: int, repo_root: Path) -> dict:
    command = [
        sys.executable,
        str(scraper_path),
        "--chapters",
        prefix,
        "--request-delay",
        str(request_delay),
        "--workers",
        str(workers),
        "--skip-manifest",
    ]
    result = subprocess.run(
        command,
        cwd=str(repo_root),
        capture_output=True,
        text=True,
    )
    return {
        "prefix": prefix,
        "returncode": result.returncode,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Safely backfill missing HSCode 4-digit prefixes for truncated chapters.")
    parser.add_argument("--records-dir", default=str(DEFAULT_RECORDS_DIR), help="Existing records directory.")
    parser.add_argument("--scraper-path", default=str(DEFAULT_SCRAPER), help="Path to scrape_hscode_raw.py.")
    parser.add_argument("--threshold", type=int, default=DEFAULT_THRESHOLD, help="Chapter record count treated as truncated.")
    parser.add_argument("--request-delay", type=float, default=0.8, help="Per-request delay passed to the scraper.")
    parser.add_argument("--workers", type=int, default=2, help="Per-prefix detail workers passed to the scraper.")
    parser.add_argument("--sleep-between-prefixes", type=float, default=2.0, help="Cooldown between prefixes in seconds.")
    parser.add_argument("--shard-count", type=int, default=1, help="Total number of shards.")
    parser.add_argument("--shard-index", type=int, default=0, help="0-based shard index for this terminal.")
    parser.add_argument("--limit", type=int, default=0, help="Optional limit for prefixes in this run.")
    parser.add_argument("--include-chapters", help="Optional comma-separated chapter list override, e.g. 84,85,90.")
    parser.add_argument("--dry-run", action="store_true", help="Print planned prefixes without running the scraper.")
    args = parser.parse_args(argv)

    records_dir = Path(args.records_dir).resolve()
    scraper_path = Path(args.scraper_path).resolve()
    repo_root = Path(__file__).resolve().parents[2]

    chapter_counts, existing_prefixes = scan_existing_records(records_dir)
    chapters = parse_comma_list(args.include_chapters) or find_truncated_chapters(chapter_counts, args.threshold)
    prefixes = build_missing_4digit_prefixes(chapters, existing_prefixes)
    shard_prefixes = select_shard(prefixes, args.shard_index, args.shard_count)
    if args.limit > 0:
        shard_prefixes = shard_prefixes[: args.limit]

    plan = {
        "records_dir": str(records_dir),
        "scraper_path": str(scraper_path),
        "threshold": args.threshold,
        "chapters": chapters,
        "total_prefixes": len(prefixes),
        "shard_count": args.shard_count,
        "shard_index": args.shard_index,
        "planned_prefixes": shard_prefixes,
    }

    if args.dry_run:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0

    print(json.dumps({**plan, "planned_prefixes": shard_prefixes[:20], "planned_prefixes_count": len(shard_prefixes)}, ensure_ascii=False), flush=True)

    for index, prefix in enumerate(shard_prefixes, start=1):
        print(f"== prefix {index}/{len(shard_prefixes)}: {prefix} ==", flush=True)
        result = run_prefix(
            prefix=prefix,
            scraper_path=scraper_path,
            request_delay=args.request_delay,
            workers=args.workers,
            repo_root=repo_root,
        )
        if result["stdout"]:
            print(result["stdout"], flush=True)
        if result["stderr"]:
            print(result["stderr"], file=sys.stderr, flush=True)
        if result["returncode"] != 0:
            return result["returncode"]
        if args.sleep_between_prefixes > 0 and index < len(shard_prefixes):
            time.sleep(args.sleep_between_prefixes)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
