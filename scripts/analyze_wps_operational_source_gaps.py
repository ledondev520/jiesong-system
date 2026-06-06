#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_source_gap_disposition.json + SQLite dev DB
Output: parsed/wps_operational_source_gap_review.{json,csv,md}
Pos: WPS 零值/操作性历史来源缺口复核；检查库存/报关引用、候选来源数量和占位合同；只读，不写库

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
DISPOSITION_JSON = PARSED_DIR / "wps_source_gap_disposition.json"
OUT_JSON = PARSED_DIR / "wps_operational_source_gap_review.json"
OUT_CSV = PARSED_DIR / "wps_operational_source_gap_review.csv"
OUT_MD = PARSED_DIR / "wps_operational_source_gap_review.md"


def load_json(path: Path) -> Any:
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


def read_sales_refs(conn: sqlite3.Connection, row_id: str) -> dict[str, int]:
    inventory_count = conn.execute(
        "SELECT COUNT(*) FROM inventories WHERE salesItemId = ?",
        (row_id,),
    ).fetchone()[0]
    return {"inventory_refs": inventory_count, "customs_refs": 0}


def read_packing_refs(conn: sqlite3.Connection, row_id: str) -> dict[str, int]:
    customs_count = conn.execute(
        "SELECT COUNT(*) FROM customs_declaration_items WHERE packingItemId = ?",
        (row_id,),
    ).fetchone()[0]
    return {"inventory_refs": 0, "customs_refs": customs_count}


