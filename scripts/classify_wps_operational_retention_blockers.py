#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_remaining_source_gap_execution_plan.json + parsed/wps_operational_duplicate_coverage.json
Output: parsed/wps_operational_retention_blockers.{json,csv,md}
Pos: WPS 操作性历史行保留/清理关闭清单；只读，不写库

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
EXECUTION_JSON = PARSED_DIR / "wps_remaining_source_gap_execution_plan.json"
DUPLICATE_JSON = PARSED_DIR / "wps_operational_duplicate_coverage.json"
OUT_JSON = PARSED_DIR / "wps_operational_retention_blockers.json"
OUT_CSV = PARSED_DIR / "wps_operational_retention_blockers.csv"
OUT_MD = PARSED_DIR / "wps_operational_retention_blockers.md"

ACTION_FAMILIES = {
    "operational_keep_or_cleanup_decision",
    "pending_placeholder_review",
    "operational_review",
}


def load_json(path: Path, default: dict[str, Any] | None = None) -> dict[str, Any]:
    if not path.exists():
        return default or {}
    return json.loads(path.read_text(encoding="utf-8"))


def classify(row: dict[str, Any]) -> tuple[str, str, str]:
    state = row.get("evidence_state")
    if state == "zero_quantity_price_no_ref_review":
        return (
            "zero_quantity_zero_price_no_refs",
            "该历史行数量和售价均为 0，且无库存/报关引用；技术上可进入清理候选，但没有来源反证或业务确认前不能自动删除。",
            "需要确认删除、保留为历史占位，或补充能证明该行来源的材料。",
        )
    if state == "zero_price_no_ref_review":
        return (
            "nonzero_quantity_zero_price_no_refs",
            "该销售行有数量但售价为 0，且无库存引用；可能是成本、报关、历史操作或待补价格行。",
            "需要确认零价是否真实、是否应改价、删除或继续保留；没有裁决前不写库。",
        )
    if state == "pending_placeholder_review":
        return (
            "pending_contract_placeholder",
            "该行属于 PENDING 占位合同；即使无引用，也不能自动删除或当作正式合同来源。",
            "需要正式合同/报关/装箱材料，或确认占位合同继续保留。",
        )
    if state == "operational_marker_no_ref_review":
        return (
            "operational_marker_no_refs",
            "该装箱行带非捷淞、拼船、自行报关或类似操作标记且无引用；这类标记本身就是历史语义。",
            "需要运营口径确认保留或清理；不能仅凭无引用自动删除。",
        )
    return (
        "operational_no_refs_unspecified",
        "该行无引用但缺少更具体来源或操作标记，不能证明应自动删除。",
        "需要补来源材料，或确认保留/清理口径后另建 apply 任务。",
    )


def build_report() -> dict[str, Any]:
    execution = load_json(EXECUTION_JSON)
    duplicate = load_json(DUPLICATE_JSON)
    rows = [
        row for row in execution.get("rows", [])
        if row.get("action_family") in ACTION_FAMILIES
    ]

    details: list[dict[str, Any]] = []
    blocker_counts: Counter[str] = Counter()
    state_counts: Counter[str] = Counter()
    type_counts: Counter[str] = Counter()
    action_counts: Counter[str] = Counter()

    for row in rows:
        blocker, rationale, safe_next_step = classify(row)
        blocker_counts[blocker] += 1
        state_counts[row.get("evidence_state", "")] += 1
        type_counts[row.get("type", "")] += 1
        action_counts[row.get("action_family", "")] += 1
        details.append({
            "blocker": blocker,
            "id": row.get("id"),
            "type": row.get("type"),
            "contract_no": row.get("contract_no"),
            "document_no": row.get("document_no"),
            "product": row.get("product"),
            "store": row.get("store"),
            "quantity": row.get("quantity"),
            "unit": row.get("unit"),
            "price": row.get("price"),
            "action_family": row.get("action_family"),
            "evidence_state": row.get("evidence_state"),
            "inventory_refs": (row.get("refs") or {}).get("inventory_refs", 0),
            "customs_refs": (row.get("refs") or {}).get("customs_refs", 0),
            "flags": row.get("flags") or [],
            "rationale": rationale,
            "safe_next_step": safe_next_step,
        })

    return {
        "status": "operational_retention_blockers_classified",
        "mode": "read_only_no_db_writes",
        "total": len(details),
        "auto_writable": 0,
        "db_writes": 0,
        "source_duplicate_review": {
            "status": duplicate.get("status"),
            "exact_duplicate_candidates": duplicate.get("exact_duplicate_candidates", 0),
            "near_price_conflict_reviews": duplicate.get("near_price_conflict_reviews", 0),
            "auto_writable": duplicate.get("auto_writable", 0),
        },
        "by_blocker": [{"blocker": key, "count": value} for key, value in blocker_counts.most_common()],
        "by_action_family": [{"action_family": key, "count": value} for key, value in action_counts.most_common()],
        "by_evidence_state": [{"evidence_state": key, "count": value} for key, value in state_counts.most_common()],
        "by_type": [{"type": key, "count": value} for key, value in type_counts.most_common()],
        "details": details,
    }


def write_csv(report: dict[str, Any]) -> None:
    fields = [
        "blocker", "action_family", "evidence_state", "type", "contract_no",
        "document_no", "product", "store", "quantity", "unit", "price",
        "inventory_refs", "customs_refs", "flags", "rationale", "safe_next_step",
    ]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in report["details"]:
            output = {field: row.get(field, "") for field in fields}
            output["flags"] = "; ".join(row.get("flags") or [])
            writer.writerow(output)


def md_cell(value: Any) -> str:
    text = str(value if value is not None else "")
    return text.replace("|", "/").replace("\n", " ")[:180] or "-"


def render_md(report: dict[str, Any]) -> str:
    duplicate = report["source_duplicate_review"]
    lines = [
        "# WPS 操作性历史行保留/清理关闭清单",
        "",
        f"状态：`{report['status']}`",
        f"模式：`{report['mode']}`",
        f"总数：`{report['total']}`",
        f"自动可写：`{report['auto_writable']}`",
        f"严格来源覆盖重复候选：`{duplicate.get('exact_duplicate_candidates')}`",
        f"近似价格冲突复核：`{duplicate.get('near_price_conflict_reviews')}`",
        "",
        "## 阻断类型",
        "| 阻断类型 | 数量 |",
        "|---|---:|",
    ]
    for row in report["by_blocker"]:
        lines.append(f"| `{row['blocker']}` | {row['count']} |")
    lines.extend([
        "",
        "## 明细",
        "| 阻断类型 | 类型 | 合同 | 商品 | 门店 | 数量 | 价格 | 引用 | 下一步 |",
        "|---|---|---|---|---|---:|---:|---|---|",
    ])
    for row in report["details"]:
        refs = f"inventory={row['inventory_refs']}; customs={row['customs_refs']}"
        lines.append(
            "| "
            + " | ".join([
                md_cell(row["blocker"]),
                md_cell(row["type"]),
                md_cell(row["contract_no"]),
                md_cell(row["product"]),
                md_cell(row["store"]),
                md_cell(row["quantity"]),
                md_cell(row["price"]),
                md_cell(refs),
                md_cell(row["safe_next_step"]),
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
        "total": report["total"],
        "auto_writable": report["auto_writable"],
        "source_duplicate_review": report["source_duplicate_review"],
        "by_blocker": report["by_blocker"],
        "out": {
            "json": str(OUT_JSON),
            "csv": str(OUT_CSV),
            "md": str(OUT_MD),
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
