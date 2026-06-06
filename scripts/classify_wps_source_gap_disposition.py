#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_source_gap_details.json
Output: parsed/wps_source_gap_disposition.{json,csv,md}
Pos: WPS 已入库来源缺口处置分层；把 223 条缺来源记录按正式凭证、采购歧义、零值/非捷淞、候选映射复核、无候选补源分桶；只读，不写库

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
DETAILS_JSON = PARSED_DIR / "wps_source_gap_details.json"
OUT_JSON = PARSED_DIR / "wps_source_gap_disposition.json"
OUT_CSV = PARSED_DIR / "wps_source_gap_disposition.csv"
OUT_MD = PARSED_DIR / "wps_source_gap_disposition.md"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def is_zeroish(value: Any) -> bool:
    value_number = number(value)
    return value_number is not None and abs(value_number) < 1e-9


def disposition(row: dict[str, Any]) -> tuple[str, str, str]:
    row_type = row.get("type") or ""
    reason = row.get("reason") or ""
    note = row.get("note_excerpt") or ""
    candidates = row.get("candidate_sources") or []

    if row_type.startswith("customs_"):
        return (
            "formal_evidence_required",
            "报关来源缺口只能由正式报关单或整张占位单强匹配来源关闭。",
            "补正式报关单/正式海关编号，或继续保留占位缺口。",
        )

    if row_type.startswith("purchase_"):
        if "ambiguous" in reason:
            return (
                "purchase_ambiguous_evidence_required",
                "采购凭证明细或正文合同号存在歧义，不能自动挂来源。",
                "补唯一采购凭证明细或确认文件名/正文合同号口径。",
            )
        return (
            "purchase_unique_evidence_required",
            "采购明细没有唯一来源匹配。",
            "补唯一采购凭证明细；没有唯一匹配前不写来源 note。",
        )

    if is_zeroish(row.get("quantity")) or is_zeroish(row.get("price")) or any(
        marker in note for marker in ("非捷淞", "拼船", "自行报关", "占位", "not_formal")
    ):
        return (
            "zero_or_operational_review",
            "记录为零数量/零金额、非捷淞报关、拼船或其他操作性历史记录，来源缺口不能用普通 WPS 销售/装箱行硬补。",
            "确认是否保留为操作性历史行，或提供对应来源材料。",
        )

    if candidates:
        return (
            "candidate_mapping_review",
            "存在候选 WPS 来源，但严格字段不能唯一证明当前 DB 行。",
            "复核候选来源与门店/规格/数量/价格映射；唯一后再补来源 note。",
        )

    return (
        "no_candidate_source_required",
        "当前标准化 WPS 源中没有候选来源。",
        "补更强来源材料，或确认该历史行不需要来源 note。",
    )


def build_report() -> dict[str, Any]:
    source_report = load_json(DETAILS_JSON, {})
    details = source_report.get("details", [])
    enriched = []
    counts = Counter()
    by_type = defaultdict(Counter)
    by_contract = defaultdict(Counter)

    for row in details:
        key, rationale, next_action = disposition(row)
        item = {
            **row,
            "disposition": key,
            "disposition_rationale": rationale,
            "next_action": next_action,
            "auto_writable": False,
        }
        enriched.append(item)
        counts[key] += 1
        by_type[row.get("type") or "unknown"][key] += 1
        by_contract[row.get("contract_no") or "(empty)"][key] += 1

    return {
        "status": "source_gap_disposition_classified",
        "total": len(enriched),
        "auto_writable": 0,
        "by_disposition": [
            {"disposition": key, "count": count}
            for key, count in counts.most_common()
        ],
        "by_type": [
            {
                "type": row_type,
                "counts": dict(counter),
                "total": sum(counter.values()),
            }
            for row_type, counter in sorted(by_type.items())
        ],
        "top_contracts": [
            {
                "contract_no": contract_no,
                "total": sum(counter.values()),
                "counts": dict(counter),
            }
            for contract_no, counter in sorted(
                by_contract.items(),
                key=lambda item: (-sum(item[1].values()), item[0]),
            )[:25]
        ],
        "details": enriched,
    }


def write_csv(report: dict[str, Any]) -> None:
    fieldnames = [
        "disposition",
        "type",
        "contract_no",
        "document_no",
        "product",
        "store",
        "quantity",
        "unit",
        "price",
        "reason",
        "source_status",
        "match_count",
        "next_action",
        "note_excerpt",
        "candidate_sources",
    ]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in report["details"]:
            writer.writerow({
                key: "; ".join(row.get(key, [])) if key == "candidate_sources" else row.get(key, "")
                for key in fieldnames
            })


def md_cell(value: Any) -> str:
    text = str(value if value is not None else "")
    return text.replace("|", "/").replace("\n", " ")[:180] or "-"


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# WPS 来源缺口处置分层",
        "",
        f"状态：`{report['status']}`",
        f"总缺口：`{report['total']}`",
        f"自动可写来源 note：`{report['auto_writable']}`",
        "",
        "## 处理口径",
        "- 本报告只读，不写数据库、不改 note。",
        "- 分层只说明下一步处置，不代表缺口已关闭。",
        "- `auto_writable=0` 表示当前仍没有可以安全自动写入的来源 note。",
        "",
        "## 分层计数",
        "| 分层 | 数量 |",
        "|---|---:|",
    ]
    for row in report["by_disposition"]:
        lines.append(f"| `{row['disposition']}` | {row['count']} |")

    lines.extend(["", "## 按记录类型", "| 类型 | 总数 | 分层 |", "|---|---:|---|"])
    for row in report["by_type"]:
        counts = "; ".join(f"{key}={value}" for key, value in row["counts"].items())
        lines.append(f"| `{row['type']}` | {row['total']} | {counts} |")

    lines.extend(["", "## 缺口最多的合同", "| 合同/单号 | 总数 | 分层 |", "|---|---:|---|"])
    for row in report["top_contracts"]:
        counts = "; ".join(f"{key}={value}" for key, value in row["counts"].items())
        lines.append(f"| `{row['contract_no']}` | {row['total']} | {counts} |")

    lines.extend(["", "## 样例", "| 分层 | 类型 | 合同 | 商品 | 门店 | 数量 | 原因 | 下一步 |", "|---|---|---|---|---|---:|---|---|"])
    seen = set()
    for row in report["details"]:
        key = row["disposition"]
        if key in seen:
            continue
        seen.add(key)
        lines.append(
            "| "
            + " | ".join(
                md_cell(row.get(field))
                for field in ["disposition", "type", "contract_no", "product", "store", "quantity", "reason", "next_action"]
            )
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
        "by_disposition": report["by_disposition"],
        "out": {"json": str(OUT_JSON), "csv": str(OUT_CSV), "md": str(OUT_MD)},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
