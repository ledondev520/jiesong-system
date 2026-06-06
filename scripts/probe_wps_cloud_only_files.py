#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_import_completion_audit.json + WPS cache.db + local source/download paths
Output: parsed/wps_cloud_only_probe.{json,md}
Pos: WPS 仅云端原件缺口窄探测脚本；只反查当前 cloud-only 目标的本机候选、WPS metadata 和下载失败记录；只读，不写库不复制

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PARSED_DIR = ROOT / "tmp/wps_11_export_list_raw/parsed"
SOURCE_ROOT = ROOT / "tmp/wps_11_export_list_raw/11-报关记录"
CACHE_DB = Path.home() / "Library/Containers/com.kingsoft.wpsoffice.mac/Data/Library/Application Support/Kingsoft/WPS Cloud Files/userdata/qing/filecache/.212320004/cache.db"
CACHE_ROOT = Path.home() / "Library/Containers/com.kingsoft.wpsoffice.mac/Data/Library/Application Support/Kingsoft/WPS Cloud Files/userdata/qing/filecache/212320004"
OUT_JSON = PARSED_DIR / "wps_cloud_only_probe.json"
OUT_MD = PARSED_DIR / "wps_cloud_only_probe.md"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def sha1_file(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_info(path: Path, target: dict[str, Any], origin: str) -> dict[str, Any]:
    if not path.exists() or not path.is_file():
        return {
            "origin": origin,
            "path": str(path),
            "exists": False,
            "size": None,
            "sha1": "",
            "match": "missing",
        }
    size = path.stat().st_size
    digest = sha1_file(path)
    target_size = target.get("metadata_size")
    target_sha1 = target.get("metadata_sha1")
    if target_sha1 and digest == target_sha1:
        match = "exact_sha1"
    elif target_size and size == target_size:
        match = "exact_size_only"
    else:
        match = "name_only"
    return {
        "origin": origin,
        "path": str(path),
        "exists": True,
        "size": size,
        "sha1": digest,
        "match": match,
        "mtime": int(path.stat().st_mtime),
    }


def candidate_paths(target: dict[str, Any]) -> list[tuple[str, Path]]:
    cloud_path = str(target.get("cloud_path") or "")
    filename = Path(cloud_path).name
    paths: list[tuple[str, Path]] = []
    if target.get("scope") == "11-报关记录":
        relative = cloud_path.removeprefix("11-报关记录/").lstrip("/")
        paths.extend([
            ("project_source_exact", SOURCE_ROOT / relative),
            ("wps_team_exact", CACHE_ROOT / "团队文档/捷淞/11-报关记录" / relative),
        ])
    elif target.get("scope") == "root_shipment_cloud":
        paths.extend([
            ("project_root_cloud", SOURCE_ROOT / "_wps_cloud_root" / filename),
            ("wps_root_exact", CACHE_ROOT / filename),
        ])

    # Downloads can contain manually exported copies; keep this narrow by filename.
    downloads = Path.home() / "Downloads"
    for base in (downloads, downloads / "出口外贸"):
        paths.append((f"downloads/{base.name}", base / filename))
    return paths


def cache_rows_for_target(target: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    if not CACHE_DB.exists():
        return {}
    cloud_path = str(target.get("cloud_path") or "")
    filename = Path(cloud_path).name
    target_sha1 = target.get("metadata_sha1") or ""
    target_size = target.get("metadata_size")

    results: dict[str, list[dict[str, Any]]] = {}
    with sqlite3.connect(str(CACHE_DB)) as conn:
        conn.row_factory = sqlite3.Row

        queries = {
            "file_metadata_table": (
                """
                SELECT id, fileId, groupId, localParentId, name, localName, size, fileState, taskId, extraInfo
                FROM file_metadata_table
                WHERE name = ? OR localName = ? OR size = ? OR extraInfo LIKE ?
                LIMIT 30
                """,
                (filename, filename, target_size, f"%{target_sha1}%"),
            ),
            "filecache_data": (
                """
                SELECT id, taskId, fileId, fileName, parentId, groupId, vPath, syncFileFolder,
                       lastSha1, fileSize, fileVersion, uploadCode, downCode, isOlderVersion,
                       isCurrentSyncTask, roamingSuccess, extendInfo
                FROM filecache_data
                WHERE fileName = ? OR lastSha1 = ? OR fileSize = ?
                ORDER BY id DESC
                LIMIT 30
                """,
                (filename, target_sha1, target_size),
            ),
            "filetransfer_table": (
                """
                SELECT id, taskId, type, cacheItemId, localId, fileId, fileName, cloudPath,
                       lastSha1, localPath, fileSize, fileVersion, status, completeSize,
                       errorCode, errorMsg, createTime, completeTime, extendInfo
                FROM filetransfer_table
                WHERE fileName = ? OR lastSha1 = ? OR fileSize = ?
                ORDER BY id DESC
                LIMIT 30
                """,
                (filename, target_sha1, target_size),
            ),
        }
        for table, (query, params) in queries.items():
            try:
                rows = [dict(row) for row in conn.execute(query, params).fetchall()]
            except sqlite3.Error as error:
                rows = [{"error": str(error)}]
            results[table] = rows
    return results


def build_report() -> dict[str, Any]:
    completion = load_json(PARSED_DIR / "wps_import_completion_audit.json", {})
    targets = completion.get("cloud_coverage", {}).get("cloud_only_files", [])
    items = []
    for target in targets:
        local_candidates = [
            file_info(path, target, origin)
            for origin, path in candidate_paths(target)
        ]
        cache_rows = cache_rows_for_target(target)
        exact_local_matches = [
            row for row in local_candidates
            if row.get("match") == "exact_sha1"
        ]
        exact_cache_metadata = []
        target_sha1 = target.get("metadata_sha1")
        target_size = target.get("metadata_size")
        for table, rows in cache_rows.items():
            for row in rows:
                text = json.dumps(row, ensure_ascii=False)
                if (target_sha1 and target_sha1 in text) or (target_size and str(target_size) in text):
                    exact_cache_metadata.append({"table": table, "row": row})

        items.append({
            "scope": target.get("scope"),
            "cloud_path": target.get("cloud_path"),
            "metadata_size": target.get("metadata_size"),
            "metadata_sha1": target.get("metadata_sha1"),
            "exact_local_match_count": len(exact_local_matches),
            "exact_cache_metadata_count": len(exact_cache_metadata),
            "local_candidates": local_candidates,
            "cache_rows": cache_rows,
            "exact_cache_metadata": exact_cache_metadata,
            "decision": (
                "ready_to_copy"
                if exact_local_matches
                else "no_exact_local_file"
            ),
        })
    return {
        "status": "wps_cloud_only_probe_complete",
        "cache_db": str(CACHE_DB),
        "cache_root": str(CACHE_ROOT),
        "target_count": len(items),
        "ready_to_copy_count": sum(1 for item in items if item["decision"] == "ready_to_copy"),
        "items": items,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# WPS 仅云端原件窄探测",
        "",
        f"状态：`{report['status']}`",
        f"目标数：`{report['target_count']}`",
        f"可直接复制保留：`{report['ready_to_copy_count']}`",
        "",
        "## 处理口径",
        "- 本报告只读，不写数据库、不复制文件。",
        "- 只有本机候选文件 SHA1 等于 WPS metadata SHA1 时，才标记为可直接复制保留。",
        "- 仅同名、同大小或旧版本 cache 记录不能关闭云端原件缺口。",
        "",
    ]
    for item in report["items"]:
        lines.extend([
            f"## {item['scope']} / {item['cloud_path']}",
            "",
            f"- metadata size：`{item['metadata_size']}`",
            f"- metadata SHA1：`{item['metadata_sha1']}`",
            f"- 精确本机匹配：`{item['exact_local_match_count']}`",
            f"- cache metadata 命中：`{item['exact_cache_metadata_count']}`",
            f"- 结论：`{item['decision']}`",
            "",
            "### 本机候选",
            "| 来源 | 存在 | 大小 | SHA1 | 匹配 | 路径 |",
            "|---|---|---:|---|---|---|",
        ])
        for row in item["local_candidates"]:
            lines.append(
                f"| {row['origin']} | {row['exists']} | {row.get('size') or '-'} | {row.get('sha1') or '-'} | {row['match']} | `{row['path']}` |"
            )
        lines.extend(["", "### WPS cache 摘要"])
        for table, rows in item["cache_rows"].items():
            lines.append(f"- `{table}`：`{len(rows)}` 条")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    report = build_report()
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUT_MD.write_text(render_markdown(report) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "target_count": report["target_count"],
        "ready_to_copy_count": report["ready_to_copy_count"],
        "out": {"json": str(OUT_JSON), "md": str(OUT_MD)},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
