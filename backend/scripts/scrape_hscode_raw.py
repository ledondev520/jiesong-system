#!/usr/bin/env python3
"""
Input: hsbianma.com 搜索页与详情页
Output: 本地原始 HSCode 结构化快照（逐条 JSON + manifest）
Pos: 后端离线数据抓取脚本

Environment prerequisite:
- Requires `requests`, `bs4`, and `lxml` in the current Python environment.
- Writes only inside the repository under `backend/data/hscode-live`.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://www.hsbianma.com"
SEARCH_URL = BASE_URL + "/Search/{page}?keywords={keyword}"
DETAIL_URL = BASE_URL + "/Code/{code}.html"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "data" / "hscode-live"
USER_AGENT = "Mozilla/5.0 (Codex HSCode Raw Capture; +https://github.com/openai)"
CODE_LINK_PATTERN = re.compile(r"/Code/(\d{10})\.html")
SEARCH_PAGE_SIZE_HINT = 20


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_text(value: str | None) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def make_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5",
        }
    )
    retry = Retry(
        total=3,
        backoff_factor=0.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=4, pool_maxsize=4)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def fetch_html(session: requests.Session, url: str, request_delay: float) -> str:
    response = session.get(url, timeout=20)
    response.raise_for_status()
    response.encoding = "utf-8"
    if request_delay > 0:
        time.sleep(request_delay)
    return response.text


def extract_code_links(html: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    codes: list[str] = []
    seen: set[str] = set()
    for link in soup.find_all("a", href=True):
        match = CODE_LINK_PATTERN.search(link["href"])
        if not match:
            continue
        code = match.group(1)
        if code in seen:
            continue
        seen.add(code)
        codes.append(code)
    return codes


def is_retryable_empty_search(html: str, codes: list[str]) -> bool:
    if codes:
        return False
    normalized = normalize_text(BeautifulSoup(html, "lxml").get_text(" ", strip=True))
    return "页面提示" in normalized or "有关的HS编码" in normalized


def collect_search_codes(
    session: requests.Session,
    keyword: str,
    page: int,
    request_delay: float,
    fetcher=fetch_html,
    empty_retry_count: int = 3,
) -> list[str]:
    search_url = SEARCH_URL.format(page=page, keyword=keyword)
    for attempt in range(empty_retry_count):
        html = fetcher(session, search_url, request_delay)
        codes = extract_code_links(html)
        if codes or not is_retryable_empty_search(html, codes):
            return codes
        time.sleep(min(1.5, 0.4 * (attempt + 1)))
    return []


def expand_keyword_children(keyword: str) -> list[str]:
    normalized = normalize_text(keyword)
    if not normalized.isdigit() or len(normalized) >= 10:
        return []
    return [f"{normalized}{suffix:02d}" for suffix in range(100)]


def merge_unique_codes(*code_groups: Iterable[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for codes in code_groups:
        for code in codes:
            if code in seen:
                continue
            seen.add(code)
            merged.append(code)
    return merged


def merge_unique_keywords(*keyword_groups: Iterable[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for keywords in keyword_groups:
        for keyword in keywords:
            if keyword in seen:
                continue
            seen.add(keyword)
            merged.append(keyword)
    return merged


def collect_keyword_codes_tree(
    session: requests.Session,
    keyword: str,
    request_delay: float,
    max_pages: int,
    fetcher=fetch_html,
    seen_keywords: set[str] | None = None,
) -> dict:
    normalized_keyword = normalize_text(keyword)
    visited = seen_keywords if seen_keywords is not None else set()
    if normalized_keyword in visited:
        return {
            "keyword": normalized_keyword,
            "codes": [],
            "pages": [],
            "code_sources": {},
            "refined": False,
            "truncated": False,
            "expanded_keywords": [],
        }
    visited.add(normalized_keyword)

    discovered_codes: list[str] = []
    page_summaries: list[dict] = []
    code_sources: dict[str, dict[str, int | str]] = {}
    exhausted_after_full_page = False

    for page in range(1, max_pages + 1):
        search_url = SEARCH_URL.format(page=page, keyword=normalized_keyword)
        codes = collect_search_codes(
            session=session,
            keyword=normalized_keyword,
            page=page,
            request_delay=request_delay,
            fetcher=fetcher,
        )
        if not codes:
            exhausted_after_full_page = bool(page_summaries) and len(page_summaries[-1]["codes"]) >= SEARCH_PAGE_SIZE_HINT
            break

        discovered_codes.extend(codes)
        page_summaries.append(
            {
                "keyword": normalized_keyword,
                "page": page,
                "search_url": search_url,
                "codes": codes,
                "captured_at": utc_now_iso(),
            }
        )
        for code in codes:
            if code not in code_sources:
                code_sources[code] = {"keyword": normalized_keyword, "page": page}

    unique_codes = merge_unique_codes(discovered_codes)
    truncated = bool(page_summaries) and (
        exhausted_after_full_page
        or (
            len(page_summaries) == max_pages
            and len(page_summaries[-1]["codes"]) >= SEARCH_PAGE_SIZE_HINT
        )
    )
    refined = False
    expanded_keywords: list[str] = []

    if truncated:
        child_keywords = expand_keyword_children(normalized_keyword)
        if child_keywords:
            refined = True
        for child_keyword in child_keywords:
            child_summary = collect_keyword_codes_tree(
                session=session,
                keyword=child_keyword,
                request_delay=request_delay,
                max_pages=max_pages,
                fetcher=fetcher,
                seen_keywords=visited,
            )
            if not child_summary["codes"]:
                continue

            expanded_keywords = merge_unique_keywords(
                expanded_keywords,
                [child_keyword],
                child_summary["expanded_keywords"],
            )
            unique_codes = merge_unique_codes(unique_codes, child_summary["codes"])
            page_summaries.extend(child_summary["pages"])
            for code, source in child_summary["code_sources"].items():
                code_sources.setdefault(code, source)

    return {
        "keyword": normalized_keyword,
        "codes": unique_codes,
        "pages": page_summaries,
        "code_sources": code_sources,
        "refined": refined,
        "truncated": truncated,
        "expanded_keywords": expanded_keywords,
    }


def table_rows(table) -> list[list[str]]:
    if table is None:
        return []

    rows: list[list[str]] = []
    for tr in table.find_all("tr"):
        cells = [normalize_text(cell.get_text(" ", strip=True)) for cell in tr.find_all(["th", "td"])]
        cells = [cell for cell in cells if cell]
        if cells:
            rows.append(cells)
    return rows


def find_section_table(soup: BeautifulSoup, heading_prefix: str):
    for heading in soup.find_all("h3"):
        text = normalize_text(heading.get_text(" ", strip=True))
        if not text.startswith(heading_prefix):
            continue
        return heading.find_next("table")
    return None


def parse_key_value_rows(rows: Iterable[list[str]]) -> dict[str, str]:
    result: dict[str, str] = {}
    for row in rows:
        if len(row) < 2:
            continue
        result[row[0]] = row[1]
    return result


def parse_labeled_rows(rows: Iterable[list[str]]) -> list[dict[str, str | int | None]]:
    result: list[dict[str, str | int | None]] = []
    for row in rows:
        if len(row) == 1:
            result.append({"index": None, "code": None, "value": row[0]})
            continue

        left = row[0]
        if left.isdigit():
            result.append({"index": int(left), "code": None, "value": row[1]})
            continue

        result.append({"index": None, "code": left, "value": row[1]})
    return result


def parse_rate_rows(rows: Iterable[list[str]]) -> dict[str, str]:
    rates: dict[str, str] = {}
    for row in rows:
        if len(row) >= 2:
            rates[row[0]] = row[1]
    return rates


def parse_code_value_rows(rows: Iterable[list[str]]) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    for row in rows:
        if len(row) >= 2:
            result.append({"code": row[0], "value": row[1]})
    return result


def parse_detail_page(html: str, source_url: str) -> dict:
    soup = BeautifulSoup(html, "lxml")
    title = normalize_text(soup.title.get_text(" ", strip=True) if soup.title else "")

    basic_info = parse_key_value_rows(table_rows(find_section_table(soup, "基本信息")))
    tax_info = parse_key_value_rows(table_rows(find_section_table(soup, "税率信息")))
    declaration_elements = parse_labeled_rows(table_rows(find_section_table(soup, "申报要素")))
    supervision_conditions = parse_labeled_rows(table_rows(find_section_table(soup, "监管条件")))
    inspection_quarantine = parse_labeled_rows(table_rows(find_section_table(soup, "检验检疫类别")))
    agreement_rates = parse_rate_rows(table_rows(find_section_table(soup, "协定税率")))
    rcep_rates = parse_rate_rows(table_rows(find_section_table(soup, "RCEP税率")))
    chapter_hierarchy = parse_code_value_rows(table_rows(find_section_table(soup, "所属章节")))
    ciq_codes = parse_code_value_rows(table_rows(find_section_table(soup, "CIQ代码")))

    hs_code = basic_info.get("商品编码", "")
    if not hs_code:
        match = CODE_LINK_PATTERN.search(source_url)
        hs_code = match.group(1) if match else ""

    return {
        "hs_code": hs_code,
        "title": title,
        "source_url": source_url,
        "fetched_at": utc_now_iso(),
        "basic_info": basic_info,
        "tax_info": tax_info,
        "declaration_elements": declaration_elements,
        "supervision_conditions": supervision_conditions,
        "inspection_quarantine": inspection_quarantine,
        "agreement_rates": agreement_rates,
        "rcep_rates": rcep_rates,
        "chapter_hierarchy": chapter_hierarchy,
        "ciq_codes": ciq_codes,
    }


def parse_chapter_list(raw_value: str | None) -> list[str]:
    if not raw_value:
        return [f"{chapter:02d}" for chapter in range(1, 100)]

    chapters: list[str] = []
    for part in raw_value.split(","):
        piece = part.strip()
        if not piece:
            continue
        if piece.isdigit():
            chapters.append(f"{int(piece):02d}")
            continue
        raise ValueError(f"invalid chapter value: {piece}")
    return chapters


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def rebuild_manifest_snapshot(output_dir: Path) -> dict:
    records_dir = output_dir / "records"
    chapter_prefix_counts: dict[str, int] = {}
    if records_dir.exists():
        for path in sorted(records_dir.glob("*.json")):
            prefix = path.stem[:2]
            chapter_prefix_counts[prefix] = chapter_prefix_counts.get(prefix, 0) + 1

    manifest = {
        "source": BASE_URL,
        "mode": "snapshot",
        "record_count": sum(chapter_prefix_counts.values()),
        "chapter_prefix_counts": chapter_prefix_counts,
        "updated_at": utc_now_iso(),
        "notes": [
            "Snapshot rebuilt from existing records/*.json.",
            "Useful after parallel sharded runs where live manifest writes are disabled.",
        ],
    }
    write_json(output_dir / "manifest.json", manifest)
    return manifest


def scrape_keyword(
    keyword: str,
    output_dir: Path,
    request_delay: float,
    max_pages: int,
    workers: int,
) -> dict:
    session = make_session()
    records_dir = output_dir / "records"
    chapter_dir = output_dir / "chapters"
    saved = 0
    skipped = 0
    failures: list[dict[str, str]] = []

    try:
        discovery = collect_keyword_codes_tree(session, keyword, request_delay, max_pages)
    except Exception as error:  # pragma: no cover - network behavior
        failures.append({"stage": "search", "keyword": keyword, "error": str(error)})
        discovery = {
            "codes": [],
            "pages": [],
            "code_sources": {},
            "refined": False,
            "truncated": False,
            "expanded_keywords": [],
        }

    for page_summary in discovery["pages"]:
        query_keyword = page_summary["keyword"]
        filename = f"page-{page_summary['page']}.json" if query_keyword == keyword else f"{query_keyword}-page-{page_summary['page']}.json"
        write_json(chapter_dir / keyword / filename, page_summary)

    pending_codes: list[tuple[str, str, int]] = []
    for code in discovery["codes"]:
        record_path = records_dir / f"{code}.json"
        if record_path.exists():
            skipped += 1
            continue
        source = discovery["code_sources"].get(code, {"keyword": keyword, "page": 1})
        pending_codes.append((code, str(source["keyword"]), int(source["page"])))

    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        future_map = {
            executor.submit(fetch_and_build_record, code, source_keyword, page_no, request_delay): code
            for code, source_keyword, page_no in pending_codes
        }
        for future in as_completed(future_map):
            code = future_map[future]
            record_path = records_dir / f"{code}.json"
            try:
                record = future.result()
                write_json(record_path, record)
                saved += 1
            except Exception as error:  # pragma: no cover - network behavior
                failures.append({"stage": "detail", "code": code, "error": str(error)})

    chapter_summary = {
        "keyword": keyword,
        "pages_captured": len(list((chapter_dir / keyword).glob("*.json"))) if (chapter_dir / keyword).exists() else 0,
        "codes_discovered": sum(len(page_summary["codes"]) for page_summary in discovery["pages"]),
        "unique_codes_discovered": len(discovery["codes"]),
        "records_saved": saved,
        "records_skipped": skipped,
        "refined": discovery["refined"],
        "truncated": discovery["truncated"],
        "expanded_keywords": discovery["expanded_keywords"],
        "failures": failures,
        "updated_at": utc_now_iso(),
    }
    write_json(output_dir / "chapters" / f"{keyword}.json", chapter_summary)
    return chapter_summary


def build_manifest(output_dir: Path, chapter_summaries: list[dict], chapters: list[str]) -> dict:
    records_dir = output_dir / "records"
    record_count = len(list(records_dir.glob("*.json"))) if records_dir.exists() else 0
    total_failures = sum(len(summary.get("failures", [])) for summary in chapter_summaries)
    return {
        "source": BASE_URL,
        "chapters": chapters,
        "record_count": record_count,
        "chapter_count": len(chapter_summaries),
        "total_failures": total_failures,
        "updated_at": utc_now_iso(),
        "chapter_summaries": chapter_summaries,
    }


def fetch_and_build_record(code: str, keyword: str, page: int, request_delay: float) -> dict:
    detail_url = DETAIL_URL.format(code=code)
    session = make_session()
    detail_html = fetch_html(session, detail_url, request_delay)
    record = parse_detail_page(detail_html, detail_url)
    record["discovered_from"] = {"keyword": keyword, "page": page}
    return record


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Capture raw HSCode detail data into local JSON files.")
    parser.add_argument("--chapters", help="Comma-separated chapter list, for example 68,69,70. Defaults to 01-99.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output directory for scraped data.")
    parser.add_argument("--request-delay", type=float, default=0.15, help="Delay between requests in seconds.")
    parser.add_argument("--max-pages", type=int, default=500, help="Upper bound for pages scanned per chapter.")
    parser.add_argument("--workers", type=int, default=4, help="Concurrent detail-page workers per search page.")
    parser.add_argument("--skip-manifest", action="store_true", help="Skip manifest writes during shard runs.")
    parser.add_argument("--rebuild-manifest-only", action="store_true", help="Only rebuild manifest from existing records.")
    args = parser.parse_args(argv)

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.rebuild_manifest_only:
        manifest = rebuild_manifest_snapshot(output_dir)
        print(f"[HSCode] Manifest rebuilt. records={manifest['record_count']}", flush=True)
        return 0

    try:
        chapters = parse_chapter_list(args.chapters)
    except ValueError as error:
        print(f"Invalid --chapters value: {error}", file=sys.stderr)
        return 2

    chapter_summaries: list[dict] = []
    started_at = utc_now_iso()

    for keyword in chapters:
        print(f"[HSCode] Capturing chapter {keyword} ...", flush=True)
        summary = scrape_keyword(keyword, output_dir, args.request_delay, args.max_pages, args.workers)
        chapter_summaries.append(summary)
        if not args.skip_manifest:
            manifest = build_manifest(output_dir, chapter_summaries, chapters)
            manifest["started_at"] = started_at
            write_json(output_dir / "manifest.json", manifest)
        print(
            f"[HSCode] Chapter {keyword}: discovered={summary['unique_codes_discovered']} "
            f"saved={summary['records_saved']} skipped={summary['records_skipped']} "
            f"failures={len(summary['failures'])}",
            flush=True,
        )

    if args.skip_manifest:
        final_manifest = rebuild_manifest_snapshot(output_dir)
        print(
            f"[HSCode] Finished shard run. records={final_manifest['record_count']}",
            flush=True,
        )
    else:
        final_manifest = build_manifest(output_dir, chapter_summaries, chapters)
        final_manifest["started_at"] = started_at
        write_json(output_dir / "manifest.json", final_manifest)
        print(
            f"[HSCode] Finished. records={final_manifest['record_count']} "
            f"chapters={final_manifest['chapter_count']} failures={final_manifest['total_failures']}",
            flush=True,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
