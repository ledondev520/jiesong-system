#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_import_completion_audit.json + WPS local qing cache databases/logs
Output: parsed/wps_cloud_only_deep_state.{json,md}
Pos: WPS 仅云端原件深度只读探测；跨 cache/sync/transfer/precloud/datacache/cachedata/logs 复核目标是否进入本机下载或隐藏缓存；不写库、不复制、不输出 RPC 正文

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PARSED_DIR = ROOT / "tmp/wps_11_export_list_raw/parsed"
QING_ROOT = Path.home() / (
    "Library/Containers/com.kingsoft.wpsoffice.mac/Data/Library/Application Support/"
    "Kingsoft/WPS Cloud Files/userdata/qing"
)
FILECACHE_ROOT = QING_ROOT / "filecache/.212320004"
CACHE_DB = FILECACHE_ROOT / "cache.db"
SYNC_DB = FILECACHE_ROOT / "syncassistant.db"
PRECLOUD_DB = FILECACHE_ROOT / "precloudfile.db"
TRANSFERHELPER_DB = FILECACHE_ROOT / "transferhelper.db"
DATACACHE_DB = QING_ROOT / "datacache.db"
CACHEDATA_DIR = FILECACHE_ROOT / "cachedata"
OFFICESPACE_LOG_DIR = Path.home() / (
    "Library/Containers/com.kingsoft.wpsoffice.mac/Data/Library/Application Support/"
    "Kingsoft/office6/OfficeSpace/log"
)
WPSCLOUD_LOG_DIR = Path.home() / (
    "Library/Containers/com.kingsoft.wpsoffice.mac/Data/Library/Application Support/"
    "Kingsoft/office6/log/wpscloudsvr"
)
OUT_JSON = PARSED_DIR / "wps_cloud_only_deep_state.json"
OUT_MD = PARSED_DIR / "wps_cloud_only_deep_state.md"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def rows(db_path: Path, query: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
    if not db_path.exists():
        return []
    try:
        with sqlite3.connect(str(db_path)) as conn:
            conn.row_factory = sqlite3.Row
            return [dict(row) for row in conn.execute(query, params).fetchall()]
    except sqlite3.Error as error:
        return [{"error": str(error)}]


def sha1_file(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def target_tokens(target: dict[str, Any]) -> dict[str, Any]:
    cloud_path = str(target.get("cloud_path") or "")
    name = Path(cloud_path).name
    sha1 = str(target.get("metadata_sha1") or "")
    size = int(target.get("metadata_size") or 0)
    metadata_hits = rows(
        CACHE_DB,
        """
        SELECT id, fileId, groupId, localParentId, name, size, fileState, taskId, version,
               modifiedTime, extraInfo
        FROM file_metadata_table
        WHERE name = ? OR size = ? OR extraInfo LIKE ?
        ORDER BY modifiedTime DESC
        LIMIT 30
        """,
        (name, size, f"%{sha1}%"),
    )
    file_ids = sorted({
        str(row.get("fileId") or "")
        for row in metadata_hits
        if row.get("fileId") not in (None, "")
    })
    task_ids = sorted({
        str(row.get("taskId") or "")
        for row in metadata_hits
        if row.get("taskId") not in (None, "")
    })
    return {
        "name": name,
        "sha1": sha1,
        "size": size,
        "file_ids": file_ids,
        "task_ids": task_ids,
        "metadata_hits": metadata_hits,
    }


def query_extra_state(target: dict[str, Any], token_info: dict[str, Any]) -> dict[str, Any]:
    name = token_info["name"]
    sha1 = token_info["sha1"]
    size = token_info["size"]
    file_ids = token_info["file_ids"] or [""]
    task_ids = token_info["task_ids"] or [""]
    file_id_placeholders = ",".join("?" for _ in file_ids)
    task_id_placeholders = ",".join("?" for _ in task_ids)

    sync_rows = rows(
        SYNC_DB,
        f"""
        SELECT id, syncTaskId, status, type, transferTaskId, cacheItemId, fileId, groupId,
               parentId, fileName, fileSize, completeSize, fileVersion, localPath, cloudPath,
               errorCode, errorMsg, callFrom
        FROM sync_assistant_table
        WHERE fileName = ? OR fileSize = ? OR fileId IN ({file_id_placeholders})
              OR cacheItemId IN ({task_id_placeholders})
        ORDER BY id DESC
        LIMIT 50
        """,
        (name, size, *file_ids, *task_ids),
    )
    precloud_rows = rows(
        PRECLOUD_DB,
        f"""
        SELECT dbId, groupId, parentId, taskId, taskStatus, fileName, localPath, ext, bizSource
        FROM pre_cloudfile
        WHERE fileName = ? OR taskId IN ({task_id_placeholders}) OR extendInfo LIKE ?
        ORDER BY dbId DESC
        LIMIT 50
        """,
        (name, *task_ids, f"%{sha1}%"),
    )
    helper_rows = rows(
        TRANSFERHELPER_DB,
        f"""
        SELECT msg_id, msg_time, msg_type, status, file_id, file_size, file_name, file_path,
               task_id, cloud_path, is_thumbnail
        FROM msg_record_table
        WHERE file_name = ? OR file_size = ? OR file_id IN ({file_id_placeholders})
              OR task_id IN ({task_id_placeholders}) OR msg_text LIKE ? OR ext_info LIKE ?
        ORDER BY msg_id DESC
        LIMIT 50
        """,
        (name, size, *file_ids, *task_ids, f"%{name}%", f"%{sha1}%"),
    )
    datacache_rows = rows(
        DATACACHE_DB,
        """
        SELECT cacheKey, length(response) AS response_len, expiredTime
        FROM rpc_cache
        WHERE cacheKey LIKE ? OR cacheKey LIKE ? OR response LIKE ? OR response LIKE ?
        LIMIT 50
        """,
        (f"%{name}%", f"%{file_ids[0]}%", f"%{name}%", f"%{sha1}%"),
    )
    cachedata_matches = []
    if CACHEDATA_DIR.exists() and size > 0:
        for path in CACHEDATA_DIR.rglob("*"):
            if not path.is_file():
                continue
            try:
                stat = path.stat()
            except OSError:
                continue
            if stat.st_size != size:
                continue
            digest = sha1_file(path)
            cachedata_matches.append({
                "path": str(path),
                "size": stat.st_size,
                "sha1": digest,
                "exact_sha1": digest == sha1,
            })
            if len(cachedata_matches) >= 20:
                break

    return {
        "syncassistant_rows": sync_rows,
        "precloud_rows": precloud_rows,
        "transferhelper_rows": helper_rows,
        "datacache_rows": datacache_rows,
        "cachedata_size_matches": cachedata_matches,
    }


def log_hit_counts(tokens: list[str]) -> list[dict[str, Any]]:
    counts: list[dict[str, Any]] = []
    log_files: list[Path] = []
    for log_dir in (OFFICESPACE_LOG_DIR, WPSCLOUD_LOG_DIR):
        if log_dir.exists():
            log_files.extend(path for path in log_dir.iterdir() if path.is_file())
    for path in sorted(log_files, key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True)[:80]:
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        hit_count = sum(text.count(token) for token in tokens if token)
        if hit_count:
            counts.append({"path": str(path), "hit_count": hit_count})
    return counts


def build_report() -> dict[str, Any]:
    completion = load_json(PARSED_DIR / "wps_import_completion_audit.json", {})
    targets = completion.get("cloud_coverage", {}).get("cloud_only_files", [])
    items = []
    all_tokens: list[str] = []
    for target in targets:
        info = target_tokens(target)
        extra = query_extra_state(target, info)
        all_tokens.extend([info["name"], info["sha1"], *info["file_ids"], *info["task_ids"]])
        items.append({
            "scope": target.get("scope"),
            "cloud_path": target.get("cloud_path"),
            "metadata_size": target.get("metadata_size"),
            "metadata_sha1": target.get("metadata_sha1"),
            "metadata_hits": info["metadata_hits"],
            **extra,
            "decision": (
                "no_hidden_local_download_state"
                if not extra["cachedata_size_matches"]
                else "cachedata_size_match_review"
            ),
        })
    log_counts = log_hit_counts(sorted(set(all_tokens)))
    return {
        "status": "wps_cloud_only_deep_state_complete",
        "target_count": len(items),
        "items": items,
        "log_hit_files": log_counts,
        "dbs_checked": [
            str(CACHE_DB),
            str(SYNC_DB),
            str(PRECLOUD_DB),
            str(TRANSFERHELPER_DB),
            str(DATACACHE_DB),
        ],
        "cachedata_dir": str(CACHEDATA_DIR),
    }


def render_md(report: dict[str, Any]) -> str:
    lines = [
        "# WPS 仅云端原件深度状态探测",
        "",
        f"状态：`{report['status']}`",
        f"目标数：`{report['target_count']}`",
        "",
        "## 处理口径",
        "- 本报告只读，不写数据库、不复制文件。",
        "- `datacache` 只输出 cacheKey、response 长度和过期时间，不输出 RPC response 正文。",
        "- 日志只输出命中文件和命中次数，不输出日志正文。",
        "- 只有 cachedata 中存在目标 size 且 SHA1 精确一致时，才可能关闭 cloud-only 原件缺口。",
        "",
    ]
    for item in report["items"]:
        lines.extend([
            f"## {item['scope']} / {item['cloud_path']}",
            "",
            f"- metadata size：`{item['metadata_size']}`",
            f"- metadata SHA1：`{item['metadata_sha1']}`",
            f"- metadata rows：`{len(item['metadata_hits'])}`",
            f"- syncassistant rows：`{len(item['syncassistant_rows'])}`",
            f"- precloud rows：`{len(item['precloud_rows'])}`",
            f"- transferhelper rows：`{len(item['transferhelper_rows'])}`",
            f"- datacache rows：`{len(item['datacache_rows'])}`",
            f"- cachedata size matches：`{len(item['cachedata_size_matches'])}`",
            f"- 结论：`{item['decision']}`",
            "",
        ])
        if item["syncassistant_rows"]:
            lines.append("### syncassistant 摘要")
            lines.append("| fileId | fileName | fileSize | completeSize | status | errorCode | cloudPath | localPath |")
            lines.append("|---|---|---:|---:|---:|---:|---|---|")
            for row in item["syncassistant_rows"][:10]:
                lines.append(
                    f"| {row.get('fileId') or '-'} | {row.get('fileName') or '-'} | {row.get('fileSize') or '-'} | "
                    f"{row.get('completeSize') or '-'} | {row.get('status') or '-'} | {row.get('errorCode') or '-'} | "
                    f"`{row.get('cloudPath') or '-'}` | `{row.get('localPath') or '-'}` |"
                )
            lines.append("")
    lines.extend([
        "## 日志命中",
        "",
    ])
    if report["log_hit_files"]:
        lines.append("| 文件 | 命中次数 |")
        lines.append("|---|---:|")
        for row in report["log_hit_files"][:20]:
            lines.append(f"| `{row['path']}` | {row['hit_count']} |")
    else:
        lines.append("无目标文件名、fileId、taskId 或 SHA1 命中。")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    report = build_report()
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUT_MD.write_text(render_md(report) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "target_count": report["target_count"],
        "log_hit_files": len(report["log_hit_files"]),
        "out": {"json": str(OUT_JSON), "md": str(OUT_MD)},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
