#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_candidate_source_mapping_review.json + SQLite dev DB
Output: parsed/wps_candidate_source_ownership_review.{json,csv,md}
Pos: WPS 候选来源占用复核；检查候选来源已挂接 DB 行的引用状态和是否可能是聚合行占用；只读，不写库

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import csv
import json
import sqlite3
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "backend/prisma/dev.db"
PARSED_DIR = ROOT / "tmp/wps_11_export_list_raw/parsed"
IN_JSON = PARSED_DIR / "wps_candidate_source_mapping_review.json"
OUT_JSON = PARSED_DIR / "wps_candidate_source_ownership_review.json"
OUT_CSV = PARSED_DIR / "wps_candidate_source_ownership_review.csv"
OUT_MD = PARSED_DIR / "wps_candidate_source_ownership_review.md"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def norm(value: Any) -> str:
    return str(value or "").strip()


def norm_product(value: Any) -> str:
    return norm(value).replace(" ", "")


def number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def same_number(left: Any, right: Any) -> bool:
    left_number = number(left)
    right_number = number(right)
    if left_number is None and right_number is None:
        return True
    if left_number is None or right_number is None:
        return False
    return abs(left_number - right_number) < 1e-6


def store_covers(attached_store: Any, target_store: Any) -> bool:
    attached = norm(attached_store)
    target = norm(target_store)
    return bool(attached and target and attached != target and target in attached)


def sales_inventory_refs(conn: sqlite3.Connection, row_id: str) -> int:
    return int(conn.execute("SELECT COUNT(*) FROM inventories WHERE salesItemId = ?", (row_id,)).fetchone()[0])


def packing_customs_refs(conn: sqlite3.Connection, row_id: str) -> int:
    return int(conn.execute("SELECT COUNT(*) FROM customs_declaration_items WHERE packingItemId = ?", (row_id,)).fetchone()[0])


def ref_count(conn: sqlite3.Connection, table_name: str, row_id: str) -> int:
    if table_name == "sales_item":
        return sales_inventory_refs(conn, row_id)
    if table_name == "packing_item":
        return packing_customs_refs(conn, row_id)
    return 0


def target_ref_count(conn: sqlite3.Connection, detail: dict[str, Any]) -> int:
    if detail["type"] == "sales_item_missing_source":
        return sales_inventory_refs(conn, detail["id"])
    if detail["type"] == "packing_item_missing_source":
        return packing_customs_refs(conn, detail["id"])
    return 0


def target_table(detail: dict[str, Any]) -> str:
    if detail["type"] == "sales_item_missing_source":
        return "sales_item"
    if detail["type"] == "packing_item_missing_source":
        return "packing_item"
    return ""


def row_similarity(target: dict[str, Any], attached: dict[str, Any]) -> dict[str, Any]:
    product_match = norm_product(target.get("product")) == norm_product(attached.get("product"))
    quantity_match = same_number(target.get("quantity"), attached.get("quantity"))
    price_match = same_number(target.get("price"), attached.get("price"))
    specification_match = True
    if norm(target.get("specification")) and norm(attached.get("specification")):
        specification_match = norm(target.get("specification")) == norm(attached.get("specification"))
    store_exact = norm(target.get("store")) == norm(attached.get("store"))
    store_aggregate = store_covers(attached.get("store"), target.get("store"))
    return {
        "product_match": product_match,
        "quantity_match": quantity_match,
        "price_match": price_match,
        "specification_match": specification_match,
        "store_exact": store_exact,
        "store_aggregate_covers_target": store_aggregate,
        "business_fields_match": product_match and quantity_match and price_match and specification_match,
    }


def verdict_for(detail: dict[str, Any], attachments: list[dict[str, Any]], target_refs: int) -> tuple[str, str]:
    if detail.get("candidate_count", 0) > 1:
        return ("multi_candidate_still_requires_review", "同一 DB 行仍有多个候选来源；不能先讨论转移。")
    if not attachments:
        return ("no_attached_owner", "候选来源未发现占用行；应回到字段差异和原严格匹配规则复核。")
    same_table = [row for row in attachments if row["table_name"] == target_table(detail)]
    if not same_table:
        return ("owned_by_other_interface_review", "候选来源挂在另一类明细行上，不能跨销售/装箱 Interface 直接转移。")
    if any(row["ref_count"] > 0 for row in same_table):
        return ("owner_has_downstream_refs_keep_review", "占用行已有库存或报关引用；不能自动移动来源 note。")
    aggregate_rows = [
        row for row in same_table
        if row["similarity"]["business_fields_match"] and row["similarity"]["store_aggregate_covers_target"]
    ]
    if aggregate_rows and target_refs == 0:
        return ("aggregate_owner_no_refs_transfer_candidate", "来源挂在无下游引用的聚合门店行上，目标行也无引用；可作为后续人工拆分/转移候选，但本轮不写库。")
    matching_rows = [
        row for row in same_table
        if row["similarity"]["business_fields_match"] and row["similarity"]["store_exact"]
    ]
    if matching_rows:
        return ("duplicate_exact_owner_no_refs_review", "来源挂在无引用的同字段行上；需人工判断当前缺口行和占用行谁应保留。")
    return ("owner_conflicts_or_partial_match_review", "占用行与目标行存在门店、价格、数量、规格或商品差异；不能自动移动来源 note。")


