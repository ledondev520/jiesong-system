#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_remaining_action_matrix.json + cloud/formal blocker reports
Output: parsed/wps_missing_evidence_intake_package.{json,csv,md}
Pos: WPS 剩余缺失材料收件包；把行动矩阵转成可验收材料、校验命令和禁止动作；只读，不写库

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PARSED_DIR = ROOT / "tmp/wps_11_export_list_raw/parsed"
ACTION_JSON = PARSED_DIR / "wps_remaining_action_matrix.json"
CLOUD_JSON = PARSED_DIR / "wps_cloud_only_probe.json"
FORMAL_JSON = PARSED_DIR / "wps_formal_evidence_blockers.json"
OUT_JSON = PARSED_DIR / "wps_missing_evidence_intake_package.json"
OUT_CSV = PARSED_DIR / "wps_missing_evidence_intake_package.csv"
OUT_MD = PARSED_DIR / "wps_missing_evidence_intake_package.md"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"missing required input: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def compact(value: Any, limit: int = 240) -> str:
    if isinstance(value, list):
        text = "; ".join(str(item) for item in value if item)
    elif isinstance(value, dict):
        text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    else:
        text = str(value if value is not None else "")
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def markdown_escape(value: Any, limit: int = 180) -> str:
    return compact(value, limit).replace("|", "/")


def cloud_requirements(cloud: dict[str, Any]) -> dict[str, dict[str, Any]]:
    by_subject: dict[str, dict[str, Any]] = {}
    for item in cloud.get("items") or []:
        subject = item.get("cloud_path", "")
        by_subject[subject] = {
            "expected_size": item.get("metadata_size"),
            "expected_sha1": item.get("metadata_sha1", ""),
            "exact_local_match_count": item.get("exact_local_match_count", 0),
            "acceptance": (
                "必须取得与 WPS metadata 完全一致的本机文件；"
                f"size={item.get('metadata_size')}，sha1={item.get('metadata_sha1', '')}。"
            ),
            "validation": "python scripts/probe_wps_cloud_only_files.py && python scripts/close_wps_cloud_only_files.py",
        }
    return by_subject


def formal_requirements(formal: dict[str, Any]) -> dict[str, dict[str, Any]]:
    by_document: dict[str, dict[str, Any]] = {}
    for declaration in formal.get("declarations") or []:
        document_no = declaration.get("document_no", "")
        missing = declaration.get("nearest_missing_items") or []
        by_document[document_no] = {
            "contract_no": declaration.get("contract_no", ""),
            "nearest_source": compact(
                " / ".join(
                    str(part)
                    for part in [
                        declaration.get("nearest_source_contract_no", ""),
                        declaration.get("nearest_container_label", ""),
                        declaration.get("nearest_source_file", ""),
                    ]
                    if part
                ),
                260,
            ),
            "nearest_match": (
                f"{declaration.get('nearest_matched_count', 0)}/"
                f"{declaration.get('nearest_missing_count', 0)}/"
                f"{declaration.get('nearest_extra_count', 0)}"
            ),
            "missing_items": missing,
            "acceptance": (
                "必须补正式 18 位海关编号、正式报关单原件和正式报关明细；"
                "明细需能证明商品、HS、数量、金额、毛重、净重和归属。"
            ),
            "validation": (
                "python scripts/extract_wps_export_evidence.py && "
                "node scripts/import_wps_export_evidence.js && "
                "python scripts/analyze_wps_formal_customs_source_gaps.py"
            ),
        }
    return by_document


def material_type(row: dict[str, Any]) -> str:
    lane = row.get("action_lane", "")
    if lane == "fetch_exact_cloud_original":
        return "exact_cloud_original"
    if lane == "formal_customs_evidence":
        return "formal_customs_document"
    if lane == "formalize_pending_contract":
        return "formal_contract_or_keep_decision"
    if lane == "confirm_product_alias_or_original_page":
        return "product_alias_or_original_page"
    if lane == "store_ownership_decision":
        return "store_ownership_evidence"
    if lane == "quantity_split_or_aggregate_evidence":
        return "quantity_split_or_aggregate_evidence"
    if lane in {"price_or_zero_price_decision", "sales_store_price_decision"}:
        return "price_or_business_decision"
    if lane == "historical_keep_or_cleanup_policy":
        return "historical_keep_or_cleanup_policy"
    return "manual_review"


def acceptance_for(row: dict[str, Any], cloud_by_subject: dict[str, dict[str, Any]], formal_by_document: dict[str, dict[str, Any]]) -> tuple[str, str, str]:
    subject = row.get("subject", "")
    document_no = row.get("document_no", "")
    if row.get("action_lane") == "fetch_exact_cloud_original":
        cloud = cloud_by_subject.get(subject) or {}
        return (
            cloud.get("acceptance")
            or "必须取得目标云端原件的 SHA1 精确本机副本。",
            cloud.get("validation") or row.get("after_input_runner", ""),
            f"expected_size={cloud.get('expected_size', '')}; expected_sha1={cloud.get('expected_sha1', '')}",
        )
    if row.get("action_lane") == "formal_customs_evidence":
        formal = formal_by_document.get(document_no) or formal_by_document.get(subject) or {}
        return (
            formal.get("acceptance")
            or row.get("needed_input", ""),
            formal.get("validation") or row.get("after_input_runner", ""),
            compact({
                "nearest_source": formal.get("nearest_source", ""),
                "nearest_match": formal.get("nearest_match", ""),
                "missing_items": formal.get("missing_items", []),
            }),
        )
    return (
        row.get("needed_input", ""),
        row.get("after_input_runner", ""),
        "",
    )


