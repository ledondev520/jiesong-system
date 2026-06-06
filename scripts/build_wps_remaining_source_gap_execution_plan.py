#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/wps_source_gap_disposition.json + candidate/operational/formal review reports
Output: parsed/wps_remaining_source_gap_execution_plan.{json,csv,md}
Pos: WPS 剩余 199 条来源缺口执行队列；逐条列出后续可执行前置条件、禁止动作和下一步证据；只读，不写库

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
DISPOSITION_JSON = PARSED_DIR / "wps_source_gap_disposition.json"
CANDIDATE_JSON = PARSED_DIR / "wps_candidate_source_mapping_review.json"
OPERATIONAL_JSON = PARSED_DIR / "wps_operational_source_gap_review.json"
FORMAL_JSON = PARSED_DIR / "wps_formal_customs_gap_review.json"
OUT_JSON = PARSED_DIR / "wps_remaining_source_gap_execution_plan.json"
OUT_CSV = PARSED_DIR / "wps_remaining_source_gap_execution_plan.csv"
OUT_MD = PARSED_DIR / "wps_remaining_source_gap_execution_plan.md"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def compact(value: Any, limit: int = 220) -> str:
    text = " ".join(str(value or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def base_ref(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id", ""),
        "type": row.get("type", ""),
        "contract_no": row.get("contract_no", ""),
        "document_no": row.get("document_no", ""),
        "product": row.get("product", ""),
        "store": row.get("store", ""),
        "quantity": row.get("quantity", ""),
        "unit": row.get("unit", ""),
        "price": row.get("price", ""),
        "reason": row.get("reason", ""),
        "candidate_count": row.get("match_count", row.get("candidate_count", "")),
    }


def operational_plan(row: dict[str, Any], operational: dict[str, Any] | None) -> dict[str, Any]:
    verdict = (operational or {}).get("verdict", "operational_review")
    flags = (operational or {}).get("flags", [])
    refs = {
        "inventory_refs": (operational or {}).get("inventory_refs", 0),
        "customs_refs": (operational or {}).get("customs_refs", 0),
    }
    if verdict == "candidate_conflict_review":
        family = "candidate_conflict_review"
        required = [
            "复核候选来源是否已经证明其他 DB 行",
            "只有候选源唯一、未被消费且字段强一致时，才能补来源 note",
        ]
        forbidden = ["不能因为该行价格为 0 或无引用就删除", "不能复用已挂到其他 DB 行的来源 note"]
    elif verdict == "pending_placeholder_review":
        family = "pending_placeholder_review"
        required = ["确认 PENDING 占位合同是否仍需保留", "如要关闭来源缺口，提供对应正式合同或正式业务材料"]
        forbidden = ["不能自动删除 PENDING 占位行", "不能把占位合同号当正式合同号"]
    elif verdict in ("zero_quantity_price_no_ref_review", "zero_price_no_ref_review"):
        family = "operational_keep_or_cleanup_decision"
        required = ["确认该历史行是保留为操作/报关/成本行，还是按业务口径清理", "如保留且需要闭环，提供能证明该行的来源材料"]
        forbidden = ["不能自动删除", "不能用相似商品或同合同行硬补来源 note"]
    else:
        family = "operational_review"
        required = ["补来源材料，或确认该历史操作行继续保留为无来源历史行"]
        forbidden = ["不能自动改业务字段", "不能自动删除"]
    return {
        "action_family": family,
        "evidence_state": verdict,
        "required_inputs": required,
        "forbidden_actions": forbidden,
        "safe_next_command": "人工确认后新建独立 apply task；当前只读。",
        "refs": refs,
        "notes": compact((operational or {}).get("verdict_rationale") or row.get("disposition_rationale")),
        "flags": flags,
    }


def candidate_plan(row: dict[str, Any], candidate: dict[str, Any] | None) -> dict[str, Any]:
    verdict = (candidate or {}).get("verdict", "candidate_mapping_review")
    mismatches = (candidate or {}).get("mismatches", [])
    attached = 0
    for source in (candidate or {}).get("candidate_sources", []):
        attached += len(source.get("attached_elsewhere") or [])
    if verdict == "candidate_already_attached_elsewhere":
        required = ["找到未被其他 DB note 消费的独立来源，或确认当前 DB 行应合并/删除/保留"]
        forbidden = ["不能把同一个 WPS 源行重复挂到当前行", "不能迁移 note 后不处理原挂接行"]
    elif verdict == "multi_candidate_manual_review":
        required = ["在多个候选来源中指定唯一来源，并说明选择依据", "确认商品、数量、价格、门店或装箱锚点完全一致"]
        forbidden = ["不能自动选择第一个候选", "不能只凭合同号和商品名挂 note"]
    elif verdict in ("hard_field_mismatch", "soft_field_mismatch"):
        required = ["补更强来源材料或确认 DB 行业务字段需要另行修正", "修正前先生成单独 dry-run"]
        forbidden = ["不能在字段冲突时补来源 note", "不能为了匹配来源而静默改数量/商品"]
    else:
        required = ["复核为什么原严格匹配未命中", "确认候选源唯一、未消费且字段强一致后再写库"]
        forbidden = ["不能跳过 dry-run", "不能不备份数据库直接补 note"]
    return {
        "action_family": "candidate_mapping_review",
        "evidence_state": verdict,
        "required_inputs": required,
        "forbidden_actions": forbidden,
        "safe_next_command": "先扩展候选复核脚本或新建 note-only dry-run；通过后再 apply。",
        "refs": {
            "attached_elsewhere_count": attached,
            "candidate_count": (candidate or {}).get("candidate_count", row.get("match_count", "")),
            "mismatches": mismatches,
        },
        "notes": compact((candidate or {}).get("verdict_rationale") or row.get("disposition_rationale")),
        "flags": [],
    }


def formal_plan(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "action_family": "formal_evidence_required",
        "evidence_state": "missing_formal_customs_evidence",
        "required_inputs": [
            "正式报关单原件或正式 18 位海关编号",
            "正式报关明细商品、HS、数量、金额、毛重、净重",
            "能证明该正式材料归属当前合同/占位单的文件路径",
        ],
        "forbidden_actions": [
            "不能用 PENDING/BGNDING 占位号替代正式海关编号",
            "不能用 invoice_no 或旧空运底稿推断正式报关单",
            "不能用近似装箱源集合补正式报关来源 note",
        ],
        "safe_next_command": "补正式材料后重跑 extract/import_wps_export_evidence dry-run，再单独 apply。",
        "refs": {},
        "notes": "现有 formal customs 复核显示 auto_writable=0。",
        "flags": [],
    }


def no_candidate_plan(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "action_family": "source_required_no_candidate",
        "evidence_state": row.get("reason", "no_candidate_source_required"),
        "required_inputs": [
            "提供更强 WPS 原件、正式附件或业务材料",
            "或确认该历史行不需要来源 note 并保留为待审计缺口",
        ],
        "forbidden_actions": [
            "不能用同合同相似商品硬补来源",
            "不能用已经被其他 DB 行消费的来源",
            "不能凭数量接近自动改库",
        ],
        "safe_next_command": "补材料后重跑来源缺口明细包和对应 strict alias/all-source dry-run。",
        "refs": {"candidate_count": row.get("match_count", 0)},
        "notes": compact(row.get("disposition_rationale")),
        "flags": [],
    }


def action_for(row: dict[str, Any], candidate_by_id: dict[str, dict[str, Any]], operational_by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    disposition = row.get("disposition")
    if disposition == "zero_or_operational_review":
        return operational_plan(row, operational_by_id.get(row.get("id", "")))
    if disposition == "candidate_mapping_review":
        return candidate_plan(row, candidate_by_id.get(row.get("id", "")))
    if disposition == "formal_evidence_required":
        return formal_plan(row)
    if disposition == "no_candidate_source_required":
        return no_candidate_plan(row)
    return {
        "action_family": "unknown_review",
        "evidence_state": disposition or "",
        "required_inputs": ["复核该行分层规则"],
        "forbidden_actions": ["不能自动写库"],
        "safe_next_command": "先修复分层报告。",
        "refs": {},
        "notes": "",
        "flags": [],
    }


def build_report() -> dict[str, Any]:
    disposition = load_json(DISPOSITION_JSON, {})
    candidate = load_json(CANDIDATE_JSON, {})
    operational = load_json(OPERATIONAL_JSON, {})
    formal = load_json(FORMAL_JSON, {})
    candidate_by_id = {row.get("id", ""): row for row in candidate.get("details", [])}
    operational_by_id = {row.get("id", ""): row for row in operational.get("details", [])}

    rows = []
    for index, row in enumerate(disposition.get("details", []), start=1):
        action = action_for(row, candidate_by_id, operational_by_id)
        rows.append({
            "queue_no": index,
            **base_ref(row),
            "disposition": row.get("disposition", ""),
            "action_family": action["action_family"],
            "evidence_state": action["evidence_state"],
            "required_inputs": action["required_inputs"],
            "forbidden_actions": action["forbidden_actions"],
            "safe_next_command": action["safe_next_command"],
            "refs": action["refs"],
            "flags": action["flags"],
            "notes": action["notes"],
            "auto_writable": False,
        })

    by_family = Counter(row["action_family"] for row in rows)
    by_disposition = Counter(row["disposition"] for row in rows)
    by_contract: dict[str, Counter[str]] = defaultdict(Counter)
    for row in rows:
        by_contract[row["contract_no"]][row["action_family"]] += 1

    return {
        "status": "remaining_source_gap_execution_plan_ready",
        "mode": "read_only_no_apply",
        "source_total": disposition.get("total", len(rows)),
        "row_count": len(rows),
        "auto_writable": 0,
        "db_writes": 0,
        "source_reports": {
            "disposition_status": disposition.get("status"),
            "candidate_status": candidate.get("status"),
            "operational_status": operational.get("status"),
            "formal_status": formal.get("status"),
            "formal_auto_writable": formal.get("auto_writable"),
        },
        "by_action_family": [{"action_family": key, "count": value} for key, value in by_family.most_common()],
        "by_disposition": [{"disposition": key, "count": value} for key, value in by_disposition.most_common()],
        "top_contracts": [
            {"contract_no": contract, "total": sum(counter.values()), "actions": dict(counter)}
            for contract, counter in sorted(by_contract.items(), key=lambda item: (-sum(item[1].values()), item[0]))[:30]
        ],
        "rows": rows,
    }


def write_csv(report: dict[str, Any]) -> None:
    fields = [
        "queue_no", "type", "id", "contract_no", "document_no", "product", "store",
        "quantity", "unit", "price", "disposition", "action_family", "evidence_state",
        "required_inputs", "forbidden_actions", "safe_next_command", "notes",
    ]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in report["rows"]:
            writer.writerow({
                key: (
                    " | ".join(row.get(key, []))
                    if key in ("required_inputs", "forbidden_actions")
                    else row.get(key, "")
                )
                for key in fields
            })


def render_md(report: dict[str, Any]) -> str:
    def cell(value: Any) -> str:
        text = str(value if value not in (None, "") else "-")
        return text.replace("|", "\\|").replace("\n", " ")

    def display(value: Any) -> str:
        return "-" if value in (None, "") else str(value)

    lines = [
        "# WPS 剩余来源缺口执行队列",
        "",
        f"状态：`{report['status']}`",
        f"模式：`{report['mode']}`",
        f"总行数：`{report['row_count']}`",
        "自动可写：`0`",
        "数据库写入：`0`",
        "",
        "## 口径",
        "- 本报告只读，不写数据库、不改 note、不删除记录。",
        "- 每一行都给出后续执行前置条件和禁止动作，避免把业务判断或弱证据伪装成文件事实。",
        "- `auto_writable=0` 仍成立；后续 apply 必须新建独立 dry-run/apply task。",
        "",
        "## 按动作族",
        "| 动作族 | 数量 |",
        "|---|---:|",
    ]
    for item in report["by_action_family"]:
        lines.append(f"| `{item['action_family']}` | {item['count']} |")
    lines.extend([
        "",
        "## 合同 Top",
        "| 合同/单号 | 总数 | 动作族 |",
        "|---|---:|---|",
    ])
    for item in report["top_contracts"]:
        actions = "; ".join(f"{key}={value}" for key, value in item["actions"].items())
        lines.append(f"| {cell(item['contract_no'])} | {item['total']} | {cell(actions)} |")
    lines.extend([
        "",
        "## 逐条队列",
        "| # | 动作族 | 类型 | 合同/单号 | 商品 | 门店 | 数量 | 必要输入 | 禁止动作 |",
        "|---:|---|---|---|---|---|---:|---|---|",
    ])
    for row in report["rows"]:
        required = compact(" | ".join(row["required_inputs"]), 160)
        forbidden = compact(" | ".join(row["forbidden_actions"]), 160)
        lines.append(
            f"| {row['queue_no']} | `{row['action_family']}` | `{row['type']}` | {cell(row['contract_no'] or row['document_no'])} | {cell(row['product'])} | {cell(row['store'])} | {cell(display(row['quantity']))} | {cell(required)} | {cell(forbidden)} |"
        )
    return "\n".join(lines) + "\n"


def main() -> None:
    report = build_report()
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(report)
    OUT_MD.write_text(render_md(report), encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "row_count": report["row_count"],
        "auto_writable": report["auto_writable"],
        "db_writes": report["db_writes"],
        "by_action_family": report["by_action_family"],
        "out": {"json": str(OUT_JSON), "csv": str(OUT_CSV), "md": str(OUT_MD)},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
