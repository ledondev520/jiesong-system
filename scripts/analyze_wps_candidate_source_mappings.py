#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_source_gap_disposition.json + preferred WPS source CSVs + SQLite dev DB
Output: parsed/wps_candidate_source_mapping_review.{json,csv,md}
Pos: WPS 来源缺口候选映射深度复核；并排比较 DB 行、候选源行、候选源是否已挂到其他 note；只读，不写库

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import csv
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "backend/prisma/dev.db"
PARSED_DIR = ROOT / "tmp/wps_11_export_list_raw/parsed"
DISPOSITION_JSON = PARSED_DIR / "wps_source_gap_disposition.json"
PREFERRED_SALES_CSV = PARSED_DIR / "preferred_sales_items.csv"
PREFERRED_PACKING_CSV = PARSED_DIR / "preferred_packing_items.csv"
OUT_JSON = PARSED_DIR / "wps_candidate_source_mapping_review.json"
OUT_CSV = PARSED_DIR / "wps_candidate_source_mapping_review.csv"
OUT_MD = PARSED_DIR / "wps_candidate_source_mapping_review.md"


SOURCE_RE = re.compile(r"^(?P<file>.+)#(?P<sheet>.+):(?P<row>\d+)$")
SOURCE_NOTE_RE = re.compile(r"\[WPS_[^\]]*\]\s+([^[]+?#[^[]+?:\d+)")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def norm_text(value: Any) -> str:
    return str(value or "").strip()


def norm_sheet(value: Any) -> str:
    return re.sub(r"\s+", "", norm_text(value))


def norm_product(value: Any) -> str:
    return norm_text(value).replace(" ", "")


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


def parse_source(source: str) -> tuple[str, str, str] | None:
    match = SOURCE_RE.match(source)
    if not match:
        return None
    return (match.group("file"), norm_sheet(match.group("sheet")), match.group("row"))


def source_key(row: dict[str, Any]) -> tuple[str, str, str]:
    return (norm_text(row.get("source_file")), norm_sheet(row.get("sheet")), norm_text(row.get("row")))


def load_source_csv(path: Path) -> dict[tuple[str, str, str], dict[str, Any]]:
    out: dict[tuple[str, str, str], dict[str, Any]] = {}
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            out[source_key(row)] = row
    return out


def read_db_row(conn: sqlite3.Connection, row: dict[str, Any]) -> dict[str, Any] | None:
    if row["type"] == "sales_item_missing_source":
        query = """
            SELECT si.id, sc.contractNo AS contract_no, p.customsName AS product,
                   s.name AS store, si.quantity, si.unit, si.sellingPrice AS price,
                   si.specification, si.note
            FROM sales_items si
            JOIN sales_contracts sc ON sc.id = si.salesContractId
            JOIN products p ON p.id = si.productId
            JOIN stores s ON s.id = si.storeId
            WHERE si.id = ?
        """
    elif row["type"] == "packing_item_missing_source":
        query = """
            SELECT pi.id, sc.contractNo AS contract_no, p.customsName AS product,
                   s.name AS store, pi.quantity, pi.unit, pi.unitPrice AS price,
                   pi.specification, pi.boxes, pi.grossWeight, pi.netWeight, pi.volume,
                   pi.manufacturer, pi.purchaseContractNo, pi.invoiceNo, pi.note
            FROM packing_items pi
            JOIN sales_contracts sc ON sc.id = pi.salesContractId
            JOIN products p ON p.id = pi.productId
            LEFT JOIN stores s ON s.id = pi.storeId
            WHERE pi.id = ?
        """
    else:
        return None
    db_row = conn.execute(query, (row["id"],)).fetchone()
    return dict(db_row) if db_row else None


def notes_for_source(conn: sqlite3.Connection, source: str) -> list[dict[str, Any]]:
    like = f"%{source}%"
    sales = conn.execute(
        """
        SELECT 'sales_item' AS table_name, si.id, sc.contractNo AS contract_no,
               p.customsName AS product, s.name AS store, si.quantity,
               si.sellingPrice AS price, si.specification
        FROM sales_items si
        JOIN sales_contracts sc ON sc.id = si.salesContractId
        JOIN products p ON p.id = si.productId
        JOIN stores s ON s.id = si.storeId
        WHERE si.note LIKE ?
        """,
        (like,),
    ).fetchall()
    packing = conn.execute(
        """
        SELECT 'packing_item' AS table_name, pi.id, sc.contractNo AS contract_no,
               p.customsName AS product, s.name AS store, pi.quantity,
               pi.unitPrice AS price, pi.specification
        FROM packing_items pi
        JOIN sales_contracts sc ON sc.id = pi.salesContractId
        JOIN products p ON p.id = pi.productId
        LEFT JOIN stores s ON s.id = pi.storeId
        WHERE pi.note LIKE ?
        """,
        (like,),
    ).fetchall()
    return [dict(row) for row in sales + packing]


