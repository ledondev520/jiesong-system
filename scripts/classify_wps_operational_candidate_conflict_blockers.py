#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_remaining_source_gap_execution_plan.json + parsed/wps_source_gap_details.json
Output: parsed/wps_operational_candidate_conflict_blockers.{json,csv,md}
Pos: WPS 操作性 candidate_conflict_review 来源缺口阻断原因分类；只读，不写库

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
OUT_JSON = PARSED_DIR / "wps_operational_candidate_conflict_blockers.json"
OUT_CSV = PARSED_DIR / "wps_operational_candidate_conflict_blockers.csv"
OUT_MD = PARSED_DIR / "wps_operational_candidate_conflict_blockers.md"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def is_zero(value: Any) -> bool:
    value_number = number(value)
    return value_number is not None and abs(value_number) < 1e-9


def stage_count(detail: dict[str, Any], key: str) -> int:
    value = (detail.get("stage_counts") or {}).get(key, 0)
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def classify(row: dict[str, Any], detail: dict[str, Any]) -> tuple[str, str, str]:
    if stage_count(detail, "same_contract_product_store_quantity") > 0:
        return (
            "same_quantity_price_conflict",
            "WPS 源能命中同合同、同商品、同门店、同数量，但价格未严格匹配；常见形态是 DB 历史行价格为 0。",
            "需要业务确认零价行应保留、改价、删除或与带来源行合并；没有裁决前不写库。",
        )
    if stage_count(detail, "same_contract_product_store") > 0 and is_zero(row.get("quantity")):
        return (
            "zero_quantity_candidate_quantity_conflict",
            "DB 历史行数量为 0，但 WPS 源存在同合同、同商品、同门店候选且数量不是 0。",
            "需要确认 0 数量行是否为历史占位/操作行，或补能证明应按源数量修正的文件证据。",
        )
    if stage_count(detail, "same_contract_product_store") > 0:
        return (
            "quantity_conflict_same_store",
            "WPS 源能命中同合同、同商品、同门店，但数量不一致；不能用相同商品门店直接补来源 note。",
            "需要证明拆分/聚合数量关系，或确认 DB 行按历史口径保留。",
        )
    if stage_count(detail, "same_contract_product") > 0:
        return (
            "store_conflict_same_product",
            "WPS 源能命中同合同、同商品，但门店不一致或只存在组合门店候选。",
            "需要门店归属裁决、组合门店拆分证据或原装箱/销售页正文。",
        )
    if stage_count(detail, "same_contract") > 0:
        return (
            "product_conflict_same_contract",
            "同合同下有 WPS 来源，但没有同商品候选。",
            "需要商品别名证据或原文件页证明同一商品。",
        )
    return (
        "missing_standardized_contract_source",
        "当前标准化 WPS 源里没有可用同合同候选。",
        "需要重新取得原件或旧线下清单，补源后再跑来源缺口 dry-run。",
    )


def build_report() -> dict[str, Any]:
    execution = load_json(EXECUTION_JSON)
    details = {row.get("id", ""): row for row in load_json(DETAIL_JSON).get("details", [])}
    rows = [
        row
        for row in execution.get("rows", [])
        if row.get("action_family") == "candidate_conflict_review"
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
            "candidate_count": row.get("candidate_count"),
            "flags": row.get("flags") or [],
            "same_contract_count": stage_count(detail, "same_contract"),
            "same_product_count": stage_count(detail, "same_contract_product"),
            "same_store_count": stage_count(detail, "same_contract_product_store"),
            "same_quantity_count": stage_count(detail, "same_contract_product_store_quantity"),
            "strict_count": stage_count(detail, "strict"),
            "candidate_sources": detail.get("candidate_sources") or [],
            "rationale": rationale,
            "safe_next_step": safe_next_step,
            "forbidden_actions": row.get("forbidden_actions") or [],
        })

    return {
        "status": "operational_candidate_conflict_blockers_classified",
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
        "quantity", "unit", "price", "candidate_count", "same_contract_count",
        "same_product_count", "same_store_count", "same_quantity_count",
        "strict_count", "flags", "rationale", "safe_next_step",
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
    lines = [
        "# WPS 操作性候选冲突来源缺口阻断原因",
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
        "| 阻断类型 | 类型 | 合同 | 商品 | 门店 | 数量 | 价格 | 同商品 | 同门店 | 同数量 | 下一步 |",
        "|---|---|---|---|---|---:|---:|---:|---:|---:|---|",
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
                md_cell(row["same_product_count"]),
                md_cell(row["same_store_count"]),
                md_cell(row["same_quantity_count"]),
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
