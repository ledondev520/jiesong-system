#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: backend/prisma/dev.db
Output: tmp/wps_11_export_list_raw/parsed/wps_pending_formalization_blockers.{json,csv,md}
Pos: PENDING 合同正式化阻断原因分类；区分销售、装箱和报关链路，只读不写库

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
OUT_JSON = PARSED_DIR / "wps_pending_formalization_blockers.json"
OUT_CSV = PARSED_DIR / "wps_pending_formalization_blockers.csv"
OUT_MD = PARSED_DIR / "wps_pending_formalization_blockers.md"


def has_wps_source(note: Any) -> bool:
    text = str(note or "")
    return "[WPS_" in text or "11-报关记录" in text or "_wps_cloud_root" in text or "出货汇总" in text


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
    if left_number is None or right_number is None:
        return False
    return abs(left_number - right_number) < 1e-6


def norm_text(value: Any) -> str:
    return str(value or "").strip()


def row_to_dict(cursor: sqlite3.Cursor, row: sqlite3.Row) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}


def sales_inventory_refs(conn: sqlite3.Connection, row_id: str) -> int:
    return int(conn.execute("SELECT COUNT(*) FROM inventories WHERE salesItemId = ?", (row_id,)).fetchone()[0])


def packing_customs_refs(conn: sqlite3.Connection, row_id: str) -> int:
    return int(conn.execute("SELECT COUNT(*) FROM customs_declaration_items WHERE packingItemId = ?", (row_id,)).fetchone()[0])


def pending_sales_rows(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
          si.id,
          sc.contractNo AS contract_no,
          p.customsName AS product,
          st.name AS store,
          si.productId,
          si.storeId,
          si.quantity,
          si.unit,
          si.sellingPrice AS price,
          si.costPrice,
          si.note
        FROM sales_items si
        JOIN sales_contracts sc ON sc.id = si.salesContractId
        JOIN products p ON p.id = si.productId
        JOIN stores st ON st.id = si.storeId
        WHERE sc.contractNo LIKE 'PENDING-%'
        ORDER BY sc.contractNo, p.customsName, st.name
        """
    ).fetchall()
    return [row_to_dict(conn.execute("SELECT 1"), row) for row in rows]


def pending_packing_rows(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
          pi.id,
          sc.contractNo AS contract_no,
          p.customsName AS product,
          COALESCE(st.name, '') AS store,
          pi.productId,
          pi.storeId,
          pi.quantity,
          pi.unit,
          pi.note
        FROM packing_items pi
        JOIN sales_contracts sc ON sc.id = pi.salesContractId
        JOIN products p ON p.id = pi.productId
        LEFT JOIN stores st ON st.id = pi.storeId
        WHERE sc.contractNo LIKE 'PENDING-%'
        ORDER BY sc.contractNo, p.customsName, st.name
        """
    ).fetchall()
    return [row_to_dict(conn.execute("SELECT 1"), row) for row in rows]


def formal_sales_owners(conn: sqlite3.Connection, target: dict[str, Any]) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
          si.id,
          sc.contractNo AS contract_no,
          p.customsName AS product,
          st.name AS store,
          si.quantity,
          si.unit,
          si.sellingPrice AS price,
          si.note
        FROM sales_items si
        JOIN sales_contracts sc ON sc.id = si.salesContractId
        JOIN products p ON p.id = si.productId
        JOIN stores st ON st.id = si.storeId
        WHERE sc.contractNo NOT LIKE 'PENDING-%'
          AND si.productId = ?
          AND si.storeId = ?
          AND ABS(si.quantity - ?) < 0.000001
        ORDER BY sc.contractNo
        """,
        (target["productId"], target["storeId"], target["quantity"]),
    ).fetchall()
    owners = [row_to_dict(conn.execute("SELECT 1"), row) for row in rows]
    return [owner for owner in owners if has_wps_source(owner.get("note"))]


def formal_packing_owners(conn: sqlite3.Connection, target: dict[str, Any]) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
          pi.id,
          sc.contractNo AS contract_no,
          p.customsName AS product,
          COALESCE(st.name, '') AS store,
          pi.quantity,
          pi.unit,
          pi.note
        FROM packing_items pi
        JOIN sales_contracts sc ON sc.id = pi.salesContractId
        JOIN products p ON p.id = pi.productId
        LEFT JOIN stores st ON st.id = pi.storeId
        WHERE sc.contractNo NOT LIKE 'PENDING-%'
          AND pi.productId = ?
          AND (
            (pi.storeId IS NULL AND ? IS NULL)
            OR pi.storeId = ?
          )
          AND ABS(pi.quantity - ?) < 0.000001
        ORDER BY sc.contractNo
        """,
        (target["productId"], target["storeId"], target["storeId"], target["quantity"]),
    ).fetchall()
    owners = [row_to_dict(conn.execute("SELECT 1"), row) for row in rows]
    return [
        owner
        for owner in owners
        if has_wps_source(owner.get("note"))
        and (not target.get("unit") or not owner.get("unit") or norm_text(target.get("unit")) == norm_text(owner.get("unit")))
    ]