def compare_sales(db_row: dict[str, Any], source_row: dict[str, Any]) -> list[str]:
    mismatches = []
    if norm_product(db_row.get("product")) != norm_product(source_row.get("product_name")):
        mismatches.append("product")
    if not same_number(db_row.get("quantity"), source_row.get("quantity")):
        mismatches.append("quantity")
    if not same_number(db_row.get("price"), source_row.get("unit_price")):
        mismatches.append("price")
    source_spec = norm_text(source_row.get("specification"))
    db_spec = norm_text(db_row.get("specification"))
    if source_spec and db_spec and source_spec != db_spec:
        mismatches.append("specification")
    if not source_spec and db_spec:
        mismatches.append("source_spec_missing")
    return mismatches


def compare_packing(db_row: dict[str, Any], source_row: dict[str, Any]) -> list[str]:
    mismatches = []
    if norm_product(db_row.get("product")) != norm_product(source_row.get("product_name")):
        mismatches.append("product")
    source_store = norm_text(source_row.get("store"))
    db_store = norm_text(db_row.get("store"))
    if source_store and db_store and source_store != db_store:
        mismatches.append("store")
    if not source_store and db_store:
        mismatches.append("source_store_missing")
    if not same_number(db_row.get("quantity"), source_row.get("quantity")):
        mismatches.append("quantity")
    if not same_number(db_row.get("boxes"), source_row.get("boxes")):
        mismatches.append("boxes")
    if not same_number(db_row.get("grossWeight"), source_row.get("gross_weight")):
        mismatches.append("gross_weight")
    if not same_number(db_row.get("netWeight"), source_row.get("net_weight")):
        mismatches.append("net_weight")
    if not same_number(db_row.get("volume"), source_row.get("volume")):
        mismatches.append("volume")
    source_spec = norm_text(source_row.get("specification"))
    db_spec = norm_text(db_row.get("specification"))
    if source_spec and db_spec and source_spec != db_spec:
        mismatches.append("specification")
    if not source_spec and db_spec:
        mismatches.append("source_spec_missing")
    return mismatches


def verdict_for(row: dict[str, Any], candidate_count: int, attached: list[dict[str, Any]], mismatches: list[str]) -> tuple[str, str]:
    if candidate_count > 1:
        return ("multi_candidate_manual_review", "同一 DB 行有多个候选来源，不能自动选择。")
    if attached:
        return ("candidate_already_attached_elsewhere", "候选来源已经出现在其他 DB 行 note 中，不能复用到当前缺口。")
    if not mismatches:
        return ("single_candidate_needs_human_confirmation", "单候选源字段未发现明显冲突，但原导入严格匹配未命中；写库前仍需人工复核生成规则。")
    if any(item in mismatches for item in ("product", "quantity")):
        return ("hard_field_mismatch", "商品或数量不一致，不能自动挂来源。")
    return ("soft_field_mismatch", "数量/商品以外字段不完整或不一致，需要复核后才能挂来源。")