def build_report() -> dict[str, Any]:
    source_report = load_json(IN_JSON)
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)

    details: list[dict[str, Any]] = []
    verdict_counts: Counter[str] = Counter()
    type_counts: Counter[str] = Counter()
    transfer_candidate_count = 0
    ref_blocked_count = 0

    for detail in source_report["details"]:
        target = detail.get("db_row") or {}
        target_refs = target_ref_count(conn, detail)
        attachments: list[dict[str, Any]] = []
        for source in detail.get("candidate_sources") or []:
            for attached in source.get("attached_elsewhere") or []:
                enriched = dict(attached)
                enriched["source"] = source.get("source")
                enriched["ref_count"] = ref_count(conn, attached.get("table_name", ""), attached.get("id", ""))
                enriched["similarity"] = row_similarity(target, attached)
                attachments.append(enriched)

        verdict, rationale = verdict_for(detail, attachments, target_refs)
        verdict_counts[verdict] += 1
        type_counts[detail["type"]] += 1
        if verdict == "aggregate_owner_no_refs_transfer_candidate":
            transfer_candidate_count += 1
        if verdict == "owner_has_downstream_refs_keep_review":
            ref_blocked_count += 1

        details.append({
            "id": detail.get("id"),
            "type": detail.get("type"),
            "contract_no": detail.get("contract_no"),
            "product": detail.get("product"),
            "store": detail.get("store"),
            "quantity": detail.get("quantity"),
            "price": detail.get("price"),
            "candidate_count": detail.get("candidate_count"),
            "target_ref_count": target_refs,
            "owner_count": len(attachments),
            "owners_with_refs": sum(1 for row in attachments if row["ref_count"] > 0),
            "verdict": verdict,
            "verdict_rationale": rationale,
            "owners": attachments,
        })

    conn.close()
    return {
        "status": "candidate_source_ownership_reviewed",
        "mode": "read_only_no_db_writes",
        "total": len(details),
        "auto_writable": 0,
        "transfer_candidate_count": transfer_candidate_count,
        "ref_blocked_count": ref_blocked_count,
        "by_type": [{"type": key, "count": value} for key, value in type_counts.most_common()],
        "by_verdict": [{"verdict": key, "count": value} for key, value in verdict_counts.most_common()],
        "details": details,
    }


def write_csv(report: dict[str, Any]) -> None:
    fields = [
        "verdict", "type", "contract_no", "product", "store", "quantity", "price",
        "candidate_count", "target_ref_count", "owner_count", "owners_with_refs",
        "owner_summary", "verdict_rationale",
    ]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in report["details"]:
            owner_summary = "; ".join(
                f"{owner['table_name']}:{owner['contract_no']}:{owner['product']}:{owner.get('store') or '-'}:"
                f"qty={owner.get('quantity')}:price={owner.get('price')}:refs={owner['ref_count']}"
                for owner in row["owners"][:5]
            )
            writer.writerow({
                "verdict": row["verdict"],
                "type": row["type"],
                "contract_no": row["contract_no"],
                "product": row["product"],
                "store": row["store"],
                "quantity": row["quantity"],
                "price": row["price"],
                "candidate_count": row["candidate_count"],
                "target_ref_count": row["target_ref_count"],
                "owner_count": row["owner_count"],
                "owners_with_refs": row["owners_with_refs"],
                "owner_summary": owner_summary,
                "verdict_rationale": row["verdict_rationale"],
            })


def md_cell(value: Any) -> str:
    text = str(value if value is not None else "")
    return text.replace("|", "/").replace("\n", " ")[:180] or "-"


def render_md(report: dict[str, Any]) -> str:
    lines = [
        "# WPS 候选来源占用复核",
        "",
        f"状态：`{report['status']}`",
        f"模式：`{report['mode']}`",
        f"复核行：`{report['total']}`",
        f"自动可写：`{report['auto_writable']}`",
        f"聚合占用转移候选：`{report['transfer_candidate_count']}`",
        f"引用阻断：`{report['ref_blocked_count']}`",
        "",
        "## 口径",
        "- 本报告只读，不移动 note、不删除行、不写数据库。",
        "- `aggregate_owner_no_refs_transfer_candidate` 只表示后续可做人工拆分/转移复核，不是本轮 apply 授权。",
        "- 只要占用行已有库存或报关引用，就不能自动移动来源 note。",
        "",
        "## Verdict",
        "| Verdict | 数量 |",
        "|---|---:|",
    ]
    for row in report["by_verdict"]:
        lines.append(f"| `{row['verdict']}` | {row['count']} |")

    lines.extend([
        "",
        "## 明细",
        "| Verdict | 类型 | 合同 | 商品 | 门店 | 数量 | 目标引用 | 占用行 | 占用行引用 | 说明 |",
        "|---|---|---|---|---|---:|---:|---:|---:|---|",
    ])
    for row in report["details"]:
        lines.append(
            "| "
            + " | ".join([
                md_cell(row["verdict"]),
                md_cell(row["type"]),
                md_cell(row["contract_no"]),
                md_cell(row["product"]),
                md_cell(row["store"]),
                md_cell(row["quantity"]),
                md_cell(row["target_ref_count"]),
                md_cell(row["owner_count"]),
                md_cell(row["owners_with_refs"]),
                md_cell(row["verdict_rationale"]),
            ])
            + " |"
        )
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    report = build_report()
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(report)
    OUT_MD.write_text(render_md(report) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "total": report["total"],
        "auto_writable": report["auto_writable"],
        "transfer_candidate_count": report["transfer_candidate_count"],
        "ref_blocked_count": report["ref_blocked_count"],
        "by_verdict": report["by_verdict"],
        "out": {"json": str(OUT_JSON), "csv": str(OUT_CSV), "md": str(OUT_MD)},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
