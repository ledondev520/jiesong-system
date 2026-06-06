#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed WPS cloud metadata + local WPS cache.db/filetransfer tables
Output: parsed/wps_cloud_only_download_handles.{json,md}
Pos: WPS cloud-only 原件下载手柄只读探测；抽取 fileId/groupId/taskId/transfer 状态，判断本机是否已有可直接下载线索；不联网、不输出 token、不写库

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PARSED_DIR = ROOT / "tmp/wps_11_export_list_raw/parsed"
MAIN_METADATA_JSON = PARSED_DIR / "wps_cloud_metadata.json"
ROOT_METADATA_JSON = PARSED_DIR / "root_shipment_cloud/wps_cloud_metadata.json"
CACHE_DB = Path.home() / "Library/Containers/com.kingsoft.wpsoffice.mac/Data/Library/Application Support/Kingsoft/WPS Cloud Files/userdata/qing/filecache/.212320004/cache.db"
OUT_JSON = PARSED_DIR / "wps_cloud_only_download_handles.json"
OUT_MD = PARSED_DIR / "wps_cloud_only_download_handles.md"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def compact(value: Any, limit: int = 240) -> str:
    text = " ".join(str(value or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def extra_value(extra: str, key: str) -> str:
    match = re.search(rf"{re.escape(key)}[\u2029\u2028]([^\u2029\u2028]+)", extra or "")
    return match.group(1) if match else ""


def metadata_records() -> list[dict[str, Any]]:
    records = []
    main = load_json(MAIN_METADATA_JSON, {})
    root = load_json(ROOT_METADATA_JSON, {})
    for row in main.get("records", []):
        if row.get("cloud_path") == "11-报关记录/20250815禧瑞都/购销合同CG2500045-不锈钢桶-禧瑞都.pdf":
            records.append({"scope": "11-报关记录", **row})
    for row in root.get("records", []):
        if row.get("cloud_path") == "出货汇总.xlsx":
            records.append({"scope": "root_shipment_cloud", **row})
    return records


def db_rows(query: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
    if not CACHE_DB.exists():
        return []
    with sqlite3.connect(str(CACHE_DB)) as conn:
        conn.row_factory = sqlite3.Row
        return [dict(row) for row in conn.execute(query, params).fetchall()]


def rows_for_target(target: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    name = target.get("name") or Path(str(target.get("cloud_path") or "")).name
    file_id = str(target.get("file_id") or "")
    sha1 = str(target.get("metadata_sha1") or "")
    size = target.get("metadata_size")
    task_id = ""

    metadata_hits = db_rows(
        """
        SELECT id, fileId, groupId, localParentId, name, localName, type, version, size,
               modifiedTime, fileState, taskId, extraInfo
        FROM file_metadata_table
        WHERE name = ? OR fileId = ? OR size = ? OR extraInfo LIKE ?
        ORDER BY modifiedTime DESC
        LIMIT 50
        """,
        (name, file_id, size, f"%{sha1}%"),
    )
    for row in metadata_hits:
        if row.get("name") == name and int(row.get("size") or 0) == int(size or 0):
            task_id = row.get("taskId") or task_id

    cache_rows = db_rows(
        """
        SELECT id, taskId, fileId, fileName, parentId, groupId, historyId, vPath,
               syncFileFolder, syncFileName, lastSha1, fileSize, fileVersion,
               uploadCode, downCode, isCurrentSyncTask, roamingSuccess, extendInfo
        FROM filecache_data
        WHERE fileName = ? OR fileId = ? OR taskId = ? OR lastSha1 = ? OR fileSize = ?
        ORDER BY id DESC
        LIMIT 80
        """,
        (name, file_id, task_id, sha1, size),
    )
    transfer_rows = db_rows(
        """
        SELECT id, taskId, type, cacheItemId, localId, fileId, fileName, parentId,
               groupId, historyId, cloudPath, lastSha1, localPath, fileSize,
               fileVersion, status, completeSize, errorCode, errorMsg, createTime, completeTime
        FROM filetransfer_table
        WHERE fileName = ? OR fileId = ? OR cacheItemId = ? OR lastSha1 = ? OR fileSize = ?
        ORDER BY id DESC
        LIMIT 80
        """,
        (name, file_id, task_id, sha1, size),
    )
    return {
        "metadata_hits": metadata_hits,
        "cache_rows": cache_rows,
        "transfer_rows": transfer_rows,
    }


def classify(target: dict[str, Any], rows: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    file_id = str(target.get("file_id") or "")
    sha1 = str(target.get("metadata_sha1") or "")
    size = int(target.get("metadata_size") or 0)
    valid_file_id = bool(file_id and file_id != "-1")

    exact_metadata = [
        row for row in rows["metadata_hits"]
        if str(row.get("name") or "") == str(target.get("name") or "")
        and int(row.get("size") or 0) == size
        and extra_value(row.get("extraInfo") or "", "fsha1") == sha1
    ]
    exact_cache = [
        row for row in rows["cache_rows"]
        if int(row.get("fileSize") or 0) == size and str(row.get("lastSha1") or "") == sha1
    ]
    exact_transfer = [
        row for row in rows["transfer_rows"]
        if int(row.get("fileSize") or 0) == size and str(row.get("lastSha1") or "") == sha1
    ]
    stale_same_file_id = [
        row for row in rows["cache_rows"]
        if valid_file_id and str(row.get("fileId") or "") == file_id and str(row.get("lastSha1") or "") != sha1
    ]
    old_path_transfer = [
        row for row in rows["transfer_rows"]
        if str(row.get("fileName") or "") == str(target.get("name") or "")
        and (int(row.get("fileSize") or 0) != size or str(row.get("fileId") or "") != file_id)
    ]

    if not valid_file_id:
        verdict = "insufficient_cloud_file_id"
        rationale = "metadata file_id is -1, so local DB does not expose a usable cloud fileId for direct download."
    elif exact_transfer:
        verdict = "download_transfer_exists"
        rationale = "local transfer table has an exact SHA1/size row; inspect localPath and rerun close plan."
    elif exact_cache:
        verdict = "cache_metadata_exact_but_no_local_file"
        rationale = "filecache_data has exact SHA1/size metadata but no exact local candidate was found."
    elif stale_same_file_id:
        verdict = "valid_file_id_but_stale_cache"
        rationale = "metadata fileId is valid, but cache rows for that fileId point to older SHA1/size content."
    else:
        verdict = "metadata_only_no_download_artifact"
        rationale = "metadata exists, but no exact cache or transfer artifact is present locally."

    return {
        "valid_file_id": valid_file_id,
        "metadata_exact_hit_count": len(exact_metadata),
        "exact_cache_count": len(exact_cache),
        "exact_transfer_count": len(exact_transfer),
        "stale_same_file_id_count": len(stale_same_file_id),
        "old_path_transfer_count": len(old_path_transfer),
        "download_handle_verdict": verdict,
        "download_handle_rationale": rationale,
        "safe_next_step": (
            "Use WPS authenticated client/API to force a fresh download, then rerun probe_wps_cloud_only_files.py."
            if valid_file_id
            else "Recover a valid cloud fileId by refreshing WPS metadata or opening the exact cloud path in WPS, then rerun this probe."
        ),
    }


def build_report() -> dict[str, Any]:
    items = []
    for target in metadata_records():
        rows = rows_for_target(target)
        classification = classify(target, rows)
        items.append({
            "scope": target.get("scope"),
            "cloud_path": target.get("cloud_path"),
            "name": target.get("name"),
            "file_id": target.get("file_id"),
            "group_id": target.get("group_id"),
            "metadata_size": target.get("metadata_size"),
            "metadata_sha1": target.get("metadata_sha1"),
            **classification,
            "handles": {
                "metadata_hits": rows["metadata_hits"],
                "cache_rows": rows["cache_rows"],
                "transfer_rows": rows["transfer_rows"],
            },
        })
    return {
        "status": "wps_cloud_only_download_handles_probed",
        "mode": "read_only_no_network",
        "cache_db": str(CACHE_DB),
        "target_count": len(items),
        "directly_downloadable_count": sum(1 for item in items if item["download_handle_verdict"] == "download_transfer_exists"),
        "items": items,
    }


def render_md(report: dict[str, Any]) -> str:
    lines = [
        "# WPS cloud-only 下载手柄探测",
        "",
        f"状态：`{report['status']}`",
        f"模式：`{report['mode']}`",
        f"目标数：`{report['target_count']}`",
        f"本机可直接下载/复用：`{report['directly_downloadable_count']}`",
        "",
        "## 口径",
        "- 本报告只读，不联网、不写数据库、不复制文件。",
        "- 不输出 token、cookie 或认证内容；只列 WPS 本机 metadata/cache/transfer 的 fileId、groupId、taskId 和状态。",
        "- 只有出现目标 SHA1/size 的本机 transfer 或精确本机文件时，才能继续关闭 cloud-only 缺口。",
        "",
        "## 明细",
        "| 结论 | 范围 | 云端路径 | fileId | groupId | size | SHA1 | 证据 | 下一步 |",
        "|---|---|---|---|---|---:|---|---|---|",
    ]
    for item in report["items"]:
        evidence = (
            f"metadata={item['metadata_exact_hit_count']}; "
            f"cache_exact={item['exact_cache_count']}; "
            f"transfer_exact={item['exact_transfer_count']}; "
            f"stale_same_file_id={item['stale_same_file_id_count']}; "
            f"old_path_transfer={item['old_path_transfer_count']}"
        )
        lines.append(
            f"| `{item['download_handle_verdict']}` | {item['scope']} | {item['cloud_path']} | `{item['file_id']}` | `{item['group_id']}` | {item['metadata_size']} | `{item['metadata_sha1']}` | {evidence} | {item['safe_next_step']} |"
        )
        lines.append(f"| 说明 |  |  |  |  |  |  | {compact(item['download_handle_rationale'])} |  |")
    return "\n".join(lines) + "\n"


def main() -> None:
    report = build_report()
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUT_MD.write_text(render_md(report), encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "mode": report["mode"],
        "target_count": report["target_count"],
        "directly_downloadable_count": report["directly_downloadable_count"],
        "out": {"json": str(OUT_JSON), "md": str(OUT_MD)},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