def classify_sales(conn: sqlite3.Connection, target: dict[str, Any]) -> dict[str, Any]:
    refs = sales_inventory_refs(conn, target["id"])
    owners = formal_sales_owners(conn, target)
    owner_summary = [
        {
            "id": owner["id"],
            "contract_no": owner["contract_no"],
            "quantity": owner["quantity"],
            "unit": owner["unit"],
            "price": owner["price"],
            "note_excerpt": norm_text(owner.get("note"))[:180],
        }
        for owner in owners
    ]

    if refs:
        blocker = "target_has_inventory_refs"
    elif has_wps_source(target.get("note")):
        blocker = "target_already_has_source"
    elif number(target.get("quantity")) is None or same_number(target.get("quantity"), 0):
        blocker = "target_quantity_not_positive"
    elif len(owners) == 1 and same_number(target.get("price"), 0) and same_number(target.get("costPrice"), 0):
        blocker = "auto_candidate"
    elif len(owners) == 0:
        blocker = "no_formal_sales_owner"
    elif len(owners) > 1:
        blocker = "multiple_formal_sales_owners"
    else:
        blocker = "formal_owner_exists_but_target_not_zero_placeholder"

    return {
        "interface": "sales",
        "id": target["id"],
        "contract_no": target["contract_no"],
        "product": target["product"],
        "store": target["store"],
        "quantity": target["quantity"],
        "unit": target["unit"],
        "price": target["price"],
        "target_ref_count": refs,
        "owner_count": len(owners),
        "blocker": blocker,
        "owners": owner_summary,
    }


def classify_packing(conn: sqlite3.Connection, target: dict[str, Any]) -> dict[str, Any]:
    refs = packing_customs_refs(conn, target["id"])
    owners = formal_packing_owners(conn, target)
    owner_summary = [
        {
            "id": owner["id"],
            "contract_no": owner["contract_no"],
            "quantity": owner["quantity"],
            "unit": owner["unit"],
            "note_excerpt": norm_text(owner.get("note"))[:180],
        }
        for owner in owners
    ]

    if refs:
        blocker = "target_has_customs_refs"
    elif has_wps_source(target.get("note")):
        blocker = "target_already_has_source"
    elif number(target.get("quantity")) is None or same_number(target.get("quantity"), 0):
        blocker = "target_quantity_not_positive"
    elif len(owners) == 1:
        blocker = "auto_candidate"
    elif len(owners) == 0:
        blocker = "no_formal_packing_owner"
    else:
        blocker = "multiple_formal_packing_owners"

    return {
        "interface": "packing",
        "id": target["id"],
        "contract_no": target["contract_no"],
        "product": target["product"],
        "store": target["store"],
        "quantity": target["quantity"],
        "unit": target["unit"],
        "target_ref_count": refs,
        "owner_count": len(owners),
        "blocker": blocker,
        "owners": owner_summary,
        "target_note": target.get("note") or "",
    }


