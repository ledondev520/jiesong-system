#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed WPS blocker reports + completion audit + decision/cloud reports
Output: parsed/wps_remaining_closure_register.{json,csv,md}
Pos: WPS 剩余导入关闭总台账；汇总来源缺口、裁决项和 cloud-only 原件；只读，不写库

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
OUT_JSON = PARSED_DIR / "wps_remaining_closure_register.json"
OUT_CSV = PARSED_DIR / "wps_remaining_closure_register.csv"
OUT_MD = PARSED_DIR / "wps_remaining_closure_register.md"

SOURCE_REPORTS = [
    ("candidate_mapping_review", PARSED_DIR / "wps_remaining_candidate_blockers.json"),
    ("source_required_no_candidate", PARSED_DIR / "wps_no_candidate_source_blockers.json"),
    ("candidate_conflict_review", PARSED_DIR / "wps_operational_candidate_conflict_blockers.json"),
    ("formal_evidence_required", PARSED_DIR / "wps_formal_evidence_blockers.json"),
    ("operational_retention_or_cleanup", PARSED_DIR / "wps_operational_retention_blockers.json"),
]
COMPLETION_JSON = PARSED_DIR / "wps_import_completion_audit.json"
DECISION_JSON = PARSED_DIR / "wps_remaining_decision_execution_plan.json"
CLOUD_PROBE_JSON = PARSED_DIR / "wps_cloud_only_probe.json"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def compact(value: Any, limit: int = 240) -> str:
    if isinstance(value, list):
        text = "; ".join(str(item) for item in value)
    elif isinstance(value, dict):
        text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    else:
        text = str(value if value is not None else "")
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def source_rows() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rows: list[dict[str, Any]] = []
    reports: list[dict[str, Any]] = []
    for group, path in SOURCE_REPORTS:
        report = load_json(path, {})
        details = report.get("details") or []
        reports.append({
            "group": group,
            "path": str(path.relative_to(ROOT)),
            "status": report.get("status"),
            "total": len(details),
            "reported_total": report.get("total"),
            "auto_writable": report.get("auto_writable", 0),
            "by_blocker": report.get("by_blocker", []),
        })
        for item in details:
            rows.append({
                "category": "db_source_gap",
                "group": group,
                "blocker": item.get("blocker") or item.get("evidence_state") or "",
                "type": item.get("type", ""),
                "contract_no": item.get("contract_no", ""),
                "document_no": item.get("document_no", ""),
                "subject": " / ".join(
                    part for part in [
                        str(item.get("contract_no") or ""),
                        str(item.get("document_no") or ""),
                        str(item.get("product") or ""),
                        str(item.get("store") or ""),
                    ]
                    if part
                ),
                "quantity": item.get("quantity", ""),
                "unit": item.get("unit", ""),
                "price": item.get("price", ""),
                "required_to_close": compact(item.get("safe_next_step") or item.get("rationale") or ""),
                "forbidden_or_guardrail": "不能自动写库；不能用弱证据补来源 note、删除或改业务字段。",
                "source_report": str(path.relative_to(ROOT)),
                "auto_writable": 0,
            })
    return rows, reports


def decision_rows() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    report = load_json(DECISION_JSON, {})
    rows: list[dict[str, Any]] = []
    for plan in report.get("plans") or []:
        if str(plan.get("status", "")).startswith("closed_"):
            continue
        required_inputs = []
        options = []
        for option in plan.get("decision_options") or []:
            options.append(option.get("option"))
            required_inputs.extend(option.get("required_input") or [])
        rows.append({
            "category": "decision_item",
            "group": "business_or_formal_decision",
            "blocker": plan.get("status", ""),
            "type": "remaining_decision",
            "contract_no": "",
            "document_no": "",
            "subject": plan.get("subject", ""),
            "quantity": "",
            "unit": "",
            "price": "",
            "required_to_close": compact(sorted(set(required_inputs)) or options),
            "forbidden_or_guardrail": "没有业务裁决或正式材料前不执行 apply；只读执行方案不是写库授权。",
            "source_report": str(DECISION_JSON.relative_to(ROOT)),
            "auto_writable": 0,
        })
    return rows, {
        "status": report.get("status"),
        "mode": report.get("mode"),
        "count": len(rows),
        "summary": report.get("summary", {}),
    }


def cloud_rows() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    report = load_json(CLOUD_PROBE_JSON, {})
    rows: list[dict[str, Any]] = []
    for item in report.get("items") or []:
        rows.append({
            "category": "cloud_original_gap",
            "group": "cloud_only_original",
            "blocker": item.get("decision", "no_exact_local_file"),
            "type": "cloud_file",
            "contract_no": "",
            "document_no": "",
            "subject": item.get("cloud_path", ""),
            "quantity": "",
            "unit": "",
            "price": "",
            "required_to_close": compact([
                f"scope={item.get('scope')}",
                f"size={item.get('metadata_size')}",
                f"sha1={item.get('metadata_sha1')}",
                "必须取得 SHA1 精确匹配本机文件后才能 close",
            ]),
            "forbidden_or_guardrail": "不能用同名、旧版本、旧缓存或相似文件替代 cloud metadata 指向的原件。",
            "source_report": str(CLOUD_PROBE_JSON.relative_to(ROOT)),
            "auto_writable": 0,
        })
    return rows, {
        "status": report.get("status"),
        "target_count": report.get("target_count", 0),
        "ready_to_copy_count": report.get("ready_to_copy_count", 0),
        "count": len(rows),
    }


