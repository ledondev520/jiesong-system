#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: tmp/wps_11_export_list_raw/parsed decision/source/evidence reports + backend/prisma/dev.db
Output: tmp/wps_11_export_list_raw/parsed/wps_remaining_decision_dossier.{json,csv,md}
Pos: WPS 剩余业务裁决事项结构化证据包；把最后 2 个裁决项拆成源文件、现库、反证和可选动作；只读，不写库

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import csv
import json
import sqlite3
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
PARSED_DIR = REPO_ROOT / "tmp/wps_11_export_list_raw/parsed"
DB_PATH = REPO_ROOT / "backend/prisma/dev.db"
OUT_JSON = PARSED_DIR / "wps_remaining_decision_dossier.json"
OUT_CSV = PARSED_DIR / "wps_remaining_decision_dossier.csv"
OUT_MD = PARSED_DIR / "wps_remaining_decision_dossier.md"


def read_csv(name: str) -> list[dict[str, str]]:
    path = PARSED_DIR / name
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def read_json(name: str, fallback: Any) -> Any:
    path = PARSED_DIR / name
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def to_float(value: Any) -> float | None:
    text = str(value or "").replace(",", "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def compact(value: Any, limit: int = 160) -> str:
    if value is None:
        return ""
    text = " ".join(str(value).split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def has_wps_source(note: Any) -> bool:
    text = str(note or "")
    return any(marker in text for marker in ("[WPS_", "11-报关记录", "12-报关单", "_wps_cloud_root", "出货汇总"))


def source_ref(row: dict[str, Any]) -> str:
    if row.get("source"):
        return str(row["source"])
    if row.get("source_file") and row.get("sheet") and row.get("row"):
        return f"{row['source_file']}#{str(row['sheet']).strip()}:{row['row']}"
    return str(row.get("relative_path") or "")


def product_matches(row: dict[str, Any], keywords: tuple[str, ...]) -> bool:
    haystack = " ".join(str(row.get(key) or "") for key in ("product_name", "customs_name", "description", "supplement"))
    return any(keyword in haystack for keyword in keywords)


def db_rows(query: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
    if not DB_PATH.exists():
        return []
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        return [dict(row) for row in conn.execute(query, params).fetchall()]


def db_sales(contract_no: str, keywords: tuple[str, ...]) -> list[dict[str, Any]]:
    rows = db_rows(
        """
        SELECT
          sc.contractNo AS contract_no,
          p.customsName AS customs_name,
          p.description AS description,
          st.name AS store,
          si.quantity AS quantity,
          si.unit AS unit,
          si.sellingPrice AS selling_price,
          si.specification AS specification,
          COUNT(DISTINCT inv.id) AS inventory_refs,
          si.note AS note
        FROM sales_items si
        JOIN sales_contracts sc ON sc.id = si.salesContractId
        JOIN products p ON p.id = si.productId
        JOIN stores st ON st.id = si.storeId
        LEFT JOIN inventories inv ON inv.salesItemId = si.id
        WHERE sc.contractNo = ?
        GROUP BY si.id
        ORDER BY p.customsName, st.name, si.quantity, si.sellingPrice
        """,
        (contract_no,),
    )
    return [row for row in rows if product_matches(row, keywords)]


def db_packing(contract_no: str, keywords: tuple[str, ...]) -> list[dict[str, Any]]:
    rows = db_rows(
        """
        SELECT
          sc.contractNo AS contract_no,
          p.customsName AS customs_name,
          p.description AS description,
          st.name AS store,
          pi.quantity AS quantity,
          pi.unit AS unit,
          pi.boxes AS boxes,
          pi.grossWeight AS gross_weight,
          pi.netWeight AS net_weight,
          pi.volume AS volume,
          pi.manufacturer AS manufacturer,
          pi.specification AS specification,
          pi.invoiceNo AS invoice_no,
          pi.unitPrice AS unit_price,
          pi.totalPrice AS total_price,
          COUNT(DISTINCT cdi.id) AS customs_refs,
          pi.note AS note
        FROM packing_items pi
        JOIN sales_contracts sc ON sc.id = pi.salesContractId
        JOIN products p ON p.id = pi.productId
        LEFT JOIN stores st ON st.id = pi.storeId
        LEFT JOIN customs_declaration_items cdi ON cdi.packingItemId = pi.id
        WHERE sc.contractNo = ?
        GROUP BY pi.id
        ORDER BY p.customsName, st.name, pi.quantity, pi.boxes
        """,
        (contract_no,),
    )
    return [row for row in rows if product_matches(row, keywords)]


def db_customs(contract_no: str) -> list[dict[str, Any]]:
    return db_rows(
        """
        SELECT
          cd.declarationNo AS declaration_no,
          cd.status AS status,
          cd.totalQuantity AS total_quantity,
          cd.totalNetWeight AS total_net_weight,
          cd.totalGrossWeight AS total_gross_weight,
          cd.totalAmount AS total_amount,
          cd.note AS note
        FROM customs_declarations cd
        JOIN sales_contracts sc ON sc.id = cd.salesContractId
        WHERE sc.contractNo = ?
        ORDER BY cd.declarationNo
        """,
        (contract_no,),
    )


def summarize_source_sales(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "source": source_ref(row),
            "product": row.get("product_name") or "",
            "specification": row.get("specification") or "",
            "quantity": to_float(row.get("quantity")),
            "unit": row.get("unit") or "",
            "unit_price": to_float(row.get("unit_price")),
            "total_price": to_float(row.get("total_price")),
        }
        for row in rows
    ]


def summarize_source_packing(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "source": source_ref(row),
            "product": row.get("product_name") or "",
            "supplement": row.get("supplement") or "",
            "store": row.get("store") or "",
            "quantity": to_float(row.get("quantity")),
            "unit": row.get("unit") or "",
            "boxes": to_float(row.get("boxes")),
            "gross_weight": to_float(row.get("gross_weight")),
            "net_weight": to_float(row.get("net_weight")),
            "volume": to_float(row.get("volume")),
            "invoice_no": row.get("invoice_no") or "",
            "unit_price": to_float(row.get("unit_price")),
        }
        for row in rows
    ]


def summarize_db_sales(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "product": row.get("description") or row.get("customs_name") or "",
            "store": row.get("store") or "",
            "quantity": row.get("quantity"),
            "unit": row.get("unit") or "",
            "selling_price": row.get("selling_price"),
            "specification": row.get("specification") or "",
            "inventory_refs": row.get("inventory_refs") or 0,
            "has_wps_source": has_wps_source(row.get("note")),
            "note_excerpt": compact(row.get("note")),
        }
        for row in rows
    ]


