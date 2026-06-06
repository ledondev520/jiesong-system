#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_remaining_source_gap_execution_plan.json + parsed/wps_source_gap_details.json
Output: parsed/wps_no_candidate_source_blockers.{json,csv,md}
Pos: WPS 剩余 no-candidate 来源缺口阻断原因分类；只读，不写库

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
DETAIL_JSON = PARSED_DIR / "wps_source_gap_details.json"
OUT_JSON = PARSED_DIR / "wps_no_candidate_source_blockers.json"
OUT_CSV = PARSED_DIR / "wps_no_candidate_source_blockers.csv"
OUT_MD = PARSED_DIR / "wps_no_candidate_source_blockers.md"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def stage_count(detail: dict[str, Any], key: str) -> int:
    value = (detail.get("stage_counts") or {}).get(key, 0)
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def classify(row: dict[str, Any], detail: dict[str, Any]) -> tuple[str, str, str]:
    contract_no = str(row.get("contract_no") or "")
    same_contract = stage_count(detail, "same_contract")
    same_product = stage_count(detail, "same_contract_product")

    if contract_no.startswith("PENDING-"):
        return (
            "pending_contract_placeholder",
            "该行挂在 PENDING 占位合同下，当前标准化 WPS 出货/装箱源里没有可证明其正式来源的同合同材料。",
            "需要拿到正式合同号、正式装箱/出货来源，或确认占位行继续以无来源历史行保留。",
        )

    if row.get("type") == "sales_item_missing_source":
        if same_contract > 0 and same_product == 0:
            return (
                "sales_contract_has_sources_but_no_product_match",
                "同一出口合同下存在 WPS 销售源行，但没有任何同商品候选；不能用同合同相似商品硬补来源。",
                "需要补商品别名证据、销售合同页原文，或确认 DB 商品名/源商品名应如何对齐。",
            )
        return (
            "sales_contract_missing_from_standardized_sources",
            "当前标准化 WPS 销售源里连同合同候选也没有，无法从现有来源链证明该销售明细。",
            "需要重新取得该合同的销售原件、旧线下清单，或确认该历史销售行继续保留为无来源缺口。",
        )

    if row.get("type") == "packing_item_missing_source":
        if same_contract > 0 and same_product == 0:
            return (
                "packing_contract_has_sources_but_no_product_match",
                "同一出口合同下存在 WPS 装箱源行，但没有任何同商品候选；不能把同合同其他商品的来源挂到当前行。",
                "需要补装货页/装箱页原文，或确认商品名别名关系后再跑 all-source dry-run。",
            )
        return (
            "packing_contract_missing_from_standardized_sources",
            "当前标准化 WPS 装箱源里没有可用同合同候选，无法证明该装箱明细来源。",
            "需要补正式装箱/装货来源，或确认该历史装箱行继续保留为无来源缺口。",
        )

    return (
        "manual_review_required",
        "当前规则无法判断该 no-candidate 来源缺口的具体证据缺口。",
        "先补来源缺口明细包，再扩展分类规则。",
    )


def build_report() -> dict[str, Any]:
    execution = load_json(EXECUTION_JSON)
    details = {row.get("id", ""): row for row in load_json(DETAIL_JSON).get("details", [])}
    rows = [
        row
        for row in execution.get("rows", [])
        if row.get("action_family") == "source_required_no_candidate"
    ]

    classified: list[dict[str, Any]] = []
    blocker_counts: Counter[str] = Counter()
    type_counts: Counter[str] = Counter()
    contract_counts: Counter[str] = Counter()

    for row in rows:
        detail = details.get(row.get("id", ""), {})
        blocker, rationale, safe_next_step = classify(row, detail)
        blocker_counts[blocker] += 1
        type_counts[row.get("type", "")] += 1
        contract_counts[row.get("contract_no", "")] += 1
        classified.append({
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
            "same_contract_count": stage_count(detail, "same_contract"),
            "same_product_count": stage_count(detail, "same_contract_product"),
            "strict_count": stage_count(detail, "strict"),
            "rationale": rationale,
            "safe_next_step": safe_next_step,
            "forbidden_actions": row.get("forbidden_actions") or [],
        })

    return {
        "status": "no_candidate_source_blockers_classified",
        "mode": "read_only_no_db_writes",
        "total": len(classified),
        "auto_writable": 0,
        "db_writes": 0,
        "by_blocker": [
            {"blocker": key, "count": value}
            for key, value in blocker_counts.most_common()
        ],
        "by_type": [
            {"type": key, "count": value}
            for key, value in type_counts.most_common()
        ],
        "top_contracts": [
            {"contract_no": key, "count": value}
            for key, value in contract_counts.most_common(20)
        ],
        "details": classified,
    }


def write_csv(report: dict[str, Any]) -> None:
    fields = [
        "blocker", "type", "contract_no", "document_no", "product", "store",
        "quantity", "unit", "price", "same_contract_count", "same_product_count",
        "strict_count", "rationale", "safe_next_step",
    ]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in report["details"]:
            writer.writerow({field: row.get(field, "") for field in fields})


def md_cell(value: Any) -> str:
    text = str(value if value is not None else "")
    return text.replace("|", "/").replace("\n", " ")[:180] or "-"


def render_md(report: dict[str, Any]) -> str:
    lines = [
        "# WPS no-candidate 来源缺口阻断原因",
        "",
        f"状态：`{report['status']}`",
        f"模式：`{report['mode']}`",
        f"总数：`{report['total']}`",
        f"自动可写：`{report['auto_writable']}`",
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
        "| 阻断类型 | 类型 | 合同 | 商品 | 门店 | 数量 | 价格 | 同合同源 | 同商品源 | 下一步 |",
        "|---|---|---|---|---|---:|---:|---:|---:|---|",
    ])
    for row in report["details"]:
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
                md_cell(row["same_contract_count"]),
                md_cell(row["same_product_count"]),
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
        "by_blocker": report["by_blocker"],
        "out": {
            "json": str(OUT_JSON),
            "csv": str(OUT_CSV),
            "md": str(OUT_MD),
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
