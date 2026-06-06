#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_remaining_closure_register.json
Output: parsed/wps_remaining_action_matrix.{json,csv,md}
Pos: WPS 剩余导入行动矩阵；把关闭台账翻译成补材料/裁决/复跑脚本清单；只读，不写库

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
REGISTER_JSON = PARSED_DIR / "wps_remaining_closure_register.json"
OUT_JSON = PARSED_DIR / "wps_remaining_action_matrix.json"
OUT_CSV = PARSED_DIR / "wps_remaining_action_matrix.csv"
OUT_MD = PARSED_DIR / "wps_remaining_action_matrix.md"

NO_AUTO_ACTION = "当前不能自动写库；收到指定证据/裁决后再新开 dry-run/apply 任务。"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"missing required input: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def compact(value: Any, limit: int = 320) -> str:
    if isinstance(value, list):
        text = "; ".join(str(item) for item in value if item)
    elif isinstance(value, dict):
        text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    else:
        text = str(value if value is not None else "")
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def classify(row: dict[str, Any]) -> dict[str, str]:
    group = row.get("group", "")
    blocker = row.get("blocker", "")

    if group == "cloud_only_original":
        return {
            "priority": "P0",
            "action_lane": "fetch_exact_cloud_original",
            "evidence_owner": "WPS 原件获取",
            "needed_input": row.get("required_to_close", ""),
            "after_input_runner": "python scripts/probe_wps_cloud_only_files.py && python scripts/close_wps_cloud_only_files.py",
        }

    if group == "business_or_formal_decision" and blocker == "awaiting_business_decision":
        return {
            "priority": "P0",
            "action_lane": "sales_store_price_decision",
            "evidence_owner": "业务裁决",
            "needed_input": row.get("required_to_close", ""),
            "after_input_runner": "python scripts/build_wps_remaining_decision_execution_plan.py；随后按裁决写单独 dry-run/apply 脚本",
        }

    if group == "business_or_formal_decision" and blocker == "awaiting_formal_evidence":
        return {
            "priority": "P0",
            "action_lane": "formal_customs_evidence",
            "evidence_owner": "正式报关材料",
            "needed_input": row.get("required_to_close", ""),
            "after_input_runner": "python scripts/extract_wps_export_evidence.py && node scripts/import_wps_export_evidence.js",
        }

    if group == "formal_evidence_required":
        return {
            "priority": "P0",
            "action_lane": "formal_customs_evidence",
            "evidence_owner": "正式报关材料",
            "needed_input": row.get("required_to_close", ""),
            "after_input_runner": "python scripts/analyze_wps_formal_customs_source_gaps.py && python scripts/classify_wps_formal_evidence_blockers.py",
        }

    if group == "source_required_no_candidate":
        if blocker == "pending_contract_placeholder":
            return {
                "priority": "P0",
                "action_lane": "formalize_pending_contract",
                "evidence_owner": "业务裁决 + WPS 原件获取",
                "needed_input": row.get("required_to_close", ""),
                "after_input_runner": "python scripts/analyze_wps_export_sources.py && python scripts/classify_wps_no_candidate_source_blockers.py",
            }
        if blocker == "sales_contract_missing_from_standardized_sources":
            return {
                "priority": "P0",
                "action_lane": "recover_missing_sales_original",
                "evidence_owner": "WPS 原件获取",
                "needed_input": row.get("required_to_close", ""),
                "after_input_runner": "python scripts/analyze_wps_export_sources.py && node scripts/import_wps_export_sources.js",
            }
        return {
            "priority": "P1",
            "action_lane": "confirm_product_alias_or_original_page",
            "evidence_owner": "商品别名裁决 + 原件页证据",
            "needed_input": row.get("required_to_close", ""),
            "after_input_runner": "node scripts/build_wps_source_gap_detail_packet.js && python scripts/classify_wps_no_candidate_source_blockers.py",
        }

    if group in {"candidate_mapping_review", "candidate_conflict_review"}:
        if "price" in blocker:
            return {
                "priority": "P1",
                "action_lane": "price_or_zero_price_decision",
                "evidence_owner": "业务价格裁决",
                "needed_input": row.get("required_to_close", ""),
                "after_input_runner": "python scripts/analyze_wps_candidate_source_mappings.py && python scripts/classify_wps_remaining_candidate_blockers.py",
            }
        if blocker.startswith("store_conflict"):
            return {
                "priority": "P1",
                "action_lane": "store_ownership_decision",
                "evidence_owner": "门店归属裁决 + 原件页证据",
                "needed_input": row.get("required_to_close", ""),
                "after_input_runner": "python scripts/analyze_wps_candidate_source_mappings.py && python scripts/classify_wps_operational_candidate_conflict_blockers.py",
            }
        return {
            "priority": "P1",
            "action_lane": "quantity_split_or_aggregate_evidence",
            "evidence_owner": "数量拆分/聚合证据",
            "needed_input": row.get("required_to_close", ""),
            "after_input_runner": "python scripts/analyze_wps_candidate_source_mappings.py && node scripts/build_wps_source_gap_detail_packet.js",
        }

    if group == "operational_retention_or_cleanup":
        if blocker == "pending_contract_placeholder":
            return {
                "priority": "P0",
                "action_lane": "formalize_pending_contract",
                "evidence_owner": "业务裁决 + WPS 原件获取",
                "needed_input": row.get("required_to_close", ""),
                "after_input_runner": "python scripts/classify_wps_operational_retention_blockers.py",
            }
        if blocker == "nonzero_quantity_zero_price_no_refs":
            return {
                "priority": "P1",
                "action_lane": "price_or_zero_price_decision",
                "evidence_owner": "业务价格裁决",
                "needed_input": row.get("required_to_close", ""),
                "after_input_runner": "python scripts/classify_wps_operational_retention_blockers.py",
            }
        return {
            "priority": "P2",
            "action_lane": "historical_keep_or_cleanup_policy",
            "evidence_owner": "历史保留/清理口径",
            "needed_input": row.get("required_to_close", ""),
            "after_input_runner": "python scripts/classify_wps_operational_retention_blockers.py",
        }

    return {
        "priority": "P2",
        "action_lane": "manual_review",
        "evidence_owner": "人工复核",
        "needed_input": row.get("required_to_close", ""),
        "after_input_runner": "python scripts/build_wps_remaining_closure_register.py",
    }


