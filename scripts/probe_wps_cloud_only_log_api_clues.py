#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_cloud_only_download_handles.json + local WPS cloud logs
Output: parsed/wps_cloud_only_log_api_clues.{json,md}
Pos: WPS cloud-only 原件日志接口线索只读探测；脱敏抽取目标相关 URL host/path、接口词、错误码和命中摘要；不输出 token/cookie/日志正文，不联网不写库

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
PARSED_DIR = ROOT / "tmp/wps_11_export_list_raw/parsed"
HANDLES_JSON = PARSED_DIR / "wps_cloud_only_download_handles.json"
OFFICESPACE_LOG_DIR = Path.home() / (
    "Library/Containers/com.kingsoft.wpsoffice.mac/Data/Library/Application Support/"
    "Kingsoft/office6/OfficeSpace/log"
)
WPSCLOUD_LOG_DIR = Path.home() / (
    "Library/Containers/com.kingsoft.wpsoffice.mac/Data/Library/Application Support/"
    "Kingsoft/office6/log/wpscloudsvr"
)
OUT_JSON = PARSED_DIR / "wps_cloud_only_log_api_clues.json"
OUT_MD = PARSED_DIR / "wps_cloud_only_log_api_clues.md"

URL_RE = re.compile(r"https?://[^\s\"'<>\\]+", re.IGNORECASE)
ERROR_RE = re.compile(r"(?:errorCode|errcode|errno|code|status)[=: ]+(-?\d{1,8})", re.IGNORECASE)
TOKENISH_RE = re.compile(r"(?i)(token|cookie|sid|wps_sid|csrf|auth|authorization|access[_-]?key|secret|signature|sign|ticket|key)=")
API_WORD_RE = re.compile(r"(?i)(download|downfile|file/download|getfile|downloadurl|fileinfo|metadata|transfer|sync|roaming|qing|drive|share)")


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def log_files() -> list[Path]:
    files: list[Path] = []
    for log_dir in (OFFICESPACE_LOG_DIR, WPSCLOUD_LOG_DIR):
        if not log_dir.exists():
            continue
        files.extend(path for path in log_dir.iterdir() if path.is_file())
    return sorted(files, key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True)


def decode_log(path: Path) -> str:
    try:
        raw = path.read_bytes()
    except OSError:
        return ""
    # klogz files here are still searchable after ignoring undecodable bytes.
    return raw.decode("utf-8", errors="ignore")


def tokens_for_item(item: dict[str, Any]) -> list[str]:
    tokens = [
        item.get("name"),
        item.get("file_id"),
        item.get("group_id"),
        item.get("metadata_sha1"),
        str(item.get("metadata_size") or ""),
    ]
    for rows in item.get("handles", {}).values():
        for row in rows:
            tokens.extend([
                row.get("taskId"),
                row.get("cacheItemId"),
                row.get("fileId"),
                row.get("localId"),
                row.get("lastSha1"),
                row.get("cloudPath"),
            ])
    return [str(token) for token in tokens if token not in (None, "", "-1", "0")]


def sanitized_url(url: str) -> dict[str, str]:
    parsed = urlsplit(url)
    return {
        "host": parsed.netloc,
        "path": parsed.path or "/",
        "query_keys": ",".join(sorted({part.split("=", 1)[0] for part in parsed.query.split("&") if part})),
        "had_sensitive_query": str(bool(TOKENISH_RE.search(parsed.query))).lower(),
    }


def redact_line(line: str) -> str:
    line = URL_RE.sub(lambda match: f"{urlsplit(match.group(0)).scheme}://{urlsplit(match.group(0)).netloc}{urlsplit(match.group(0)).path}?<redacted>", line)
    line = re.sub(r"(?i)(token|cookie|sid|wps_sid|csrf|auth|authorization|access[_-]?key|secret|signature|sign|ticket|key)[=:][^\s&]+", r"\1=<redacted>", line)
    return " ".join(line.split())[:260]


