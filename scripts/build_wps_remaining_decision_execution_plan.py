#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: tmp/wps_11_export_list_raw/parsed/wps_remaining_decision_dossier.json + backend/prisma/dev.db
Output: tmp/wps_11_export_list_raw/parsed/wps_remaining_decision_execution_plan.{json,csv,md}
Pos: WPS 剩余 2 个裁决项只读执行方案；列出业务裁决后可能执行的候选动作、目标行和必要输入；不写库

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import csv
import json
import sqlite3
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PARSED_DIR = ROOT / "tmp/wps_11_export_list_raw/parsed"
DB_PATH = ROOT / "backend/prisma/dev.db"
DOSSIER_JSON = PARSED_DIR / "wps_remaining_decision_dossier.json"
OUT_JSON = PARSED_DIR / "wps_remaining_decision_execution_plan.json"
OUT_CSV = PARSED_DIR / "wps_remaining_decision_execution_plan.csv"
OUT_MD = PARSED_DIR / "wps_remaining_decision_execution_plan.md"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def db_rows(query: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
    if not DB_PATH.exists():
        return []
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        return [dict(row) for row in conn.execute(query, params).fetchall()]


def compact(value: Any, limit: int = 180) -> str:
    text = " ".join(str(value or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def product_matches(row: dict[str, Any], keywords: tuple[str, ...]) -> bool:
    haystack = " ".join(str(row.get(key) or "") for key in ("customs_name", "description", "note"))
    return any(keyword in haystack for keyword in keywords)


def sales_rows(contract_no: str, keywords: tuple[str, ...]) -> list[dict[str, Any]]:
    rows = db_rows(
        """
        SELECT
          si.id,
          sc.contractNo AS contract_no,
          p.customsName AS customs_name,
          p.description AS description,
          st.name AS store,
          si.quantity,
          si.unit,
          si.sellingPrice AS selling_price,
          si.specification,
          COUNT(DISTINCT inv.id) AS inventory_refs,
          si.note
        FROM sales_items si
        JOIN sales_contracts sc ON sc.id = si.salesContractId
        JOIN products p ON p.id = si.productId
        JOIN stores st ON st.id = si.storeId
        LEFT JOIN inventories inv ON inv.salesItemId = si.id
        WHERE sc.contractNo = ?
        GROUP BY si.id
        ORDER BY si.quantity, st.name, si.sellingPrice
        """,
        (contract_no,),
    )
    return [row for row in rows if product_matches(row, keywords)]


def packing_rows(contract_no: str, keywords: tuple[str, ...]) -> list[dict[str, Any]]:
    rows = db_rows(
        """
        SELECT
          pi.id,
          sc.contractNo AS contract_no,
          p.customsName AS customs_name,
          p.description AS description,
          st.name AS store,
          pi.quantity,
          pi.unit,
          pi.boxes,
          pi.grossWeight AS gross_weight,
          pi.netWeight AS net_weight,
          pi.volume,
          pi.invoiceNo AS invoice_no,
          pi.unitPrice AS unit_price,
          COUNT(DISTINCT cdi.id) AS customs_refs,
          pi.note
        FROM packing_items pi
        JOIN sales_contracts sc ON sc.id = pi.salesContractId
        JOIN products p ON p.id = pi.productId
        LEFT JOIN stores st ON st.id = pi.storeId
        LEFT JOIN customs_declaration_items cdi ON cdi.packingItemId = pi.id
        WHERE sc.contractNo = ?
        GROUP BY pi.id
        ORDER BY pi.quantity, st.name, pi.boxes
        """,
        (contract_no,),
    )
    return [row for row in rows if product_matches(row, keywords)]


def contract_row(contract_no: str) -> dict[str, Any] | None:
    rows = db_rows(
        """
        SELECT id, contractNo, totalAmount, status, note
        FROM sales_contracts
        WHERE contractNo = ?
        LIMIT 1
        """,
        (contract_no,),
    )
    return rows[0] if rows else None


def customs_rows(contract_no: str) -> list[dict[str, Any]]:
    return db_rows(
        """
        SELECT cd.id, cd.declarationNo, cd.status, cd.totalAmount, cd.totalQuantity,
               cd.totalNetWeight, cd.totalGrossWeight, cd.note
        FROM customs_declarations cd
        JOIN sales_contracts sc ON sc.id = cd.salesContractId
        WHERE sc.contractNo = ?
        ORDER BY cd.declarationNo
        """,
        (contract_no,),
    )


def row_ref(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "product": row.get("description") or row.get("customs_name"),
        "store": row.get("store") or "",
        "quantity": row.get("quantity"),
        "unit": row.get("unit") or "",
        "price": row.get("selling_price", row.get("unit_price")),
        "inventory_refs": row.get("inventory_refs"),
        "customs_refs": row.get("customs_refs"),
        "note_excerpt": compact(row.get("note"), 220),
    }


def find_by(rows: list[dict[str, Any]], *, store: str | None = None, quantity: float | None = None, has_note: bool | None = None) -> list[dict[str, Any]]:
    result = []
    for row in rows:
        if store is not None and row.get("store") != store:
            continue
        if quantity is not None and abs(float(row.get("quantity") or 0) - quantity) > 0.0001:
            continue
        if has_note is not None:
            note_has_wps = "WPS" in str(row.get("note") or "") or "11-报关记录" in str(row.get("note") or "")
            if note_has_wps != has_note:
                continue
        result.append(row)
    return result


def operation(kind: str, table: str, target: dict[str, Any] | None, description: str, safety: list[str]) -> dict[str, Any]:
    return {
        "kind": kind,
        "table": table,
        "target": row_ref(target) if target else None,
        "description": description,
        "safety_checks": safety,
    }


def exp2500002_plan() -> dict[str, Any]:
    db_sales = sales_rows("EXP2500002", ("瓷砖",))
    db_packing = packing_rows("EXP2500002", ("瓷砖",))
    burbank_sales = find_by(db_sales, store="Burbank", quantity=771.84)
    anaheim_sales = find_by(db_sales, store="安纳汉姆", quantity=771.84)
    anaheim_300_sales = find_by(db_sales, store="安纳汉姆", quantity=300.0)
    burbank_packing = find_by(db_packing, store="Burbank", quantity=771.84)
    anaheim_771_packing = find_by(db_packing, store="安纳汉姆", quantity=771.84)
    anaheim_300_packing = find_by(db_packing, store="安纳汉姆", quantity=300.0)

    shared_safety = [
        "写库前必须备份 backend/prisma/dev.db。",
        "确认目标 sales_items.inventory_refs 均为 0。",
        "确认目标 packing_items.customs_refs 均为 0。",
        "重新运行完成度审计和来源覆盖审计。",
    ]
    return {
        "subject": "EXP2500002 / 瓷砖",
        "status": "awaiting_business_decision",
        "current_rows": {
            "sales": [row_ref(row) for row in db_sales],
            "packing": [row_ref(row) for row in db_packing],
        },
        "decision_options": [
            {
                "option": "keep_current",
                "required_input": ["确认暂不处理门店冲突"],
                "operations": [],
                "result": "不写库，裁决项继续保留。",
            },
            {
                "option": "assign_771_84_to_anaheim",
                "required_input": [
                    "确认 771.84 平方米销售全部归属安纳汉姆",
                    "确认 Burbank 771.84 无来源销售行是删除、保留还是改为参考行",
                ],
                "operations": [
                    operation(
                        "keep",
                        "sales_items",
                        anaheim_sales[0] if anaheim_sales else None,
                        "保留已带销售合同来源的安纳汉姆 771.84 销售行。",
                        shared_safety,
                    ),
                    operation(
                        "delete_or_mark_reference",
                        "sales_items",
                        burbank_sales[0] if burbank_sales else None,
                        "按业务裁决删除或标记 Burbank 771.84 无来源销售行。",
                        shared_safety + ["该动作不可由文件证据自动推出，必须有业务裁决。"],
                    ),
                    operation(
                        "review_keep_or_clear",
                        "packing_items",
                        burbank_packing[0] if burbank_packing else None,
                        "复核 Burbank 771.84 装箱行是否继续保留为装箱来源，不自动删除。",
                        shared_safety,
                    ),
                ],
            },
            {
                "option": "assign_771_84_to_burbank",
                "required_input": [
                    "确认 771.84 平方米销售全部归属 Burbank",
                    "确认销售价格使用合同页 25.0 还是出货汇总 3.0",
                    "确认安纳汉姆 771.84 已带来源销售行是删除、保留还是迁移 note",
                ],
                "operations": [
                    operation(
                        "update_or_attach_source",
                        "sales_items",
                        burbank_sales[0] if burbank_sales else None,
                        "给 Burbank 771.84 销售行补充合同页来源 note，并按裁决价格更新 sellingPrice。",
                        shared_safety + ["价格来源必须在裁决中明确。"],
                    ),
                    operation(
                        "delete_or_mark_reference",
                        "sales_items",
                        anaheim_sales[0] if anaheim_sales else None,
                        "按业务裁决处理安纳汉姆 771.84 已带来源销售行，避免同一合同销售重复。",
                        shared_safety + ["不能自动移动来源 note，必须有业务裁决。"],
                    ),
                    operation(
                        "keep",
                        "packing_items",
                        burbank_packing[0] if burbank_packing else None,
                        "保留已指向 Burbank 的 771.84 装箱行。",
                        shared_safety,
                    ),
                ],
            },
            {
                "option": "split_771_84",
                "required_input": [
                    "给出 Burbank 数量",
                    "给出安纳汉姆数量",
                    "给出各自价格来源",
                    "确认是否保留现有 300 平方米安纳汉姆行不变",
                ],
                "operations": [
                    operation(
                        "update_or_create_split_rows",
                        "sales_items",
                        anaheim_sales[0] if anaheim_sales else None,
                        "按拆分数量调整或拆分现有销售行；当前脚本只列方案，不计算拆分。",
                        shared_safety + ["拆分数量合计必须等于 771.84。"],
                    ),
                    operation(
                        "review",
                        "sales_items",
                        burbank_sales[0] if burbank_sales else None,
                        "按拆分结果处理 Burbank 现有销售行。",
                        shared_safety,
                    ),
                ],
            },
        ],
        "preserve_rows": {
            "anaheim_300_sales": [row_ref(row) for row in anaheim_300_sales],
            "anaheim_300_packing": [row_ref(row) for row in anaheim_300_packing],
            "anaheim_771_packing": [row_ref(row) for row in anaheim_771_packing],
        },
    }


def exp2400006_plan() -> dict[str, Any]:
    contract = contract_row("EXP2400006")
    db_sales = sales_rows("EXP2400006", ("密胺", "餐盘"))
    db_packing = packing_rows("EXP2400006", ("密胺", "餐盘"))
    db_customs = customs_rows("EXP2400006")
    shared_safety = [
        "写库前必须备份 backend/prisma/dev.db。",
        "正式报关号必须为 EXP2400006 的正式材料证明，不能使用 222920240004561873。",
        "不能使用出货汇总 invoice_no=25312000000011328975 替代海关编号。",
        "写库后必须运行真实凭证导入 dry-run、完成度审计和来源覆盖审计。",
    ]
    return {
        "subject": "EXP2400006",
        "status": "awaiting_formal_evidence",
        "current_rows": {
            "contract": contract,
            "sales": [row_ref(row) for row in db_sales],
            "packing": [row_ref(row) for row in db_packing],
            "customs": db_customs,
        },
        "decision_options": [
            {
                "option": "keep_reference_only",
                "required_input": ["确认该空运底稿仅作参考，不创建报关单"],
                "operations": [],
                "result": "不写库，裁决项继续保留或标记为 reference-only 备忘录。",
            },
            {
                "option": "create_customs_after_formal_evidence",
                "required_input": [
                    "EXP2400006 正式 18 位海关编号",
                    "正式报关单原件路径或已保留附件路径",
                    "正式报关明细商品、HS、数量、单价、金额、毛重、净重",
                    "是否创建退税草稿",
                ],
                "operations": [
                    operation(
                        "create",
                        "customs_declarations",
                        None,
                        "按正式材料创建 EXP2400006 报关单头，状态默认为 DRAFT，note 记录正式来源文件。",
                        shared_safety,
                    ),
                    operation(
                        "create",
                        "customs_declaration_items",
                        db_packing[0] if db_packing else None,
                        "按正式材料创建报关明细，并在可唯一匹配时关联现有 packing_items。",
                        shared_safety + ["报关明细不得从旧空运底稿或 invoice_no 推断。"],
                    ),
                    operation(
                        "optional_create",
                        "tax_refunds",
                        None,
                        "只有正式材料含退税联明细时，才创建退税草稿；可退税额仍保持人工核对。",
                        shared_safety,
                    ),
                ],
            },
        ],
    }


def build_report() -> dict[str, Any]:
    dossier = load_json(DOSSIER_JSON, {})
    plans = [exp2500002_plan(), exp2400006_plan()]
    return {
        "status": "remaining_decision_execution_plan_ready",
        "mode": "read_only_no_apply",
        "source_dossier_status": dossier.get("status"),
        "summary": {
            "subjects": len(plans),
            "db_writes": 0,
            "file_copies": 0,
            "requires_user_or_formal_decision": 2,
        },
        "plans": plans,
    }


def write_csv(report: dict[str, Any]) -> None:
    rows = []
    for plan in report["plans"]:
        for option in plan["decision_options"]:
            rows.append({
                "subject": plan["subject"],
                "option": option["option"],
                "required_input": " | ".join(option.get("required_input", [])),
                "operation_count": len(option.get("operations", [])),
                "operation_kinds": " | ".join(op.get("kind", "") for op in option.get("operations", [])),
            })
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def render_target(target: dict[str, Any] | None) -> str:
    if not target:
        return "-"
    parts = [
        f"id={target.get('id')}",
        f"product={target.get('product')}",
        f"store={target.get('store')}",
        f"qty={target.get('quantity')}",
    ]
    if target.get("inventory_refs") is not None:
        parts.append(f"inventory_refs={target.get('inventory_refs')}")
    if target.get("customs_refs") is not None:
        parts.append(f"customs_refs={target.get('customs_refs')}")
    return "; ".join(parts)


def write_md(report: dict[str, Any]) -> None:
    lines = [
        "# WPS 剩余裁决只读执行方案",
        "",
        f"状态：`{report['status']}`",
        f"模式：`{report['mode']}`",
        "数据库写入：`0`",
        "文件复制：`0`",
        "",
        "## 处理口径",
        "- 本报告只读，不写库、不复制、不删除文件。",
        "- 这里列的是收到业务裁决或正式材料之后的候选动作，不是当前可自动执行的动作。",
        "- 所有写库动作仍必须先备份数据库，再单独 dry-run，再复跑完成度审计。",
        "",
    ]
    for plan in report["plans"]:
        lines.extend([
            f"## {plan['subject']}",
            "",
            f"- 状态：`{plan['status']}`",
            "",
        ])
        for option in plan["decision_options"]:
            lines.extend([
                f"### {option['option']}",
                "",
                "必要输入：",
                *[f"- {item}" for item in option.get("required_input", [])],
                "",
            ])
            operations = option.get("operations", [])
            if not operations:
                lines.extend(["候选动作：无。", ""])
                if option.get("result"):
                    lines.extend([f"结果：{option['result']}", ""])
                continue
            lines.extend([
                "| 动作 | 表 | 目标 | 说明 |",
                "|---|---|---|---|",
            ])
            for op in operations:
                lines.append(
                    f"| `{op['kind']}` | `{op['table']}` | {render_target(op.get('target'))} | {op['description']} |"
                )
            lines.extend(["", "安全检查："])
            safety = []
            for op in operations:
                for item in op.get("safety_checks", []):
                    if item not in safety:
                        safety.append(item)
            lines.extend([f"- {item}" for item in safety])
            lines.append("")
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    report = build_report()
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(report)
    write_md(report)
    print(json.dumps({
        "status": report["status"],
        "subjects": report["summary"]["subjects"],
        "db_writes": report["summary"]["db_writes"],
        "out": {
            "json": str(OUT_JSON),
            "csv": str(OUT_CSV),
            "md": str(OUT_MD),
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
