#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_cloud_only_probe.json
Output: parsed/wps_cloud_only_broad_local_search.{json,csv,md}
Pos: WPS cloud-only 目标原件广域本机只读搜索；按文件名和目标大小查找并校验 SHA1；不写库不复制

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PARSED_DIR = ROOT / "tmp/wps_11_export_list_raw/parsed"
PROBE_JSON = PARSED_DIR / "wps_cloud_only_probe.json"
OUT_JSON = PARSED_DIR / "wps_cloud_only_broad_local_search.json"
OUT_CSV = PARSED_DIR / "wps_cloud_only_broad_local_search.csv"
OUT_MD = PARSED_DIR / "wps_cloud_only_broad_local_search.md"

SEARCH_ROOTS = [
    Path("/Users/helena/Cursor"),
    Path("/Users/helena/Downloads"),
    Path("/Users/helena/Documents"),
    Path("/Users/helena/Desktop"),
    Path("/Users/helena/Library/Containers/com.kingsoft.wpsoffice.mac/Data/Library/Application Support/Kingsoft/WPS Cloud Files"),
    Path("/private/tmp"),
    Path("/private/var/folders/m7/nvwypzm13hs3yj_yzr3173dr0000gn/T"),
]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha1_file(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def iter_files(root: Path):
    if not root.exists():
        return
    for current, dirs, files in os.walk(root, topdown=True):
        dirs[:] = [name for name in dirs if name not in {".git", "node_modules", "dist", "build"}]
        for name in files:
            yield Path(current) / name


def candidate_reason(path: Path, target_name: str, target_size: int) -> str | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    name_match = path.name == target_name
    size_match = stat.st_size == target_size
    if name_match and size_match:
        return "name_and_size"
    if name_match:
        return "name_only"
    if size_match:
        return "size_only"
    return None


def build_report() -> dict[str, Any]:
    source = load_json(PROBE_JSON)
    targets = []
    for item in source.get("items") or []:
        target_name = Path(item.get("cloud_path") or "").name
        target_size = int(item.get("metadata_size") or 0)
        target_sha1 = item.get("metadata_sha1") or ""
        candidates = []
        seen: set[str] = set()
        errors = []
        for root in SEARCH_ROOTS:
            try:
                iterator = iter_files(root) or []
                for path in iterator:
                    path_text = str(path)
                    if path_text in seen:
                        continue
                    reason = candidate_reason(path, target_name, target_size)
                    if not reason:
                        continue
                    seen.add(path_text)
                    try:
                        stat = path.stat()
                        digest = sha1_file(path)
                        candidates.append({
                            "path": path_text,
                            "reason": reason,
                            "size": stat.st_size,
                            "sha1": digest,
                            "sha1_match": digest == target_sha1,
                            "size_match": stat.st_size == target_size,
                            "name_match": path.name == target_name,
                        })
                    except OSError as exc:
                        errors.append({"path": path_text, "error": str(exc)})
            except OSError as exc:
                errors.append({"path": str(root), "error": str(exc)})
        exact = [row for row in candidates if row["sha1_match"]]
        targets.append({
            "scope": item.get("scope"),
            "cloud_path": item.get("cloud_path"),
            "target_name": target_name,
            "metadata_size": target_size,
            "metadata_sha1": target_sha1,
            "candidate_count": len(candidates),
            "exact_match_count": len(exact),
            "ready_to_copy": bool(exact),
            "candidates": candidates,
            "errors": errors[:20],
        })
    return {
        "status": "broad_local_search_complete",
        "mode": "read_only_no_copy_no_db_writes",
        "target_count": len(targets),
        "ready_to_copy_count": sum(1 for row in targets if row["ready_to_copy"]),
        "search_roots": [str(path) for path in SEARCH_ROOTS],
        "targets": targets,
    }


def write_csv(report: dict[str, Any]) -> None:
    fields = [
        "scope", "cloud_path", "path", "reason", "size", "sha1",
        "sha1_match", "size_match", "name_match",
    ]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for target in report["targets"]:
            for candidate in target["candidates"]:
                writer.writerow({
                    "scope": target.get("scope", ""),
                    "cloud_path": target.get("cloud_path", ""),
                    **{field: candidate.get(field, "") for field in fields if field not in {"scope", "cloud_path"}},
                })


def md_cell(value: Any) -> str:
    text = str(value if value is not None else "")
    return text.replace("|", "/").replace("\n", " ")[:220] or "-"


def render_md(report: dict[str, Any]) -> str:
    lines = [
        "# WPS cloud-only 目标原件广域本机搜索",
        "",
        f"状态：`{report['status']}`",
        f"模式：`{report['mode']}`",
        f"目标数：`{report['target_count']}`",
        f"可复制目标：`{report['ready_to_copy_count']}`",
        "",
        "## 目标",
        "| Scope | Cloud Path | 目标大小 | 目标 SHA1 | 候选 | 精确命中 |",
        "|---|---|---:|---|---:|---:|",
    ]
    for target in report["targets"]:
        lines.append(
            "| "
            + " | ".join([
                md_cell(target["scope"]),
                md_cell(target["cloud_path"]),
                md_cell(target["metadata_size"]),
                md_cell(target["metadata_sha1"]),
                md_cell(target["candidate_count"]),
                md_cell(target["exact_match_count"]),
            ])
            + " |"
        )
    lines.extend([
        "",
        "## 候选文件",
        "| Scope | Cloud Path | Reason | Size | SHA1 | Match | Path |",
        "|---|---|---|---:|---|---|---|",
    ])
    for target in report["targets"]:
        for candidate in target["candidates"]:
            lines.append(
                "| "
                + " | ".join([
                    md_cell(target["scope"]),
                    md_cell(target["cloud_path"]),
                    md_cell(candidate["reason"]),
                    md_cell(candidate["size"]),
                    md_cell(candidate["sha1"]),
                    md_cell(candidate["sha1_match"]),
                    md_cell(candidate["path"]),
                ])
                + " |"
            )
    return "\n".join(lines) + "\n"


def main() -> None:
    report = build_report()
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(report)
    OUT_MD.write_text(render_md(report), encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "target_count": report["target_count"],
        "ready_to_copy_count": report["ready_to_copy_count"],
        "out": {
            "json": str(OUT_JSON),
            "csv": str(OUT_CSV),
            "md": str(OUT_MD),
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