def build_report() -> dict[str, Any]:
    completion = load_json(COMPLETION_JSON, {})
    source, source_report_summaries = source_rows()
    decisions, decision_summary = decision_rows()
    clouds, cloud_summary = cloud_rows()
    rows = source + decisions + clouds

    by_category = Counter(row["category"] for row in rows)
    by_group = Counter(row["group"] for row in rows)
    by_blocker = Counter(f"{row['group']}::{row['blocker']}" for row in rows)
    source_gap_total = sum(report["total"] for report in source_report_summaries)
    db_source_gaps = int((completion.get("db_source_coverage") or {}).get("total_without_source") or 0)
    decision_count = decision_summary["count"]
    cloud_count = cloud_summary["count"]

    status = "remaining_closure_register_ready"
    if source_gap_total != db_source_gaps:
        status = "remaining_closure_register_count_mismatch"
    if decision_count != int(((completion.get("decision_packet") or {}).get("count") or decision_count)):
        status = "remaining_closure_register_count_mismatch"
    if cloud_count != int(((completion.get("cloud_coverage") or {}).get("cloud_only_file_count") or cloud_count)):
        status = "remaining_closure_register_count_mismatch"

    return {
        "status": status,
        "mode": "read_only_no_db_writes",
        "auto_writable": 0,
        "db_writes": 0,
        "counts": {
            "total_rows": len(rows),
            "db_source_gap_rows": source_gap_total,
            "completion_audit_db_source_gaps": db_source_gaps,
            "decision_items": decision_count,
            "completion_audit_decision_items": (completion.get("decision_packet") or {}).get("count"),
            "cloud_original_gaps": cloud_count,
            "completion_audit_cloud_only_files": (completion.get("cloud_coverage") or {}).get("cloud_only_file_count"),
            "pending_auto_writes": (completion.get("pending_auto_writes") or {}).get("total"),
        },
        "by_category": [{"category": key, "count": value} for key, value in by_category.most_common()],
        "by_group": [{"group": key, "count": value} for key, value in by_group.most_common()],
        "top_blockers": [{"blocker": key, "count": value} for key, value in by_blocker.most_common(30)],
        "source_reports": source_report_summaries,
        "decision_summary": decision_summary,
        "cloud_summary": cloud_summary,
        "rows": rows,
    }


def write_csv(report: dict[str, Any]) -> None:
    fields = [
        "category", "group", "blocker", "type", "contract_no", "document_no",
        "subject", "quantity", "unit", "price", "required_to_close",
        "forbidden_or_guardrail", "source_report", "auto_writable",
    ]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in report["rows"]:
            writer.writerow({field: row.get(field, "") for field in fields})


def md_cell(value: Any) -> str:
    return compact(value, 180).replace("|", "/") or "-"


def render_md(report: dict[str, Any]) -> str:
    counts = report["counts"]
    lines = [
        "# WPS 剩余导入关闭总台账",
        "",
        f"状态：`{report['status']}`",
        f"模式：`{report['mode']}`",
        f"自动可写：`{report['auto_writable']}`",
        "",
        "## 总数校验",
        f"- 总台账行：`{counts['total_rows']}`",
        f"- DB 来源缺口：`{counts['db_source_gap_rows']}` / 完成度审计 `{counts['completion_audit_db_source_gaps']}`",
        f"- 裁决项：`{counts['decision_items']}` / 完成度审计 `{counts['completion_audit_decision_items']}`",
        f"- cloud-only 原件：`{counts['cloud_original_gaps']}` / 完成度审计 `{counts['completion_audit_cloud_only_files']}`",
        f"- 自动待写入：`{counts['pending_auto_writes']}`",
        "",
        "## 类别",
        "| 类别 | 数量 |",
        "|---|---:|",
    ]
    for row in report["by_category"]:
        lines.append(f"| `{row['category']}` | {row['count']} |")
    lines.extend(["", "## 分组", "| 分组 | 数量 |", "|---|---:|"])
    for row in report["by_group"]:
        lines.append(f"| `{row['group']}` | {row['count']} |")
    lines.extend([
        "",
        "## 明细",
        "| 类别 | 分组 | 阻断 | 对象 | 关闭条件 | 禁止动作 |",
        "|---|---|---|---|---|---|",
    ])
    for row in report["rows"]:
        lines.append(
            "| "
            + " | ".join([
                md_cell(row["category"]),
                md_cell(row["group"]),
                md_cell(row["blocker"]),
                md_cell(row["subject"]),
                md_cell(row["required_to_close"]),
                md_cell(row["forbidden_or_guardrail"]),
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
        "auto_writable": report["auto_writable"],
        "counts": report["counts"],
        "out": {
            "json": str(OUT_JSON),
            "csv": str(OUT_CSV),
            "md": str(OUT_MD),
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
