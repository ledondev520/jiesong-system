#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: WPS Cloud Files cache.db metadata for 11-报关记录 and root shipment/list workbooks
Output: parsed/wps_cloud_metadata_*.csv/json/md and optional copied cached/direct-local/source-root files
Pos: WPS 云端文件索引盘点脚本；只读 WPS 本机索引，并回查本机团队文档路径、WPS 根目录与项目源目录，标记云端可见/本机已缓存状态

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import argparse
import csv
import fnmatch
import hashlib
import json
import shutil
import sqlite3
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PARSED_DIR = REPO_ROOT / "tmp/wps_11_export_list_raw/parsed"
DEFAULT_SOURCE_ROOT = REPO_ROOT / "tmp/wps_11_export_list_raw/11-报关记录"
DEFAULT_WPS_CACHE_DB = (
    Path.home()
    / "Library/Containers/com.kingsoft.wpsoffice.mac/Data/Library/Application Support/Kingsoft/WPS Cloud Files/userdata/qing/filecache/.212320004/cache.db"
)


@dataclass
class CacheEntry:
    file_id: str
    file_name: str
    v_path: str
    sync_file_folder: str
    sync_file_name: str
    last_sha1: str
    local_path: str
    status: str
    down_code: str
    file_size: int | None
    complete_size: int | None
    source_path: Path | None


def norm_path(path: Path) -> str:
    return path.as_posix()


def clean_text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def normalize_cloud_path(value: Any) -> str:
    text = clean_text(value).replace("\\", "/")
    for prefix in ("我的云文档/捷淞/", "团队文档/捷淞/"):
        if text.startswith(prefix):
            return text[len(prefix) :]
    return text


def pattern_matches(path: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatchcase(path, pattern.replace("%", "*")) for pattern in patterns)


def parse_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_extra_info(value: Any) -> dict[str, str]:
    text = clean_text(value)
    if not text:
        return {}
    fields = text.split("\u2028")
    parsed: dict[str, str] = {}
    for field in fields:
        if "\u2029" not in field:
            continue
        key, raw_value = field.split("\u2029", 1)
        parsed[key] = raw_value
    return parsed


def default_cache_root(cache_db: Path) -> Path:
    user_id = cache_db.parent.name.lstrip(".")
    return cache_db.parent.parent / user_id


def existing_source_path(cache_root: Path, row: sqlite3.Row) -> Path | None:
    candidates: list[Path] = []
    expected_size = parse_int(row["fileSize"])
    local_path = clean_text(row["localPath"])
    if local_path:
        path = Path(local_path)
        candidates.append(path if path.is_absolute() else cache_root / path)
    folder = clean_text(row["syncFileFolder"])
    name = clean_text(row["syncFileName"]) or clean_text(row["fileName"])
    if folder and name:
        candidates.append(cache_root / folder / name)
    for candidate in candidates:
        if not candidate.exists() or not candidate.is_file():
            continue
        if expected_size is not None and candidate.stat().st_size != expected_size:
            continue
        return candidate
    return None


def direct_local_source_path(cache_root: Path, cloud_path: str, expected_size: int | None) -> Path | None:
    candidates = [
        cache_root / "团队文档/捷淞" / cloud_path,
        cache_root / cloud_path,
    ]
    for candidate in candidates:
        if not candidate.exists() or not candidate.is_file():
            continue
        if expected_size is not None and candidate.stat().st_size != expected_size:
            continue
        return candidate
    return None