def pending_customs_rows(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    declarations = conn.execute(
        """
        SELECT
          cd.id,
          sc.contractNo AS contract_no,
          cd.declarationNo AS declaration_no,
          cd.note,
          COUNT(cdi.id) AS item_count
        FROM customs_declarations cd
        JOIN sales_contracts sc ON sc.id = cd.salesContractId
        LEFT JOIN customs_declaration_items cdi ON cdi.customsDeclarationId = cd.id
        WHERE sc.contractNo LIKE 'PENDING-%'
        GROUP BY cd.id
        ORDER BY sc.contractNo, cd.declarationNo
        """
    ).fetchall()
    details: list[dict[str, Any]] = []
    for row in declarations:
        data = row_to_dict(conn.execute("SELECT 1"), row)
        formal_like = bool(str(data["declaration_no"] or "").isdigit() and len(str(data["declaration_no"])) == 18)
        blocker = "has_formal_declaration_no" if formal_like else "placeholder_declaration_missing_formal_original"
        details.append({
            "interface": "customs",
            "id": data["id"],
            "contract_no": data["contract_no"],
            "declaration_no": data["declaration_no"],
            "item_count": data["item_count"],
            "blocker": blocker,
            "note_excerpt": norm_text(data.get("note"))[:180],
        })
    return details


def build_report() -> dict[str, Any]:
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row

    details: list[dict[str, Any]] = []
    details.extend(classify_sales(conn, row) for row in pending_sales_rows(conn))
    details.extend(classify_packing(conn, row) for row in pending_packing_rows(conn))
    details.extend(pending_customs_rows(conn))
    conn.close()

    by_interface = Counter(row["interface"] for row in details)
    by_blocker = Counter(row["blocker"] for row in details)
    auto_candidates = [row for row in details if row["blocker"] == "auto_candidate"]
    return {
        "status": "pending_formalization_blockers_classified",
        "mode": "read_only_no_db_writes",
        "total": len(details),
        "auto_writable": len(auto_candidates),
        "by_interface": [{"interface": key, "count": value} for key, value in by_interface.most_common()],
        "by_blocker": [{"blocker": key, "count": value} for key, value in by_blocker.most_common()],
        "details": details,
    }


def write_csv(report: dict[str, Any]) -> None:
    fields = [
        "interface", "blocker", "contract_no", "document_no", "product", "store",
        "quantity", "unit", "price", "target_ref_count", "owner_count", "owner_summary", "note",
    ]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in report["details"]:
            owners = "; ".join(
                f"{owner.get('contract_no')}:{owner.get('quantity')}{owner.get('unit') or ''}"
                for owner in row.get("owners", [])[:5]
            )
            writer.writerow({
                "interface": row.get("interface"),
                "blocker": row.get("blocker"),
                "contract_no": row.get("contract_no"),
                "document_no": row.get("declaration_no", ""),
                "product": row.get("product", ""),
                "store": row.get("store", ""),
                "quantity": row.get("quantity", row.get("item_count", "")),
                "unit": row.get("unit", ""),
                "price": row.get("price", ""),
                "target_ref_count": row.get("target_ref_count", ""),
                "owner_count": row.get("owner_count", ""),
                "owner_summary": owners,
                "note": row.get("target_note") or row.get("note_excerpt", ""),
            })


def md_cell(value: Any) -> str:
    text = str(value if value is not None else "")
    return text.replace("|", "/").replace("\n", " ")[:180] or "-"


def write_md(report: dict[str, Any]) -> None:
    lines = [
        "# WPS PENDING 正式化阻断原因",
        "",
        f"状态：`{report['status']}`",
        f"模式：`{report['mode']}`",
        f"总行数：`{report['total']}`",
        f"自动可写：`{report['auto_writable']}`",
        "",
        "## Interface 分布",
        "| Interface | 数量 |",
        "|---|---:|",
    ]
    for row in report["by_interface"]:
        lines.append(f"| `{md_cell(row['interface'])}` | {row['count']} |")

    lines.extend(["", "## 阻断原因", "| 阻断原因 | 数量 |", "|---|---:|"])
    for row in report["by_blocker"]:
        lines.append(f"| `{md_cell(row['blocker'])}` | {row['count']} |")

    lines.extend([
        "",
        "## 明细",
        "| Interface | 阻断原因 | 对象 | 数量 | 引用 | 正式 owner | 备注 |",
        "|---|---|---|---:|---:|---|---|",
    ])
    for row in report["details"]:
        object_label = row.get("declaration_no") or " / ".join(
            str(row.get(key) or "") for key in ["contract_no", "product", "store"] if row.get(key) is not None
        )
        owners = "; ".join(
            f"{owner.get('contract_no')}:{owner.get('quantity')}{owner.get('unit') or ''}"
            for owner in row.get("owners", [])[:3]
        )
        quantity = row.get("quantity", row.get("item_count", ""))
        if row.get("unit"):
            quantity = f"{quantity}{row.get('unit')}"
        lines.append(
            "| "
            f"`{md_cell(row.get('interface'))}` | "
            f"`{md_cell(row.get('blocker'))}` | "
            f"{md_cell(object_label)} | "
            f"{md_cell(quantity)} | "
            f"{md_cell(row.get('target_ref_count', ''))} | "
            f"{md_cell(owners)} | "
            f"{md_cell(row.get('target_note') or row.get('note_excerpt', ''))} |"
        )

    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    report = build_report()
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(report)
    write_md(report)
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
