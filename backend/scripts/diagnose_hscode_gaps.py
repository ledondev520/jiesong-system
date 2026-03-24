#!/usr/bin/env python3
"""
Input: `backend/data/hscode-live/records/*.json`
Output: HSCode missing-gap diagnosis summary with optional source probes
Pos: HSCode 缺失诊断脚本
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from scrape_hscode_raw import collect_search_codes, make_session

DEFAULT_RECORDS_DIR = Path(__file__).resolve().parents[1] / "data" / "hscode-live" / "records"


def summarize_chapter_prefixes(chapter: str, existing_prefixes: set[str]) -> dict:
    sorted_prefixes = sorted(existing_prefixes)
    if not sorted_prefixes:
        return {
            "chapter": chapter,
            "min_prefix": None,
            "max_prefix": None,
            "contiguous_end": None,
            "internal_missing": [],
            "boundary_candidates": [],
        }

    base = int(chapter) * 100
    existing_values = sorted(int(prefix) for prefix in sorted_prefixes)
    existing_set = set(existing_values)

    contiguous_end = base
    for value in range(base + 1, base + 100):
        if value not in existing_set:
            break
        contiguous_end = value

    max_value = max(existing_values)
    internal_missing = [
        f"{value:04d}"
        for value in range(base + 1, max_value)
        if value not in existing_set
    ]
    boundary_candidates = [
        f"{value:04d}"
        for value in range(max_value + 1, base + 100)
    ]

    return {
        "chapter": chapter,
        "min_prefix": f"{existing_values[0]:04d}",
        "max_prefix": f"{max_value:04d}",
        "contiguous_end": f"{contiguous_end:04d}",
        "internal_missing": internal_missing,
        "boundary_candidates": boundary_candidates,
    }


def classify_chapter_gap(chapter: str, summary: dict, probe_hits: dict[str, int]) -> dict:
    internal_missing = summary["internal_missing"]
    if any(probe_hits.get(prefix, 0) > 0 for prefix in internal_missing):
        return {
            "chapter": chapter,
            "status": "likely_incomplete",
            "reason": "Internal missing prefixes still return source hits.",
        }

    boundary_candidates = summary["boundary_candidates"][:3]
    if boundary_candidates and all(probe_hits.get(prefix, 0) == 0 for prefix in boundary_candidates):
        return {
            "chapter": chapter,
            "status": "likely_complete_boundary",
            "reason": "Boundary prefixes after the current max prefix return no source hits.",
        }

    return {
        "chapter": chapter,
        "status": "needs_manual_review",
        "reason": "No positive hit found, but evidence is not strong enough for automatic closure.",
    }


def scan_existing_prefixes(records_dir: Path) -> dict[str, set[str]]:
    chapter_prefixes: dict[str, set[str]] = {}
    for path in sorted(records_dir.glob("*.json")):
        stem = path.stem
        if len(stem) < 4 or not stem[:4].isdigit():
            continue
        chapter = stem[:2]
        chapter_prefixes.setdefault(chapter, set()).add(stem[:4])
    return chapter_prefixes


def probe_prefix_hits(prefixes: list[str], request_delay: float) -> dict[str, int]:
    session = make_session()
    results: dict[str, int] = {}
    try:
        for prefix in prefixes:
            codes = collect_search_codes(
                session=session,
                keyword=prefix,
                page=1,
                request_delay=request_delay,
            )
            results[prefix] = len(codes)
    finally:
        session.close()
    return results


def diagnose(records_dir: Path, chapters: list[str], request_delay: float) -> dict:
    chapter_prefixes = scan_existing_prefixes(records_dir)
    target_chapters = chapters or sorted(chapter_prefixes)
    diagnostics = []

    for chapter in target_chapters:
        existing_prefixes = chapter_prefixes.get(chapter, set())
        summary = summarize_chapter_prefixes(chapter, existing_prefixes)
        prefixes_to_probe = summary["internal_missing"][:3] + summary["boundary_candidates"][:3]
        probe_hits = probe_prefix_hits(prefixes_to_probe, request_delay=request_delay) if prefixes_to_probe else {}
        classification = classify_chapter_gap(chapter, summary, probe_hits)
        diagnostics.append(
            {
                "chapter": chapter,
                "existing_prefix_count": len(existing_prefixes),
                "summary": summary,
                "probe_hits": probe_hits,
                "classification": classification,
            }
        )

    return {
        "records_dir": str(records_dir),
        "diagnostics": diagnostics,
    }


def parse_chapter_args(raw_value: str | None) -> list[str]:
    if not raw_value:
        return []
    return [piece.strip() for piece in raw_value.split(",") if piece.strip()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Diagnose potential HSCode gaps using local prefixes plus source probes.")
    parser.add_argument("--records-dir", default=str(DEFAULT_RECORDS_DIR))
    parser.add_argument("--chapters", help="Optional comma-separated chapter list, e.g. 55,29,84.")
    parser.add_argument("--request-delay", type=float, default=0.5)
    args = parser.parse_args(argv)

    result = diagnose(
        records_dir=Path(args.records_dir).resolve(),
        chapters=parse_chapter_args(args.chapters),
        request_delay=args.request_delay,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