def build_report() -> dict[str, Any]:
    register = load_json(REGISTER_JSON)
    rows: list[dict[str, Any]] = []
    for index, row in enumerate(register.get("rows") or [], start=1):
        action = classify(row)
        rows.append({
            "id": f"WPS-ACTION-{index:03d}",
            "priority": action["priority"],
            "action_lane": action["action_lane"],
            "evidence_owner": action["evidence_owner"],
            "category": row.get("category", ""),
            "source_group": row.get("group", ""),
            "blocker": row.get("blocker", ""),
            "subject": row.get("subject", ""),
            "contract_no": row.get("contract_no", ""),
            "document_no": row.get("document_no", ""),
            "needed_input": compact(action["needed_input"]),
            "after_input_runner": action["after_input_runner"],
            "current_auto_action": NO_AUTO_ACTION,
            "guardrail": row.get("forbidden_or_guardrail", ""),
            "source_report": row.get("source_report", ""),
        })

    by_lane = Counter(row["action_lane"] for row in rows)
    by_owner = Counter(row["evidence_owner"] for row in rows)
    by_priority = Counter(row["priority"] for row in rows)

    return {
        "status": "remaining_action_matrix_ready",
        "mode": "read_only_no_db_writes",
        "input": str(REGISTER_JSON.relative_to(ROOT)),
        "counts": {
            "total_rows": len(rows),
            "source_register_rows": register.get("counts", {}).get("total_rows"),
            "auto_writable": register.get("auto_writable", 0),
        },
        "by_priority": [{"priority": key, "count": value} for key, value in sorted(by_priority.items())],
        "by_action_lane": [{"action_lane": key, "count": value} for key, value in by_lane.most_common()],
        "by_evidence_owner": [{"evidence_owner": key, "count": value} for key, value in by_owner.most_common()],
        "rows": rows,
    }


def write_csv(report: dict[str, Any]) -> None:
    fields = [
        "id", "priority", "action_lane", "evidence_owner", "category",
        "source_group", "blocker", "subject", "contract_no", "document_no",
        "needed_input", "after_input_runner", "current_auto_action",
        "guardrail", "source_report",
    ]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(report["rows"])


def write_md(report: dict[str, Any]) -> None:
    lines = [
        "# WPS 剩余导入行动矩阵",
        "",
        f"状态：`{report['status']}`",
        f"模式：`{report['mode']}`",
        f"输入：`{report['input']}`",
        f"总行数：`{report['counts']['total_rows']}`",
        f"自动可写：`{report['counts']['auto_writable']}`",
        "",
        "## 优先级",
        "| 优先级 | 数量 |",
        "|---|---:|",
    ]
    lines += [f"| `{item['priority']}` | {item['count']} |" for item in report["by_priority"]]
    lines += ["", "## 行动线", "| 行动线 | 数量 |", "|---|---:|"]
    lines += [f"| `{item['action_lane']}` | {item['count']} |" for item in report["by_action_lane"]]
    lines += ["", "## 责任输入", "| 责任输入 | 数量 |", "|---|---:|"]
    lines += [f"| {item['evidence_owner']} | {item['count']} |" for item in report["by_evidence_owner"]]
    lines += [
        "",
        "## 明细",
        "| ID | 优先级 | 行动线 | 责任输入 | 对象 | 需要补什么 | 收到后复跑 |",
        "|---|---|---|---|---|---|---|",
    ]
    for row in report["rows"]:
        lines.append(
            "| {id} | `{priority}` | `{lane}` | {owner} | {subject} | {needed} | `{runner}` |".format(
                id=row["id"],
                priority=row["priority"],
                lane=row["action_lane"],
                owner=row["evidence_owner"],
                subject=compact(row["subject"], 80).replace("|", "/"),
                needed=compact(row["needed_input"], 120).replace("|", "/"),
                runner=row["after_input_runner"].replace("|", "/"),
            )
        )
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    report = build_report()
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(report)
    write_md(report)
    print(json.dumps({
        "status": report["status"],
        "total_rows": report["counts"]["total_rows"],
        "auto_writable": report["counts"]["auto_writable"],
        "out": {
            "json": str(OUT_JSON),
            "csv": str(OUT_CSV),
            "md": str(OUT_MD),
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
