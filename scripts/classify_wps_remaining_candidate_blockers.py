#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_candidate_source_mapping_review.json
Output: parsed/wps_remaining_candidate_blockers.{json,csv,md}
Pos: WPS 剩余候选映射复核阻断原因分类；只读，不写库

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
IN_JSON = PARSED_DIR / "wps_candidate_source_mapping_review.json"
OUT_JSON = PARSED_DIR / "wps_remaining_candidate_blockers.json"
OUT_CSV = PARSED_DIR / "wps_remaining_candidate_blockers.csv"
OUT_MD = PARSED_DIR / "wps_remaining_candidate_blockers.md"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def same_number(left: Any, right: Any, tolerance: float = 1e-6) -> bool:
    left_number = number(left)
    right_number = number(right)
    if left_number is None and right_number is None:
        return True
    if left_number is None or right_number is None:
        return False
    return abs(left_number - right_number) <= tolerance


def source_qty(row: dict[str, Any]) -> float:
    return number(row.get("source_quantity")) or 0.0


def source_price(row: dict[str, Any]) -> float | None:
    return number(row.get("source_unit_price"))


def attached_count(row: dict[str, Any], table_name: str | None = None) -> int:
    count = 0
    for source in row.get("candidate_sources") or []:
        for owner in source.get("attached_elsewhere") or []:
            if table_name is None or owner.get("table_name") == table_name:
                count += 1
    return count


def classify(row: dict[str, Any]) -> tuple[str, str, str]:
    sources = row.get("candidate_sources") or []
    mismatches = set()
    for source in sources:
        mismatches.update(source.get("mismatches") or [])

    quantity = number(row.get("quantity"))
    source_sum = sum(source_qty(source) for source in sources)
    prices = [source_price(source) for source in sources if source_price(source) is not None]
    distinct_prices = sorted({round(price, 6) for price in prices})
    target_price = number(row.get("price"))
    same_interface_owner_count = attached_count(
        row,
        "sales_item" if row.get("type") == "sales_item_missing_source" else "packing_item",
    )

    if row.get("candidate_count", 0) > 1 and quantity is not None and same_number(source_sum, quantity):
        if target_price is not None and len(distinct_prices) > 1:
            return (
                "multi_candidate_quantity_sum_price_conflict",
                "多个候选来源数量加总等于目标行，但候选单价不一致，不能把一个价格事实硬套到目标行。",
                "需要业务确认保留聚合行、删除聚合行或按源价格拆分；没有裁决前不写库。",
            )
        return (
            "multi_candidate_quantity_sum_manual_split",
            "多个候选来源数量加总等于目标行，但仍需确认目标行是否应作为聚合历史行保留。",
            "需要确认是否删除聚合行或保留为汇总行；没有裁决前不写库。",
        )

    if "price" in mismatches:
        return (
            "price_conflict",
            "候选来源与目标行价格不一致，不能自动移动来源 note 或删除其中一方。",
            "需要更强销售合同/发票页证据或业务裁决价格口径。",
        )
    if "quantity" in mismatches:
        return (
            "quantity_conflict",
            "候选来源与目标行数量不一致，不能自动移动来源 note 或删除其中一方。",
            "需要能证明拆分/聚合数量关系的文件证据。",
        )
    if "store" in mismatches:
        return (
            "store_conflict",
            "候选来源与目标行门店不一致，不能自动移动来源 note。",
            "需要销售合同页、装箱页或业务裁决确认门店归属。",
        )
    if "product" in mismatches:
        return (
            "product_conflict",
            "候选来源与目标行商品不一致，不能自动挂来源。",
            "需要商品别名规则或正式文件证明同一商品。",
        )
    if same_interface_owner_count == 0:
        return (
            "cross_interface_or_missing_owner",
            "候选来源未挂在同类明细行上，不能跨销售/装箱 Interface 直接移动来源。",
            "需要独立同类来源证据或扩展导入规则。",
        )
    return (
        "manual_review_required",
        "当前规则无法证明唯一安全写库动作。",
        "保留到人工复核或补更强来源后再处理。",
    )


def build_report() -> dict[str, Any]:
    source_report = load_json(IN_JSON)
    details = []
    counts: Counter[str] = Counter()
    type_counts: Counter[str] = Counter()

    for row in source_report.get("details") or []:
        blocker, rationale, next_step = classify(row)
        counts[blocker] += 1
        type_counts[row.get("type", "")] += 1
        details.append({
            "blocker": blocker,
            "type": row.get("type"),
            "id": row.get("id"),
            "contract_no": row.get("contract_no"),
            "product": row.get("product"),
            "store": row.get("store"),
            "quantity": row.get("quantity"),
            "price": row.get("price"),
            "candidate_count": row.get("candidate_count"),
            "source_quantity_sum": sum(source_qty(source) for source in row.get("candidate_sources") or []),
            "same_interface_owner_count": attached_count(
                row,
                "sales_item" if row.get("type") == "sales_item_missing_source" else "packing_item",
            ),
            "rationale": rationale,
            "safe_next_step": next_step,
            "candidate_sources": row.get("candidate_sources") or [],
        })

    return {
        "status": "remaining_candidate_blockers_classified",
        "mode": "read_only_no_db_writes",
        "total": len(details),
        "auto_writable": 0,
        "by_blocker": [{"blocker": key, "count": value} for key, value in counts.most_common()],
        "by_type": [{"type": key, "count": value} for key, value in type_counts.most_common()],
        "details": details,
    }


def write_csv(report: dict[str, Any]) -> None:
    fields = [
        "blocker", "type", "contract_no", "product", "store", "quantity", "price",
        "candidate_count", "source_quantity_sum", "same_interface_owner_count",
        "rationale", "safe_next_step",
    ]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in report["details"]:
            writer.writerow({field: row.get(field, "") for field in fields})


def md_cell(value: Any) -> str:
    return str(value if value is not None else "").replace("|", "/").replace("\n", " ")[:180] or "-"


def render_md(report: dict[str, Any]) -> str:
    lines = [
        "# WPS 剩余候选映射阻断原因",
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
        "| 阻断类型 | 类型 | 合同 | 商品 | 门店 | 数量 | 价格 | 候选 | 源数量合计 | 下一步 |",
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
                md_cell(row["candidate_count"]),
                md_cell(row["source_quantity_sum"]),
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
