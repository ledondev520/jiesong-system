#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_remaining_source_gap_execution_plan.json + parsed/wps_formal_customs_gap_review.json
Output: parsed/wps_formal_evidence_blockers.{json,csv,md}
Pos: WPS 正式报关材料缺口关闭清单；只读，不写库

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PARSED_DIR = ROOT / "tmp/wps_11_export_list_raw/parsed"
EXECUTION_JSON = PARSED_DIR / "wps_remaining_source_gap_execution_plan.json"
FORMAL_JSON = PARSED_DIR / "wps_formal_customs_gap_review.json"
OUT_JSON = PARSED_DIR / "wps_formal_evidence_blockers.json"
OUT_CSV = PARSED_DIR / "wps_formal_evidence_blockers.csv"
OUT_MD = PARSED_DIR / "wps_formal_evidence_blockers.md"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def declaration_lookup(report: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {row.get("declaration_no", ""): row for row in report.get("declarations") or []}


def nearest_summary(declaration: dict[str, Any] | None) -> dict[str, Any]:
    if not declaration:
        return {
            "nearest_source_contract_no": "",
            "nearest_source_file": "",
            "nearest_container_label": "",
            "nearest_matched_count": "",
            "nearest_missing_count": "",
            "nearest_extra_count": "",
            "nearest_missing_items": [],
            "nearest_extra_items": [],
        }
    nearest = (declaration.get("nearest_source_groups") or [{}])[0]
    return {
        "nearest_source_contract_no": nearest.get("contract_no", ""),
        "nearest_source_file": nearest.get("source_file", ""),
        "nearest_container_label": nearest.get("container_label", ""),
        "nearest_matched_count": nearest.get("matched_count", 0),
        "nearest_missing_count": nearest.get("missing_count", 0),
        "nearest_extra_count": nearest.get("extra_count", 0),
        "nearest_missing_items": nearest.get("missing_items") or [],
        "nearest_extra_items": nearest.get("extra_items") or [],
    }


def classify(row: dict[str, Any], declaration: dict[str, Any] | None) -> tuple[str, str, str]:
    if row.get("type") == "customs_declaration_missing_source":
        return (
            "placeholder_declaration_missing_formal_original",
            "该记录是 BGNDING/PENDING 占位报关单，当前没有正式海关编号或正式报关单原件；最近 WPS 装箱源也不能完整覆盖占位明细集合。",
            "需要正式 18 位海关编号、正式报关单原件、正式报关明细，且能证明归属当前合同或替换占位单。",
        )
    if declaration and not declaration.get("complete_source_group_matches"):
        return (
            "item_inherits_placeholder_without_complete_source_set",
            "该明细只继承了父占位报关单缺口；最近 WPS 装箱源无法完整覆盖父单明细集合，不能逐项补正式来源。",
            "先补父报关单正式材料；若只补单项材料，也必须包含正式报关 itemNo、HS、数量、金额、毛净重和正式编号。",
        )
    return (
        "item_inherits_missing_formal_declaration",
        "该明细缺口来自父报关单没有正式来源。",
        "先关闭父报关单正式材料缺口，再重跑真实凭证导入 dry-run。",
    )


def build_report() -> dict[str, Any]:
    execution = load_json(EXECUTION_JSON)
    formal = load_json(FORMAL_JSON)
    declarations = declaration_lookup(formal)
    rows = [
        row
        for row in execution.get("rows", [])
        if row.get("action_family") == "formal_evidence_required"
    ]

    details: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()
    type_counts: Counter[str] = Counter()
    declaration_counts: Counter[str] = Counter()
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for row in rows:
        declaration_no = row.get("document_no") or ""
        declaration = declarations.get(declaration_no)
        blocker, rationale, safe_next_step = classify(row, declaration)
        counts[blocker] += 1
        type_counts[row.get("type", "")] += 1
        declaration_counts[declaration_no] += 1
        item = {
            "blocker": blocker,
            "id": row.get("id"),
            "type": row.get("type"),
            "contract_no": row.get("contract_no"),
            "document_no": declaration_no,
            "product": row.get("product"),
            "quantity": row.get("quantity"),
            "unit": row.get("unit"),
            "formal_customs_candidate_count": formal.get("evidence", {}).get("formal_customs_candidate_count", 0),
            "complete_source_group_match_count": len((declaration or {}).get("complete_source_group_matches") or []),
            **nearest_summary(declaration),
            "rationale": rationale,
            "safe_next_step": safe_next_step,
        }
        grouped[declaration_no].append(item)
        details.append(item)

    declaration_summaries = []
    for declaration_no, items in grouped.items():
        declaration = declarations.get(declaration_no, {})
        nearest = nearest_summary(declaration)
        declaration_summaries.append({
            "document_no": declaration_no,
            "contract_no": declaration.get("contract_no") or (items[0].get("contract_no") if items else ""),
            "row_count": len(items),
            "item_count": len(declaration.get("items") or []),
            "verdict": declaration.get("verdict", "missing_formal_customs_evidence"),
            "complete_source_group_match_count": len(declaration.get("complete_source_group_matches") or []),
            **nearest,
        })

    return {
        "status": "formal_evidence_blockers_classified",
        "mode": "read_only_no_db_writes",
        "total": len(details),
        "auto_writable": 0,
        "db_writes": 0,
        "formal_customs_candidate_count": formal.get("evidence", {}).get("formal_customs_candidate_count", 0),
        "by_blocker": [{"blocker": key, "count": value} for key, value in counts.most_common()],
        "by_type": [{"type": key, "count": value} for key, value in type_counts.most_common()],
        "by_declaration": [{"document_no": key, "count": value} for key, value in declaration_counts.most_common()],
        "declarations": declaration_summaries,
        "details": details,
    }


def write_csv(report: dict[str, Any]) -> None:
    fields = [
        "blocker", "type", "contract_no", "document_no", "product", "quantity", "unit",
        "formal_customs_candidate_count", "complete_source_group_match_count",
        "nearest_source_contract_no", "nearest_container_label", "nearest_matched_count",
        "nearest_missing_count", "nearest_extra_count", "nearest_source_file",
        "rationale", "safe_next_step",
    ]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in report["details"]:
            writer.writerow({field: row.get(field, "") for field in fields})


def md_cell(value: Any) -> str:
    if isinstance(value, list):
        text = "; ".join(str(item) for item in value)
    else:
        text = str(value if value is not None else "")
    return text.replace("|", "/").replace("\n", " ")[:180] or "-"


def render_md(report: dict[str, Any]) -> str:
    lines = [
        "# WPS 正式报关材料缺口关闭清单",
        "",
        f"状态：`{report['status']}`",
        f"模式：`{report['mode']}`",
        f"总数：`{report['total']}`",
        f"自动可写：`{report['auto_writable']}`",
        f"正式报关候选：`{report['formal_customs_candidate_count']}`",
        "",
        "## 阻断类型",
        "| 阻断类型 | 数量 |",
        "|---|---:|",
    ]
    for row in report["by_blocker"]:
        lines.append(f"| `{row['blocker']}` | {row['count']} |")

    lines.extend([
        "",
        "## 占位单摘要",
        "| 占位单 | 行数 | 最近来源 | 命中 | 缺失 | 多出 |",
        "|---|---:|---|---:|---:|---:|",
    ])
    for row in report["declarations"]:
        nearest = " / ".join([
            md_cell(row.get("nearest_source_contract_no")),
            md_cell(row.get("nearest_container_label")),
            md_cell(row.get("nearest_source_file")),
        ])
        lines.append(
            "| "
            + " | ".join([
                md_cell(row["document_no"]),
                md_cell(row["item_count"]),
                nearest,
                md_cell(row["nearest_matched_count"]),
                md_cell(row["nearest_missing_count"]),
                md_cell(row["nearest_extra_count"]),
            ])
            + " |"
        )

    lines.extend([
        "",
        "## 明细",
        "| 阻断类型 | 类型 | 占位单 | 商品 | 数量 | 最近来源命中/缺失/多出 | 下一步 |",
        "|---|---|---|---|---:|---|---|",
    ])
    for row in report["details"]:
        nearest_counts = f"{row['nearest_matched_count']}/{row['nearest_missing_count']}/{row['nearest_extra_count']}"
        lines.append(
            "| "
            + " | ".join([
                md_cell(row["blocker"]),
                md_cell(row["type"]),
                md_cell(row["document_no"]),
                md_cell(row["product"]),
                md_cell(row["quantity"]),
                md_cell(nearest_counts),
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
        "formal_customs_candidate_count": report["formal_customs_candidate_count"],
        "by_blocker": report["by_blocker"],
        "out": {
            "json": str(OUT_JSON),
            "csv": str(OUT_CSV),
            "md": str(OUT_MD),
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