def summarize_db_packing(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "product": row.get("description") or row.get("customs_name") or "",
            "store": row.get("store") or "",
            "quantity": row.get("quantity"),
            "unit": row.get("unit") or "",
            "boxes": row.get("boxes"),
            "gross_weight": row.get("gross_weight"),
            "net_weight": row.get("net_weight"),
            "volume": row.get("volume"),
            "invoice_no": row.get("invoice_no") or "",
            "unit_price": row.get("unit_price"),
            "customs_refs": row.get("customs_refs") or 0,
            "has_wps_source": has_wps_source(row.get("note")),
            "note_excerpt": compact(row.get("note")),
        }
        for row in rows
    ]


def attachment_rows(contract_no: str, rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    return [
        {
            "relative_path": row.get("relative_path") or "",
            "category": row.get("category") or "",
            "inferred_contracts": row.get("inferred_contracts") or "",
            "size_bytes": to_float(row.get("size_bytes")),
        }
        for row in rows
        if contract_no in str(row.get("inferred_contracts") or "")
    ]


def evidence_rows(contract_no: str, rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    return [
        {
            "relative_path": row.get("relative_path") or "",
            "category": row.get("category") or "",
            "declaration_no": row.get("declaration_no") or "",
            "mapped_contract": row.get("contract_no") or "",
            "customs_name": row.get("customs_name") or "",
            "quantity": to_float(row.get("quantity")),
            "unit": row.get("unit") or "",
            "unit_price": to_float(row.get("unit_price")),
            "total_price": to_float(row.get("total_price")),
            "source_note": compact(row.get("source_note"), 220),
        }
        for row in rows
        if contract_no in str(row.get("inferred_contracts") or row.get("contract_no") or "")
    ]


def build_report() -> dict[str, Any]:
    decision_packet = read_json("wps_import_decision_packet.json", [])
    sales_sources = read_csv("preferred_sales_items.csv")
    packing_sources = read_csv("packing_items.csv")
    attachments = read_csv("attachment_inventory.csv")
    evidence = read_csv("evidence_items.csv")

    exp2500002_sales = [
        row for row in sales_sources
        if row.get("contract_no") == "EXP2500002" and product_matches(row, ("瓷砖",))
    ]
    exp2500002_packing = [
        row for row in packing_sources
        if row.get("contract_no") == "EXP2500002" and product_matches(row, ("瓷砖",))
    ]
    exp2400006_sales = [
        row for row in sales_sources
        if row.get("contract_no") == "EXP2400006"
    ]
    exp2400006_packing = [
        row for row in packing_sources
        if row.get("contract_no") == "EXP2400006"
    ]

    items = [
        {
            "category": "sales_missing_store",
            "subject": "EXP2500002 / 瓷砖",
            "current_state": "源销售合同 `合 同:13` 缺门店；同合同瓷砖装箱证据同时出现 Burbank 与 安纳汉姆，不能自动把该销售行归入单一门店。",
            "decision_needed": "指定 771.84 平方米瓷砖销售行归属门店、拆分比例，或确认保留现状。",
            "source_sales_rows": summarize_source_sales(exp2500002_sales),
            "source_packing_rows": summarize_source_packing(exp2500002_packing),
            "db_sales_rows": summarize_db_sales(db_sales("EXP2500002", ("瓷砖",))),
            "db_packing_rows": summarize_db_packing(db_packing("EXP2500002", ("瓷砖",))),
            "counter_evidence": [
                "销售合同页自身没有门店字段。",
                "同商品装箱来源同时指向 Burbank 和 安纳汉姆。",
                "现库已存在 Burbank 771.84 平方米行与安纳汉姆 771.84 平方米行，且价格/来源口径不同。",
            ],
            "safe_options": [
                "指定 771.84 平方米全部归属安纳汉姆，并说明 Burbank 771.84 行是否保留。",
                "指定 771.84 平方米全部归属 Burbank，并说明价格以哪份源文件为准。",
                "给出拆分比例或拆分数量。",
                "确认暂不补来源 note，保留当前数据和裁决项。",
            ],
        },
        {
            "category": "evidence_customs_declaration_blocked",
            "subject": "EXP2400006",
            "current_state": "旧空运 `.xls` 底稿可读，但缺正式 18 位海关编号；同目录正式报关单号 `222920240004561873` 已由正文重量/金额证明对应 EXP2400005。",
            "decision_needed": "补充 EXP2400006 的正式 18 位海关编号或正式报关单原件；没有正式编号前不创建报关单。",
            "source_sales_rows": summarize_source_sales(exp2400006_sales),
            "source_packing_rows": summarize_source_packing(exp2400006_packing),
            "db_sales_rows": summarize_db_sales(db_sales("EXP2400006", ("密胺", "餐盘"))),
            "db_packing_rows": summarize_db_packing(db_packing("EXP2400006", ("密胺", "餐盘"))),
            "db_customs_rows": db_customs("EXP2400006"),
            "related_attachments": attachment_rows("EXP2400006", attachments),
            "related_evidence_rows": evidence_rows("EXP2400006", evidence),
            "counter_evidence": [
                "`25312000000011328975` 来自出货汇总 `invoice_no` 列，不是正式海关编号。",
                "`222920240004561873` 的正式报关 PDF 毛净重/金额对应 EXP2400005，不对应 EXP2400006 空运底稿。",
                "`EXP2400006.xlsx` 发票汇总页存在 EXP2400005 模板污染，不能作为正式编号来源。",
            ],
            "safe_options": [
                "提供 EXP2400006 正式报关单或 18 位海关编号后再导入。",
                "确认该空运底稿仅作参考，不创建报关单。",
            ],
        },
    ]

    packet_by_category = {item.get("category"): item for item in decision_packet}
    for item in items:
        packet = packet_by_category.get(item["category"], {})
        item["existing_packet_required_decision"] = packet.get("required_decision") or ""
        item["existing_packet_source"] = packet.get("source") or ""

    return {
        "status": "remaining_decision_dossier_ready",
        "summary": {
            "decision_items": len(items),
            "categories": {item["category"]: 1 for item in items},
            "db_writes": 0,
            "file_copies": 0,
        },
        "items": items,
    }


def write_csv(report: dict[str, Any]) -> None:
    rows = []
    for item in report["items"]:
        rows.append({
            "category": item["category"],
            "subject": item["subject"],
            "current_state": item["current_state"],
            "decision_needed": item["decision_needed"],
            "source_sales_rows": len(item.get("source_sales_rows", [])),
            "source_packing_rows": len(item.get("source_packing_rows", [])),
            "db_sales_rows": len(item.get("db_sales_rows", [])),
            "db_packing_rows": len(item.get("db_packing_rows", [])),
            "db_customs_rows": len(item.get("db_customs_rows", [])),
            "db_sales_inventory_refs": sum(int(row.get("inventory_refs") or 0) for row in item.get("db_sales_rows", [])),
            "db_packing_customs_refs": sum(int(row.get("customs_refs") or 0) for row in item.get("db_packing_rows", [])),
            "related_attachments": len(item.get("related_attachments", [])),
            "related_evidence_rows": len(item.get("related_evidence_rows", [])),
            "safe_options": " | ".join(item.get("safe_options", [])),
        })
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def render_table(rows: list[dict[str, Any]], columns: list[tuple[str, str]]) -> list[str]:
    if not rows:
        return ["无。"]
    lines = []
    lines.append("| " + " | ".join(title for title, _ in columns) + " |")
    lines.append("|" + "|".join("---" for _ in columns) + "|")
    for row in rows:
        lines.append("| " + " | ".join(compact(row.get(key), 80).replace("|", "/") or "-" for _, key in columns) + " |")
    return lines


def write_md(report: dict[str, Any]) -> None:
    lines = [
        "# WPS 剩余裁决结构化证据包",
        "",
        f"状态：`{report['status']}`",
        f"裁决项：`{report['summary']['decision_items']}`",
        "数据库写入：`0`",
        "文件复制：`0`",
        "",
        "## 处理口径",
        "- 本报告只读，不写库、不复制、不删除文件。",
        "- 只把现有裁决包拆成结构化证据，避免后续从长字符串里重新翻证据。",
        "- 不能用 invoice_no、模板页、路径名或相似文件冒充正式材料。",
        "",
    ]
    for item in report["items"]:
        lines.extend([
            f"## {item['subject']}",
            "",
            f"- 分类：`{item['category']}`",
            f"- 当前状态：{item['current_state']}",
            f"- 需要裁决：{item['decision_needed']}",
            "",
            "### 源销售行",
            *render_table(item.get("source_sales_rows", []), [
                ("来源", "source"),
                ("商品", "product"),
                ("规格", "specification"),
                ("数量", "quantity"),
                ("单位", "unit"),
                ("单价", "unit_price"),
                ("总价", "total_price"),
            ]),
            "",
            "### 源装箱/出货行",
            *render_table(item.get("source_packing_rows", []), [
                ("来源", "source"),
                ("商品", "product"),
                ("补充", "supplement"),
                ("门店", "store"),
                ("数量", "quantity"),
                ("单位", "unit"),
                ("箱数", "boxes"),
                ("毛重", "gross_weight"),
                ("净重", "net_weight"),
                ("发票号", "invoice_no"),
                ("单价", "unit_price"),
            ]),
            "",
            "### 现库销售行",
            *render_table(item.get("db_sales_rows", []), [
                ("商品", "product"),
                ("门店", "store"),
                ("数量", "quantity"),
                ("单位", "unit"),
                ("售价", "selling_price"),
                ("规格", "specification"),
                ("库存引用", "inventory_refs"),
                ("有来源", "has_wps_source"),
                ("note 摘要", "note_excerpt"),
            ]),
            "",
            "### 现库装箱行",
            *render_table(item.get("db_packing_rows", []), [
                ("商品", "product"),
                ("门店", "store"),
                ("数量", "quantity"),
                ("单位", "unit"),
                ("箱数", "boxes"),
                ("毛重", "gross_weight"),
                ("净重", "net_weight"),
                ("发票号", "invoice_no"),
                ("报关引用", "customs_refs"),
                ("有来源", "has_wps_source"),
            ]),
            "",
        ])
        if item.get("db_customs_rows") is not None:
            lines.extend([
                "### 现库报关单",
                *render_table(item.get("db_customs_rows", []), [
                    ("报关号", "declaration_no"),
                    ("状态", "status"),
                    ("数量", "total_quantity"),
                    ("净重", "total_net_weight"),
                    ("毛重", "total_gross_weight"),
                    ("金额", "total_amount"),
                    ("note", "note"),
                ]),
                "",
            ])
        if item.get("related_attachments") is not None:
            lines.extend([
                "### 相关保留文件",
                *render_table(item.get("related_attachments", []), [
                    ("路径", "relative_path"),
                    ("类别", "category"),
                    ("推断合同", "inferred_contracts"),
                    ("大小", "size_bytes"),
                ]),
                "",
                "### 真实凭证抽取行",
                *render_table(item.get("related_evidence_rows", []), [
                    ("路径", "relative_path"),
                    ("类别", "category"),
                    ("报关号", "declaration_no"),
                    ("映射合同", "mapped_contract"),
                    ("商品", "customs_name"),
                    ("数量", "quantity"),
                    ("单价", "unit_price"),
                    ("总价", "total_price"),
                    ("说明", "source_note"),
                ]),
                "",
            ])
        lines.extend([
            "### 反证",
            *[f"- {entry}" for entry in item.get("counter_evidence", [])],
            "",
            "### 可选动作",
            *[f"- {entry}" for entry in item.get("safe_options", [])],
            "",
        ])
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    report = build_report()
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(report)
    write_md(report)
    print(json.dumps({
        "status": report["status"],
        "decision_items": report["summary"]["decision_items"],
        "out": {
            "json": str(OUT_JSON),
            "csv": str(OUT_CSV),
            "md": str(OUT_MD),
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