def build_report() -> dict[str, Any]:
    action = load_json(ACTION_JSON)
    cloud = load_json(CLOUD_JSON)
    formal = load_json(FORMAL_JSON)
    cloud_by_subject = cloud_requirements(cloud)
    formal_by_document = formal_requirements(formal)

    rows: list[dict[str, Any]] = []
    for index, row in enumerate(action.get("rows") or [], start=1):
        acceptance, validation, strict_fields = acceptance_for(row, cloud_by_subject, formal_by_document)
        rows.append({
            "id": f"WPS-INTAKE-{index:03d}",
            "source_action_id": row.get("id", ""),
            "priority": row.get("priority", ""),
            "material_type": material_type(row),
            "evidence_owner": row.get("evidence_owner", ""),
            "subject": row.get("subject", ""),
            "contract_no": row.get("contract_no", ""),
            "document_no": row.get("document_no", ""),
            "acceptance_criteria": compact(acceptance),
            "strict_fields": compact(strict_fields),
            "validation_runner": validation,
            "guardrail": row.get("guardrail", ""),
            "source_report": row.get("source_report", ""),
            "ready_for_apply": 0,
        })

    by_material = Counter(row["material_type"] for row in rows)
    by_priority = Counter(row["priority"] for row in rows)
    by_owner = Counter(row["evidence_owner"] for row in rows)

    return {
        "status": "missing_evidence_intake_package_ready",
        "mode": "read_only_no_db_writes",
        "inputs": {
            "action_matrix": str(ACTION_JSON.relative_to(ROOT)),
            "cloud_probe": str(CLOUD_JSON.relative_to(ROOT)),
            "formal_blockers": str(FORMAL_JSON.relative_to(ROOT)),
        },
        "counts": {
            "total_rows": len(rows),
            "ready_for_apply": 0,
            "cloud_only_targets": cloud.get("target_count", 0),
            "cloud_ready_to_copy": cloud.get("ready_to_copy_count", 0),
            "formal_blockers": formal.get("total", 0),
            "formal_auto_writable": formal.get("auto_writable", 0),
            "formal_customs_candidate_count": formal.get("formal_customs_candidate_count", 0),
        },
        "by_priority": [{"priority": key, "count": value} for key, value in sorted(by_priority.items())],
        "by_material_type": [{"material_type": key, "count": value} for key, value in by_material.most_common()],
        "by_evidence_owner": [{"evidence_owner": key, "count": value} for key, value in by_owner.most_common()],
        "rows": rows,
    }


def write_csv(report: dict[str, Any]) -> None:
    fields = [
        "id", "source_action_id", "priority", "material_type", "evidence_owner",
        "subject", "contract_no", "document_no", "acceptance_criteria",
        "strict_fields", "validation_runner", "guardrail", "source_report",
        "ready_for_apply",
    ]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(report["rows"])


def write_md(report: dict[str, Any]) -> None:
    lines = [
        "# WPS 缺失材料收件校验包",
        "",
        f"状态：`{report['status']}`",
        f"模式：`{report['mode']}`",
        f"总行数：`{report['counts']['total_rows']}`",
        f"当前可直接 apply：`{report['counts']['ready_for_apply']}`",
        f"cloud-only 目标：`{report['counts']['cloud_only_targets']}`，可复制：`{report['counts']['cloud_ready_to_copy']}`",
        f"正式报关材料缺口：`{report['counts']['formal_blockers']}`，正式候选：`{report['counts']['formal_customs_candidate_count']}`",
        "",
        "## 收件原则",
        "- 同名文件、旧缓存、旧版本、近似商品、部分装箱源都不能关闭缺口。",
        "- cloud-only 原件必须通过目标 size/SHA1 精确校验。",
        "- 正式报关必须有正式 18 位海关编号、正式报关单原件和正式明细。",
        "- 业务裁决项收到裁决后仍需单独 dry-run/apply，不从本报告直接写库。",
        "",
        "## 材料类型",
        "| 材料类型 | 数量 |",
        "|---|---:|",
    ]
    lines += [f"| `{item['material_type']}` | {item['count']} |" for item in report["by_material_type"]]
    lines += ["", "## 优先级", "| 优先级 | 数量 |", "|---|---:|"]
    lines += [f"| `{item['priority']}` | {item['count']} |" for item in report["by_priority"]]
    lines += [
        "",
        "## P0 收件明细",
        "| ID | 材料类型 | 对象 | 验收标准 | 严格字段 | 校验命令 |",
        "|---|---|---|---|---|---|",
    ]
    for row in report["rows"]:
        if row["priority"] != "P0":
            continue
        lines.append(
            "| {id} | `{kind}` | {subject} | {criteria} | {fields} | `{runner}` |".format(
                id=row["id"],
                kind=row["material_type"],
                subject=markdown_escape(row["subject"], 90),
                criteria=markdown_escape(row["acceptance_criteria"], 140),
                fields=markdown_escape(row["strict_fields"], 140) or "-",
                runner=row["validation_runner"].replace("|", "/"),
            )
        )
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    report = build_report()
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(report)
    write_md(report)
    print(json.dumps({
        "status": report["status"],
        "total_rows": report["counts"]["total_rows"],
        "ready_for_apply": report["counts"]["ready_for_apply"],
        "cloud_ready_to_copy": report["counts"]["cloud_ready_to_copy"],
        "formal_customs_candidate_count": report["counts"]["formal_customs_candidate_count"],
        "out": {
            "json": str(OUT_JSON),
            "csv": str(OUT_CSV),
            "md": str(OUT_MD),
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