def scan_item(item: dict[str, Any], paths: list[Path]) -> dict[str, Any]:
    tokens = tokens_for_item(item)
    log_hits = []
    url_counter: Counter[tuple[str, str, str, str]] = Counter()
    api_words: Counter[str] = Counter()
    error_codes: Counter[str] = Counter()
    redacted_samples: list[str] = []

    for path in paths[:120]:
        text = decode_log(path)
        if not text:
            continue
        hit_tokens = [token for token in tokens if token and token in text]
        if not hit_tokens:
            continue
        lines = [line for line in text.splitlines() if any(token in line for token in hit_tokens)]
        hit_count = len(lines)
        if hit_count == 0:
            hit_count = sum(text.count(token) for token in hit_tokens)
        log_hits.append({
            "path": str(path),
            "hit_count": hit_count,
            "matched_token_count": len(hit_tokens),
        })
        for line in lines[:20]:
            for url in URL_RE.findall(line):
                entry = sanitized_url(url)
                url_counter[(entry["host"], entry["path"], entry["query_keys"], entry["had_sensitive_query"])] += 1
            for word in API_WORD_RE.findall(line):
                api_words[word.lower()] += 1
            for code in ERROR_RE.findall(line):
                error_codes[code] += 1
            if len(redacted_samples) < 8 and (URL_RE.search(line) or ERROR_RE.search(line) or API_WORD_RE.search(line)):
                redacted_samples.append(redact_line(line))

    url_clues = [
        {"host": host, "path": path, "query_keys": query_keys, "had_sensitive_query": had_sensitive_query, "count": count}
        for (host, path, query_keys, had_sensitive_query), count in url_counter.most_common(30)
    ]
    return {
        "scope": item.get("scope"),
        "cloud_path": item.get("cloud_path"),
        "file_id": item.get("file_id"),
        "group_id": item.get("group_id"),
        "download_handle_verdict": item.get("download_handle_verdict"),
        "log_file_hit_count": len(log_hits),
        "total_line_hits": sum(hit["hit_count"] for hit in log_hits),
        "url_clues": url_clues,
        "api_word_counts": [{"word": key, "count": value} for key, value in api_words.most_common(20)],
        "error_codes": [{"code": key, "count": value} for key, value in error_codes.most_common(20)],
        "redacted_samples": redacted_samples,
        "log_hits": log_hits[:80],
        "verdict": "api_clues_found" if url_clues or api_words or error_codes else "no_api_clues_in_matching_log_lines",
    }


def build_report() -> dict[str, Any]:
    handles = load_json(HANDLES_JSON, {})
    paths = log_files()
    items = [scan_item(item, paths) for item in handles.get("items", [])]
    return {
        "status": "wps_cloud_only_log_api_clues_probed",
        "mode": "read_only_redacted_no_network",
        "log_files_scanned": min(len(paths), 120),
        "target_count": len(items),
        "items": items,
        "safety": {
            "raw_log_body_output": False,
            "token_cookie_output": False,
            "network_requests": 0,
            "db_writes": 0,
            "file_copies": 0,
        },
    }


def render_md(report: dict[str, Any]) -> str:
    lines = [
        "# WPS cloud-only 日志接口线索",
        "",
        f"状态：`{report['status']}`",
        f"模式：`{report['mode']}`",
        f"扫描日志文件：`{report['log_files_scanned']}`",
        f"目标数：`{report['target_count']}`",
        "",
        "## 安全口径",
        "- 只读，不联网、不写数据库、不复制文件。",
        "- 不输出 token、cookie、authorization、signature 等敏感值。",
        "- URL 只保留 host/path/query key，query value 全部丢弃。",
        "",
        "## 明细",
    ]
    for item in report["items"]:
        lines.extend([
            f"### {item['scope']} / {item['cloud_path']}",
            "",
            f"- 下载手柄结论：`{item['download_handle_verdict']}`",
            f"- 日志文件命中：`{item['log_file_hit_count']}`",
            f"- 命中行估算：`{item['total_line_hits']}`",
            f"- 日志接口结论：`{item['verdict']}`",
            "",
            "#### URL 线索",
            "| host | path | query keys | sensitive query | count |",
            "|---|---|---|---|---:|",
        ])
        for clue in item["url_clues"][:12]:
            lines.append(f"| {clue['host']} | `{clue['path']}` | `{clue['query_keys'] or '-'}` | `{clue['had_sensitive_query']}` | {clue['count']} |")
        if not item["url_clues"]:
            lines.append("| - | - | - | - | 0 |")
        lines.extend(["", "#### 错误码 / 接口词"])
        err = ", ".join(f"{row['code']}={row['count']}" for row in item["error_codes"]) or "-"
        words = ", ".join(f"{row['word']}={row['count']}" for row in item["api_word_counts"]) or "-"
        lines.append(f"- 错误码：`{err}`")
        lines.append(f"- 接口词：`{words}`")
        lines.extend(["", "#### 脱敏样例"])
        for sample in item["redacted_samples"][:5]:
            lines.append(f"- `{sample}`")
        if not item["redacted_samples"]:
            lines.append("- `-`")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    report = build_report()
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUT_MD.write_text(render_md(report) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "mode": report["mode"],
        "log_files_scanned": report["log_files_scanned"],
        "target_count": report["target_count"],
        "items": [
            {
                "cloud_path": item["cloud_path"],
                "verdict": item["verdict"],
                "url_clues": len(item["url_clues"]),
                "error_codes": item["error_codes"][:3],
            }
            for item in report["items"]
        ],
        "out": {"json": str(OUT_JSON), "md": str(OUT_MD)},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