def build_report() -> dict[str, Any]:
    disposition_report = load_json(DISPOSITION_JSON)
    candidates = [
        row for row in disposition_report["details"]
        if row.get("disposition") == "candidate_mapping_review"
    ]
    sales_sources = load_source_csv(PREFERRED_SALES_CSV)
    packing_sources = load_source_csv(PREFERRED_PACKING_CSV)

    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row

    details = []
    verdict_counts = Counter()
    mismatch_counts = Counter()
    type_counts = Counter()
    attached_count = 0
    missing_source_rows = 0

    for row in candidates:
        db_row = read_db_row(conn, row) or {}
        source_rows = []
        all_mismatches = set()
        attached_matches: list[dict[str, Any]] = []

        for source in row.get("candidate_sources") or []:
            parsed = parse_source(source)
            source_row = None
            if parsed:
                source_row = (sales_sources if row["type"].startswith("sales_") else packing_sources).get(parsed)
            if not source_row:
                missing_source_rows += 1
                source_rows.append({
                    "source": source,
                    "source_found": False,
                    "mismatches": ["source_row_not_found"],
                    "attached_elsewhere": [],
                })
                all_mismatches.add("source_row_not_found")
                continue
            mismatches = compare_sales(db_row, source_row) if row["type"].startswith("sales_") else compare_packing(db_row, source_row)
            attached = [
                item for item in notes_for_source(conn, source)
                if item.get("id") != row.get("id")
            ]
            if attached:
                attached_count += 1
            attached_matches.extend(attached)
            all_mismatches.update(mismatches)
            source_rows.append({
                "source": source,
                "source_found": True,
                "source_product": source_row.get("product_name"),
                "source_store": source_row.get("store"),
                "source_quantity": source_row.get("quantity"),
                "source_unit_price": source_row.get("unit_price"),
                "source_specification": source_row.get("specification"),
                "mismatches": mismatches,
                "attached_elsewhere": attached,
            })

        verdict, rationale = verdict_for(row, len(row.get("candidate_sources") or []), attached_matches, sorted(all_mismatches))
        verdict_counts[verdict] += 1
        type_counts[row["type"]] += 1
        mismatch_counts.update(all_mismatches or ["none"])

        details.append({
            "id": row.get("id"),
            "type": row.get("type"),
            "contract_no": row.get("contract_no"),
            "product": row.get("product"),
            "store": row.get("store"),
            "quantity": row.get("quantity"),
            "unit": row.get("unit"),
            "price": row.get("price"),
            "specification": row.get("specification"),
            "candidate_count": len(row.get("candidate_sources") or []),
            "verdict": verdict,
            "verdict_rationale": rationale,
            "mismatches": sorted(all_mismatches) if all_mismatches else [],
            "candidate_sources": source_rows,
            "db_row": db_row,
        })

    conn.close()
    return {
        "status": "candidate_source_mapping_reviewed",
        "total": len(details),
        "auto_writable": 0,
        "candidate_sources_attached_elsewhere": attached_count,
        "source_rows_not_found": missing_source_rows,
        "by_type": dict(type_counts),
        "by_verdict": [{"verdict": key, "count": count} for key, count in verdict_counts.most_common()],
        "by_mismatch": [{"mismatch": key, "count": count} for key, count in mismatch_counts.most_common()],
        "details": details,
    }


def write_csv(report: dict[str, Any]) -> None:
    fields = [
        "verdict", "type", "contract_no", "product", "store", "quantity", "price",
        "candidate_count", "mismatches", "candidate_sources", "attached_elsewhere_count",
        "verdict_rationale",
    ]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in report["details"]:
            attached_count = sum(len(src.get("attached_elsewhere") or []) for src in row["candidate_sources"])
            writer.writerow({
                "verdict": row["verdict"],
                "type": row["type"],
                "contract_no": row["contract_no"],
                "product": row["product"],
                "store": row["store"],
                "quantity": row["quantity"],
                "price": row["price"],
                "candidate_count": row["candidate_count"],
                "mismatches": "; ".join(row["mismatches"]) or "none",
                "candidate_sources": "; ".join(src["source"] for src in row["candidate_sources"]),
                "attached_elsewhere_count": attached_count,
                "verdict_rationale": row["verdict_rationale"],
            })


def md_cell(value: Any) -> str:
    text = str(value if value is not None else "")
    return text.replace("|", "/").replace("\n", " ")[:160] or "-"


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# WPS 候选来源映射深度复核",
        "",
        f"状态：`{report['status']}`",
        f"候选映射缺口：`{report['total']}`",
        f"自动可写来源 note：`{report['auto_writable']}`",
        "",
        "## 处理口径",
        "- 本报告只读，不写数据库、不改 note。",
        "- `candidate_already_attached_elsewhere` 表示候选 WPS 来源已挂在其他 DB 行 note 中，不能复用关闭当前缺口。",
        "- `single_candidate_needs_human_confirmation` 不代表可自动写库，只表示本脚本未发现明显字段冲突，仍需人工复核原导入规则。",
        "",
        "## Verdict",
        "| Verdict | 数量 |",
        "|---|---:|",
    ]
    for row in report["by_verdict"]:
        lines.append(f"| `{row['verdict']}` | {row['count']} |")
    lines.extend(["", "## 字段差异", "| 差异 | 数量 |", "|---|---:|"])
    for row in report["by_mismatch"]:
        lines.append(f"| `{row['mismatch']}` | {row['count']} |")

    lines.extend([
        "",
        "## 明细",
        "| Verdict | 类型 | 合同 | 商品 | 门店 | 数量 | 候选数 | 差异 | 说明 |",
        "|---|---|---|---|---|---:|---:|---|---|",
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
                md_cell(row["candidate_count"]),
                md_cell("; ".join(row["mismatches"]) or "none"),
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
    OUT_MD.write_text(render_markdown(report), encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "total": report["total"],
        "auto_writable": report["auto_writable"],
        "by_verdict": report["by_verdict"],
        "by_mismatch": report["by_mismatch"],
        "out": {
            "json": str(OUT_JSON),
            "csv": str(OUT_CSV),
            "md": str(OUT_MD),
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
