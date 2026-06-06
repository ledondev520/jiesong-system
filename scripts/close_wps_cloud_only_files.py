#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_cloud_only_probe.json
Output: parsed/wps_cloud_only_close_plan.{json,md} + optional copies into tmp/wps_11_export_list_raw/11-报关记录
Pos: WPS cloud-only 原件关闭工具；仅在本机候选 SHA1 精确等于 WPS metadata 时复制到项目源目录；默认 dry-run，不写库

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PARSED_DIR = ROOT / "tmp/wps_11_export_list_raw/parsed"
SOURCE_ROOT = ROOT / "tmp/wps_11_export_list_raw/11-报关记录"
PROBE_JSON = PARSED_DIR / "wps_cloud_only_probe.json"
OUT_JSON = PARSED_DIR / "wps_cloud_only_close_plan.json"
OUT_MD = PARSED_DIR / "wps_cloud_only_close_plan.md"


def sha1_file(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_target_path(item: dict[str, Any]) -> Path:
    cloud_path = str(item.get("cloud_path") or "")
    filename = Path(cloud_path).name
    if item.get("scope") == "11-报关记录":
        relative = cloud_path.removeprefix("11-报关记录/").lstrip("/")
        return SOURCE_ROOT / relative
    if item.get("scope") == "root_shipment_cloud":
        return SOURCE_ROOT / "_wps_cloud_root" / filename
    raise ValueError(f"unsupported cloud-only scope: {item.get('scope')}")


def exact_local_candidates(item: dict[str, Any]) -> list[Path]:
    candidates = []
    target_sha1 = item.get("metadata_sha1")
    for row in item.get("local_candidates", []):
        if row.get("match") != "exact_sha1":
            continue
        path = Path(str(row.get("path") or ""))
        if not path.exists() or not path.is_file():
            continue
        if target_sha1 and sha1_file(path) != target_sha1:
            continue
        candidates.append(path)
    return candidates


def build_action(item: dict[str, Any], *, replace_existing: bool) -> dict[str, Any]:
    target = canonical_target_path(item)
    candidates = exact_local_candidates(item)
    target_sha1 = item.get("metadata_sha1") or ""
    target_size = item.get("metadata_size")
    existing = target.exists() and target.is_file()
    existing_sha1 = sha1_file(target) if existing else ""
    existing_size = target.stat().st_size if existing else None

    action: dict[str, Any] = {
        "scope": item.get("scope"),
        "cloud_path": item.get("cloud_path"),
        "metadata_size": target_size,
        "metadata_sha1": target_sha1,
        "target_path": str(target),
        "existing": existing,
        "existing_size": existing_size,
        "existing_sha1": existing_sha1,
        "exact_candidate_count": len(candidates),
        "source_path": str(candidates[0]) if candidates else "",
        "needs_replace_existing": False,
        "backup_path": "",
        "status": "not_ready",
        "reason": "",
    }

    if existing and existing_sha1 == target_sha1:
        action["status"] = "already_closed"
        action["reason"] = "target already has exact metadata SHA1"
        return action
    if not candidates:
        action["status"] = "not_ready"
        action["reason"] = "no local candidate has exact metadata SHA1"
        return action
    if existing and existing_sha1 != target_sha1:
        action["needs_replace_existing"] = True
        action["backup_path"] = str(
            target.with_name(f"{target.name}.superseded-{existing_sha1[:12]}")
        )
        if not replace_existing:
            action["status"] = "blocked_existing_mismatch"
            action["reason"] = "target path contains a different version; rerun with --replace-existing after review"
            return action
    action["status"] = "ready_to_copy"
    action["reason"] = "exact SHA1 source available"
    return action


def apply_action(action: dict[str, Any]) -> None:
    if action["status"] != "ready_to_copy":
        return
    source = Path(action["source_path"])
    target = Path(action["target_path"])
    target.parent.mkdir(parents=True, exist_ok=True)
    if action.get("needs_replace_existing"):
        backup = Path(action["backup_path"])
        if not backup.exists():
            shutil.copy2(target, backup)
    shutil.copy2(source, target)
    copied_sha1 = sha1_file(target)
    if copied_sha1 != action["metadata_sha1"]:
        raise RuntimeError(f"copied file SHA1 mismatch: {target}")
    action["status"] = "copied"
    action["copied_sha1"] = copied_sha1


def build_plan(*, replace_existing: bool) -> dict[str, Any]:
    probe = load_json(PROBE_JSON, {})
    items = probe.get("items", [])
    actions = [build_action(item, replace_existing=replace_existing) for item in items]
    return {
        "status": "wps_cloud_only_close_plan_ready",
        "mode": "dry-run",
        "probe_status": probe.get("status"),
        "replace_existing": replace_existing,
        "target_count": len(actions),
        "ready_to_copy_count": sum(1 for action in actions if action["status"] == "ready_to_copy"),
        "already_closed_count": sum(1 for action in actions if action["status"] == "already_closed"),
        "blocked_existing_mismatch_count": sum(1 for action in actions if action["status"] == "blocked_existing_mismatch"),
        "not_ready_count": sum(1 for action in actions if action["status"] == "not_ready"),
        "db_writes": 0,
        "actions": actions,
    }


def render_md(plan: dict[str, Any]) -> str:
    lines = [
        "# WPS cloud-only 原件关闭计划",
        "",
        f"状态：`{plan['status']}`",
        f"模式：`{plan['mode']}`",
        f"目标数：`{plan['target_count']}`",
        f"可复制：`{plan['ready_to_copy_count']}`",
        f"已关闭：`{plan['already_closed_count']}`",
        f"旧版本阻塞：`{plan['blocked_existing_mismatch_count']}`",
        f"未就绪：`{plan['not_ready_count']}`",
        "数据库写入：`0`",
        "",
        "## 口径",
        "- 只消费 `wps_cloud_only_probe.json` 中 SHA1 精确匹配的本机候选。",
        "- 默认 dry-run，不复制文件、不写数据库。",
        "- 目标路径已有不同 SHA1 文件时，必须显式 `--replace-existing`；旧文件会先复制为 `.superseded-<sha1>` 备份。",
        "- 复制后必须重新运行 WPS cloud metadata 盘点、出口文件留存审计和完成度审计。",
        "",
        "## 明细",
        "| 状态 | 范围 | 云端路径 | 目标路径 | 来源 | 原因 |",
        "|---|---|---|---|---|---|",
    ]
    for action in plan["actions"]:
        lines.append(
            f"| `{action['status']}` | {action['scope']} | {action['cloud_path']} | `{action['target_path']}` | `{action.get('source_path') or '-'}` | {action['reason']} |"
        )
    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Close WPS cloud-only files when exact SHA1 candidates exist.")
    parser.add_argument("--apply", action="store_true", help="copy exact SHA1 files into the canonical project source path")
    parser.add_argument("--replace-existing", action="store_true", help="replace a different-version target after backing it up")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    plan = build_plan(replace_existing=args.replace_existing)
    if args.apply:
        for action in plan["actions"]:
            apply_action(action)
        plan["mode"] = "apply"
        plan["copied_count"] = sum(1 for action in plan["actions"] if action["status"] == "copied")
    OUT_JSON.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUT_MD.write_text(render_md(plan), encoding="utf-8")
    print(json.dumps({
        "status": plan["status"],
        "mode": plan["mode"],
        "target_count": plan["target_count"],
        "ready_to_copy_count": plan["ready_to_copy_count"],
        "already_closed_count": plan["already_closed_count"],
        "blocked_existing_mismatch_count": plan["blocked_existing_mismatch_count"],
        "not_ready_count": plan["not_ready_count"],
        "copied_count": plan.get("copied_count", 0),
        "db_writes": plan["db_writes"],
        "out": {"json": str(OUT_JSON), "md": str(OUT_MD)},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