def sha1_for(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_sha1_source_paths(cache_root: Path, targets: set[tuple[int, str]]) -> dict[tuple[int, str], Path]:
    if not targets:
        return {}
    sizes = {size for size, _sha1 in targets}
    matches: dict[tuple[int, str], Path] = {}
    for candidate in cache_root.rglob("*"):
        if len(matches) == len(targets):
            break
        if not candidate.is_file():
            continue
        try:
            size = candidate.stat().st_size
        except OSError:
            continue
        if size not in sizes:
            continue
        digest = sha1_for(candidate)
        key = (size, digest)
        if key in targets and key not in matches:
            matches[key] = candidate
    return matches


def load_cache_entries(conn: sqlite3.Connection, cache_root: Path) -> dict[str, CacheEntry]:
    conn.row_factory = sqlite3.Row
    entries: dict[str, CacheEntry] = {}
    query = """
        select
          fileId, fileName, vPath, syncFileFolder, syncFileName,
          lastSha1,
          roamingLocalPath as localPath,
          roamingOperation as status,
          downCode, fileSize,
          null as completeSize
        from filecache_data
    """
    for row in conn.execute(query):
        file_id = clean_text(row["fileId"])
        if not file_id:
            continue
        source_path = existing_source_path(cache_root, row)
        entry = CacheEntry(
            file_id=file_id,
            file_name=clean_text(row["fileName"]),
                v_path=clean_text(row["vPath"]),
                sync_file_folder=clean_text(row["syncFileFolder"]),
                sync_file_name=clean_text(row["syncFileName"]),
                last_sha1=clean_text(row["lastSha1"]),
                local_path=clean_text(row["localPath"]),
            status=clean_text(row["status"]),
            down_code=clean_text(row["downCode"]),
            file_size=parse_int(row["fileSize"]),
            complete_size=parse_int(row["completeSize"]),
            source_path=source_path,
        )
        old = entries.get(file_id)
        if old is None or (entry.source_path is not None and old.source_path is None):
            entries[file_id] = entry
    return entries


def cache_entry_cloud_path(entry: CacheEntry) -> str:
    v_path = normalize_cloud_path(entry.v_path)
    file_name = clean_text(entry.file_name)
    if v_path and file_name and Path(v_path).name != file_name:
        return f"{v_path.rstrip('/')}/{file_name}"
    if v_path:
        return v_path
    folder = normalize_cloud_path(entry.sync_file_folder)
    return f"{folder.rstrip('/')}/{file_name}" if folder and file_name else file_name


def load_filecache_orphans(
    cache_entries: dict[str, CacheEntry],
    prefixes: list[str],
    metadata_paths: set[str],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for entry in cache_entries.values():
        cloud_path = cache_entry_cloud_path(entry)
        if not cloud_path or cloud_path in metadata_paths or not pattern_matches(cloud_path, prefixes):
            continue
        rows.append(
            {
                "cloud_path": cloud_path,
                "file_id": entry.file_id,
                "file_name": entry.file_name,
                "v_path": normalize_cloud_path(entry.v_path),
                "sync_file_folder": normalize_cloud_path(entry.sync_file_folder),
                "file_size": entry.file_size,
                "last_sha1": entry.last_sha1,
                "has_local_cached_file": int(entry.source_path is not None),
                "cache_source_path": norm_path(entry.source_path) if entry.source_path else "",
                "cache_status": entry.status,
                "cache_down_code": entry.down_code,
            }
        )
    return sorted(rows, key=lambda row: row["cloud_path"])


def load_failed_transfers(conn: sqlite3.Connection, prefixes: list[str]) -> list[dict[str, Any]]:
    conn.row_factory = sqlite3.Row
    query = """
        select
          taskId, type, fileId, fileName, groupId, cloudPath, lastSha1,
          localPath, fileSize, status, completeSize, errorCode, errorMsg,
          createTime, completeTime
        from filetransfer_table
        where errorCode != 0
    """
    rows: list[dict[str, Any]] = []
    for row in conn.execute(query):
        cloud_path = normalize_cloud_path(row["cloudPath"])
        file_name = clean_text(row["fileName"])
        if cloud_path and file_name and Path(cloud_path).name != file_name:
            cloud_path = f"{cloud_path.rstrip('/')}/{file_name}"
        if not cloud_path or not pattern_matches(cloud_path, prefixes):
            continue
        rows.append(
            {
                "cloud_path": cloud_path,
                "task_id": clean_text(row["taskId"]),
                "file_id": clean_text(row["fileId"]),
                "file_name": file_name,
                "group_id": clean_text(row["groupId"]),
                "file_size": parse_int(row["fileSize"]),
                "last_sha1": clean_text(row["lastSha1"]),
                "local_path": clean_text(row["localPath"]),
                "status": parse_int(row["status"]),
                "complete_size": parse_int(row["completeSize"]),
                "error_code": parse_int(row["errorCode"]),
                "error_msg": clean_text(row["errorMsg"]),
                "create_time": parse_int(row["createTime"]),
                "complete_time": parse_int(row["completeTime"]),
            }
        )
    return sorted(rows, key=lambda row: (row["cloud_path"], row["task_id"]))


def load_metadata(conn: sqlite3.Connection, prefixes: list[str]) -> list[sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    clauses = " or ".join(["path like ?" for _ in prefixes])
    query = f"""
        with recursive tree(id, fileId, groupId, localParentId, name, type, size, extraInfo, path) as (
          select id, fileId, groupId, localParentId, name, type, size, extraInfo, name
          from file_metadata_table
          where localParentId = '0'
          union all
          select f.id, f.fileId, f.groupId, f.localParentId, f.name, f.type, f.size, f.extraInfo,
                 tree.path || '/' || f.name
          from file_metadata_table f
          join tree on f.localParentId = tree.id
        )
        select id, fileId, groupId, localParentId, name, type, size, extraInfo, path
        from tree
        where {clauses}
        order by path
    """
    return list(conn.execute(query, prefixes))


def target_path_for(source_root: Path, cloud_path: str) -> Path | None:
    prefix = "11-报关记录/"
    if not cloud_path.startswith(prefix):
        # WPS 根目录中的出货/装货/清单类文件保存在项目源目录的 _wps_cloud_root 下。
        if "/" not in cloud_path and cloud_path:
            return source_root / "_wps_cloud_root" / cloud_path
        return None
    relative = cloud_path[len(prefix) :]
    if not relative:
        return None
    return source_root / relative


def existing_target_source_path(target_path: Path | None, expected_size: int | None) -> Path | None:
    if target_path is None or not target_path.exists() or not target_path.is_file():
        return None
    if expected_size is not None and target_path.stat().st_size != expected_size:
        return None
    return target_path


def build_records(
    cache_db: Path,
    prefixes: list[str],
    source_root: Path,
    copy_cached: bool,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    cache_root = default_cache_root(cache_db)
    conn = sqlite3.connect(cache_db)
    conn.row_factory = sqlite3.Row
    cache_entries = load_cache_entries(conn, cache_root)
    metadata_rows = load_metadata(conn, prefixes)
    metadata_paths = {clean_text(row["path"]) for row in metadata_rows}
    filecache_orphans = load_filecache_orphans(cache_entries, prefixes, metadata_paths)
    failed_transfers = load_failed_transfers(conn, prefixes)
    sha1_targets: set[tuple[int, str]] = set()
    for row in metadata_rows:
        if clean_text(row["type"]) != "file":
            continue
        extra = parse_extra_info(row["extraInfo"])
        fsha1 = extra.get("fsha1", "")
        metadata_size = parse_int(row["size"])
        if fsha1 and metadata_size is not None:
            sha1_targets.add((metadata_size, fsha1))
    sha1_source_paths = find_sha1_source_paths(cache_root, sha1_targets)
    records: list[dict[str, Any]] = []

    for row in metadata_rows:
        file_id = clean_text(row["fileId"])
        cloud_path = clean_text(row["path"])
        entry = cache_entries.get(file_id)
        metadata_size = parse_int(row["size"])
        extra = parse_extra_info(row["extraInfo"])
        metadata_sha1 = extra.get("fsha1", "")
        is_file = clean_text(row["type"]) == "file"
        target_path = target_path_for(source_root, cloud_path) if is_file else None
        source_path = entry.source_path if entry else None
        source_kind = "filecache" if source_path else ""
        if is_file and source_path is None:
            source_path = direct_local_source_path(cache_root, cloud_path, metadata_size)
            if source_path is not None:
                source_kind = "direct-local"
        if is_file and source_path is None and metadata_size is not None and metadata_sha1:
            source_path = sha1_source_paths.get((metadata_size, metadata_sha1))
            if source_path is not None:
                source_kind = "sha1-local"
        if is_file and source_path is None:
            source_path = existing_target_source_path(target_path, metadata_size)
            if source_path is not None:
                source_kind = "source-root"
        copied = False
        if copy_cached and is_file and source_path and target_path:
            target_path.parent.mkdir(parents=True, exist_ok=True)
            if not target_path.exists() or target_path.stat().st_size != source_path.stat().st_size:
                shutil.copy2(source_path, target_path)
            copied = True
        records.append(
            {
                "cloud_path": cloud_path,
                "file_id": file_id,
                "group_id": clean_text(row["groupId"]),
                "metadata_type": clean_text(row["type"]),
                "name": clean_text(row["name"]),
                "suffix": Path(clean_text(row["name"])).suffix.lower() if is_file else "",
                "metadata_size": metadata_size,
                "metadata_sha1": metadata_sha1,
                "is_file": int(is_file),
                "has_cache_entry": int(entry is not None),
                "has_local_cached_file": int(source_path is not None),
                "cache_source_kind": source_kind,
                "cache_status": entry.status if entry else "",
                "cache_down_code": entry.down_code if entry else "",
                "cache_file_size": entry.file_size if entry else None,
                "cache_complete_size": entry.complete_size if entry else None,
                "cache_source_path": norm_path(source_path) if source_path else "",
                "target_path": norm_path(target_path) if target_path else "",
                "copied_to_source_root": int(copied),
            }
        )
    file_records = [record for record in records if record["is_file"]]
    cloud_only_files = [
        record for record in file_records
        if not record["has_local_cached_file"]
    ]
    summary = {
        "cache_db": norm_path(cache_db),
        "cache_root": norm_path(cache_root),
        "source_root": norm_path(source_root),
        "prefixes": prefixes,
        "record_count": len(records),
        "file_count": len(file_records),
        "folder_count": len(records) - len(file_records),
        "cached_file_count": len(file_records) - len(cloud_only_files),
        "cloud_only_file_count": len(cloud_only_files),
        "copied_file_count": sum(int(record["copied_to_source_root"]) for record in file_records),
        "direct_local_file_count": sum(
            1 for record in file_records
            if record["cache_source_kind"] == "direct-local"
        ),
        "sha1_local_file_count": sum(
            1 for record in file_records
            if record["cache_source_kind"] == "sha1-local"
        ),
        "source_root_file_count": sum(
            1 for record in file_records
            if record["cache_source_kind"] == "source-root"
        ),
        "suffix_counts": dict(sorted(Counter(record["suffix"] for record in file_records).items())),
        "filecache_orphan_count": len(filecache_orphans),
        "failed_transfer_count": len(failed_transfers),
        "filecache_orphans": filecache_orphans,
        "failed_transfers": failed_transfers,
        "cloud_only_files": [
            {
                "cloud_path": record["cloud_path"],
                "metadata_size": record["metadata_size"],
                "metadata_sha1": record["metadata_sha1"],
            }
            for record in cloud_only_files
        ],
        "cloud_only_purchase_contracts": [
            record["cloud_path"]
            for record in cloud_only_files
            if "购销合同" in record["cloud_path"]
        ],
    }
    return records, summary


def write_outputs(records: list[dict[str, Any]], summary: dict[str, Any], parsed_dir: Path) -> None:
    parsed_dir.mkdir(parents=True, exist_ok=True)
    csv_path = parsed_dir / "wps_cloud_metadata.csv"
    json_path = parsed_dir / "wps_cloud_metadata.json"
    summary_path = parsed_dir / "wps_cloud_metadata_summary.md"

    fieldnames = list(records[0].keys()) if records else [
        "cloud_path",
        "file_id",
        "group_id",
        "metadata_type",
        "name",
        "suffix",
        "metadata_size",
        "metadata_sha1",
        "is_file",
        "has_cache_entry",
        "has_local_cached_file",
        "cache_source_kind",
        "cache_status",
        "cache_down_code",
        "cache_file_size",
        "cache_complete_size",
        "cache_source_path",
        "target_path",
        "copied_to_source_root",
    ]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)

    json_path.write_text(
        json.dumps({"summary": summary, "records": records}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lines = [
        "# WPS 云端文件索引盘点",
        "",
        f"- WPS 索引库：`{summary['cache_db']}`",
        f"- 盘点前缀：`{'; '.join(summary['prefixes'])}`",
        f"- 文件数：`{summary['file_count']}`",
        f"- 已有本机缓存文件数：`{summary['cached_file_count']}`",
        f"- 其中直接按团队文档路径发现文件数：`{summary['direct_local_file_count']}`",
        f"- 其中按 WPS 元数据 SHA1 匹配发现文件数：`{summary['sha1_local_file_count']}`",
        f"- 其中项目源目录已存在且大小匹配文件数：`{summary['source_root_file_count']}`",
        f"- 仅云端可见文件数：`{summary['cloud_only_file_count']}`",
        f"- 本轮复制到项目源目录文件数：`{summary['copied_file_count']}`",
        f"- metadata 外 filecache 线索数：`{summary['filecache_orphan_count']}`",
        f"- 失败下载记录数：`{summary['failed_transfer_count']}`",
        "",
        "## 后缀计数",
        "",
    ]
    for suffix, count in summary["suffix_counts"].items():
        lines.append(f"- `{suffix or '[none]'}`: `{count}`")
    lines.extend(["", "## 仅云端可见的文件", ""])
    for row in summary["cloud_only_files"]:
        lines.append(
            f"- `{row['cloud_path']}` size={row['metadata_size']} "
            f"sha1={row['metadata_sha1'] or '[unknown]'}"
        )
    lines.extend(["", "## 仅云端可见的采购合同", ""])
    for path in summary["cloud_only_purchase_contracts"]:
        lines.append(f"- `{path}`")
    lines.extend(["", "## metadata 外 filecache 线索", ""])
    for row in summary["filecache_orphans"]:
        lines.append(
            f"- `{row['cloud_path']}` size={row['file_size']} sha1={row['last_sha1'] or '[unknown]'} "
            f"local={'yes' if row['has_local_cached_file'] else 'no'}"
        )
    lines.extend(["", "## 失败下载记录", ""])
    for row in summary["failed_transfers"]:
        lines.append(
            f"- `{row['cloud_path']}` size={row['file_size']} status={row['status']} "
            f"error={row['error_code']} {row['error_msg']}"
        )
    summary_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inventory WPS cloud metadata for 11-报关记录.")
    parser.add_argument("--cache-db", type=Path, default=DEFAULT_WPS_CACHE_DB)
    parser.add_argument("--parsed-dir", type=Path, default=DEFAULT_PARSED_DIR)
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument(
        "--prefix",
        action="append",
        default=None,
        help="Cloud path prefix/pattern. Defaults to 11-报关记录/%%.",
    )
    parser.add_argument(
        "--copy-cached",
        action="store_true",
        help="Copy files that already exist in WPS local cache into the project source tree.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    prefixes = args.prefix or ["11-报关记录/%"]
    records, summary = build_records(args.cache_db, prefixes, args.source_root, args.copy_cached)
    write_outputs(records, summary, args.parsed_dir)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