def db_note(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    table = "sales_items" if row["type"].startswith("sales_") else "packing_items"
    got = conn.execute(f"SELECT note FROM {table} WHERE id = ?", (row["id"],)).fetchone()
    return got[0] or "" if got else ""


def marker_flags(row: dict[str, Any], note: str) -> list[str]:
    flags = []
    if is_zero(row.get("quantity")):
        flags.append("zero_quantity")
    if row["type"].startswith("sales_") and is_zero(row.get("price")):
        flags.append("zero_price")
    if (row.get("contract_no") or "").startswith("PENDING-"):
        flags.append("pending_contract")
    text = f"{row.get('note_excerpt') or ''} {note}"
    for marker, flag in [
        ("非捷淞", "non_jiesong"),
        ("拼船", "shared_shipment"),
        ("自行报关", "self_customs"),
        ("占位", "placeholder"),
        ("not_formal", "not_formal_customs"),
    ]:
        if marker in text:
            flags.append(flag)
    if row.get("candidate_sources"):
        flags.append("has_candidate_sources")
    return flags


def verdict_for(row: dict[str, Any], refs: dict[str, int], flags: list[str]) -> tuple[str, str]:
    if refs["inventory_refs"] or refs["customs_refs"]:
        return (
            "referenced_operational_record",
            "该历史行已有库存或报关引用，不能作为清理候选；只能补更强来源或保留缺口。",
        )
    if "pending_contract" in flags:
        return (
            "pending_placeholder_review",
            "该历史行属于 PENDING 占位合同，无引用时也不能自动删除；需要确认占位合同口径。",
        )
    if "has_candidate_sources" in flags:
        return (
            "candidate_conflict_review",
            "该历史行虽是零值/操作性队列，但仍存在候选来源；候选未严格匹配，需人工复核。",
        )
    if "zero_quantity" in flags and "zero_price" in flags:
        return (
            "zero_quantity_price_no_ref_review",
            "零数量且零售价、无引用；可作为人工清理或保留为历史占位的候选，但本脚本不自动删除。",
        )
    if "zero_price" in flags:
        return (
            "zero_price_no_ref_review",
            "非零数量但销售价为 0 且无引用；可能是成本/报关/历史操作行，需业务确认。",
        )
    if any(flag in flags for flag in ("non_jiesong", "shared_shipment", "self_customs", "placeholder", "not_formal_customs")):
        return (
            "operational_marker_no_ref_review",
            "带非捷淞/拼船/自行报关/占位等操作标记且无引用；需按运营口径确认是否保留。",
        )
    return (
        "operational_no_ref_review",
        "被上层分入操作性队列但缺少更具体标记；需补来源或确认保留为无来源历史行。",
    )


def build_report() -> dict[str, Any]:
    disposition = load_json(DISPOSITION_JSON)
    rows = [
        row for row in disposition["details"]
        if row.get("disposition") == "zero_or_operational_review"
    ]
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    details = []
    verdict_counts = Counter()
    type_counts = Counter()
    flag_counts = Counter()
    ref_counts = Counter()

    for row in rows:
        refs = read_sales_refs(conn, row["id"]) if row["type"].startswith("sales_") else read_packing_refs(conn, row["id"])
        note = db_note(conn, row)
        flags = marker_flags(row, note)
        verdict, rationale = verdict_for(row, refs, flags)
        verdict_counts[verdict] += 1
        type_counts[row["type"]] += 1
        flag_counts.update(flags or ["no_marker"])
        if refs["inventory_refs"]:
            ref_counts["inventory_refs"] += 1
        if refs["customs_refs"]:
            ref_counts["customs_refs"] += 1
        details.append({
            "id": row["id"],
            "type": row["type"],
            "contract_no": row.get("contract_no"),
            "product": row.get("product"),
            "store": row.get("store"),
            "quantity": row.get("quantity"),
            "price": row.get("price"),
            "candidate_count": len(row.get("candidate_sources") or []),
            "flags": flags,
            "inventory_refs": refs["inventory_refs"],
            "customs_refs": refs["customs_refs"],
            "verdict": verdict,
            "verdict_rationale": rationale,
            "candidate_sources": row.get("candidate_sources") or [],
            "note_excerpt": (note or row.get("note_excerpt") or "")[:500],
        })

    conn.close()
    return {
        "status": "operational_source_gap_reviewed",
        "total": len(details),
        "auto_writable": 0,
        "by_type": dict(type_counts),
        "by_verdict": [{"verdict": key, "count": value} for key, value in verdict_counts.most_common()],
        "by_flag": [{"flag": key, "count": value} for key, value in flag_counts.most_common()],
        "referenced_counts": dict(ref_counts),
        "details": details,
    }


def write_csv(report: dict[str, Any]) -> None:
    fields = [
        "verdict", "type", "contract_no", "product", "store", "quantity", "price",
        "candidate_count", "inventory_refs", "customs_refs", "flags", "verdict_rationale",
    ]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in report["details"]:
            writer.writerow({
                **{key: row.get(key, "") for key in fields},
                "flags": "; ".join(row["flags"]) or "no_marker",
            })


def md_cell(value: Any) -> str:
    text = str(value if value is not None else "")
    return text.replace("|", "/").replace("\n", " ")[:160] or "-"


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# WPS 零值/操作性来源缺口复核",
        "",
        f"状态：`{report['status']}`",
        f"复核总数：`{report['total']}`",
        f"自动可写来源 note：`{report['auto_writable']}`",
        "",
        "## 处理口径",
        "- 本报告只读，不写数据库、不删除记录、不改 note。",
        "- 无库存/报关引用只表示可以进入人工清理候选，不代表本脚本确认删除。",
        "- 有库存或报关引用的历史行不能作为清理候选，只能补来源或继续保留缺口。",
        "",
        "## Verdict",
        "| Verdict | 数量 |",
        "|---|---:|",
    ]
    for row in report["by_verdict"]:
        lines.append(f"| `{row['verdict']}` | {row['count']} |")
    lines.extend(["", "## 标记", "| 标记 | 数量 |", "|---|---:|"])
    for row in report["by_flag"]:
        lines.append(f"| `{row['flag']}` | {row['count']} |")
    lines.extend([
        "",
        "## 明细",
        "| Verdict | 类型 | 合同 | 商品 | 门店 | 数量 | 价格 | 引用 | 候选 | 说明 |",
        "|---|---|---|---|---|---:|---:|---|---:|---|",
    ])
    for row in report["details"]:
        refs = f"inventory={row['inventory_refs']}; customs={row['customs_refs']}"
        lines.append(
            "| "
            + " | ".join([
                md_cell(row["verdict"]),
                md_cell(row["type"]),
                md_cell(row["contract_no"]),
                md_cell(row["product"]),
                md_cell(row["store"]),
                md_cell(row["quantity"]),
                md_cell(row["price"]),
                md_cell(refs),
                md_cell(row["candidate_count"]),
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
        "referenced_counts": report["referenced_counts"],
        "out": {
            "json": str(OUT_JSON),
            "csv": str(OUT_CSV),
            "md": str(OUT_MD),
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
