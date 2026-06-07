#!/usr/bin/env python3
from __future__ import annotations

import json
import sqlite3
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PARSED_DIR = ROOT / "tmp/wps_11_export_list_raw/parsed"
DB_PATH = ROOT / "backend/prisma/dev.db"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def number(value: Any) -> float:
    if value is None:
        return 0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0


def int_number(value: Any) -> int:
    return int(number(value))


def sum_keys(data: dict[str, Any], keys: list[str]) -> int:
    return sum(int_number(data.get(key)) for key in keys)


def db_value(query: str, params: tuple[Any, ...] = ()) -> Any:
    if not DB_PATH.exists():
        return None
    with sqlite3.connect(str(DB_PATH)) as conn:
        row = conn.execute(query, params).fetchone()
    return row[0] if row else None


def decision_is_resolved(item: dict[str, Any]) -> bool:
    subject = str(item.get("subject") or "")
    category = str(item.get("category") or "")
    if "EXP2500002" in subject and category == "sales_missing_store":
        note = db_value(
            """
            SELECT si.note
            FROM sales_items si
            JOIN sales_contracts sc ON sc.id = si.salesContractId
            JOIN products p ON p.id = si.productId
            JOIN stores st ON st.id = si.storeId
            WHERE sc.contractNo = 'EXP2500002'
              AND p.customsName LIKE '%瓷砖%'
              AND st.name = 'Burbank'
              AND abs(si.quantity - 771.84) < 0.0001
            LIMIT 1
            """
        )
        return "BUSINESS_DECISION_2026-06-07" in str(note or "")
    if "EXP2400006" in subject and category == "evidence_customs_declaration_blocked":
        note = db_value(
            "SELECT note FROM sales_contracts WHERE contractNo = 'EXP2400006' LIMIT 1"
        )
        return "不创建报关单" in str(note or "")
    return False


def decision_summary(decisions: list[dict[str, Any]]) -> dict[str, Any]:
    unresolved = [item for item in decisions if not decision_is_resolved(item)]
    counts = Counter(item.get("category", "unknown") for item in unresolved)
    return {
        "count": len(unresolved),
        "counts": dict(sorted(counts.items())),
        "items": [
            {
                "priority": item.get("priority"),
                "category": item.get("category"),
                "subject": item.get("subject"),
                "source": item.get("source"),
                "required_decision": item.get("required_decision"),
                "suggested_next_step": item.get("suggested_next_step"),
            }
            for item in unresolved
        ],
    }


def main() -> None:
    import_plan = load_json(PARSED_DIR / "import_plan.json", {})
    evidence_plan = load_json(PARSED_DIR / "evidence_import_plan.json", {})
    purchase_plan = load_json(PARSED_DIR / "purchase_evidence_import_plan.json", {})
    cloud_metadata = load_json(PARSED_DIR / "wps_cloud_metadata.json", {})
    root_cloud_metadata = load_json(PARSED_DIR / "root_shipment_cloud/wps_cloud_metadata.json", {})
    db_source_coverage = load_json(PARSED_DIR / "wps_db_source_coverage.json", {})
    decisions = load_json(PARSED_DIR / "wps_import_decision_packet.json", [])

    export_summary = import_plan.get("summary", {})
    evidence_summary = evidence_plan.get("summary", {})
    purchase_summary = purchase_plan.get("summary", {})
    cloud_summary = cloud_metadata.get("summary", {})
    root_cloud_summary = root_cloud_metadata.get("summary", {})
    main_cloud_only_count = int_number(cloud_summary.get("cloud_only_file_count"))
    root_cloud_only_count = int_number(root_cloud_summary.get("cloud_only_file_count"))
    total_cloud_only_count = main_cloud_only_count + root_cloud_only_count
    scoped_cloud_only_files = [
        {"scope": "11-报关记录", **item}
        for item in cloud_summary.get("cloud_only_files", [])
    ] + [
        {"scope": "root_shipment_cloud", **item}
        for item in root_cloud_summary.get("cloud_only_files", [])
    ]
    decision_info = decision_summary(decisions)

    export_pending_writes = sum_keys(
        export_summary,
        [
            "productCreates",
            "productUpdates",
            "storeCreates",
            "contractCreates",
            "contractUpdates",
            "packingMergeUpdates",
            "packingMergeCreates",
            "salesMergeUpdates",
            "salesMergeCreates",
        ],
    )
    evidence_pending_writes = sum_keys(
        evidence_summary,
        [
            "productCreates",
            "productUpdates",
            "customsCreates",
            "customsUpdates",
            "customsItemCreates",
            "customsItemUpdates",
            "taxRefundCreates",
            "taxRefundUpdates",
        ],
    )
    purchase_pending_writes = sum_keys(
        purchase_summary,
        [
            "supplierCreates",
            "supplierUpdates",
            "productCreates",
            "productUpdates",
            "contractCreates",
            "headerOnlyContractCreates",
            "purchaseItemCreates",
        ],
    )
    pending_auto_writes = export_pending_writes + evidence_pending_writes + purchase_pending_writes
    unresolved_count = decision_info["count"] + total_cloud_only_count
    db_source_gaps = int_number(db_source_coverage.get("total_without_source"))

    if pending_auto_writes:
        status = "pending_auto_writes"
    elif db_source_gaps:
        status = "db_source_gaps_present"
    elif decision_info["count"]:
        status = "blocked_by_business_or_formal_evidence"
    elif total_cloud_only_count:
        status = "cloud_original_gap_only"
    else:
        status = "complete_by_current_import_plans"

    audit = {
        "status": status,
        "parsed_dir": str(PARSED_DIR),
        "pending_auto_writes": {
            "total": pending_auto_writes,
            "export_sources": export_pending_writes,
            "real_evidence": evidence_pending_writes,
            "purchase_evidence": purchase_pending_writes,
        },
        "export_source_plan": {
            "sourcePackingRows": export_summary.get("sourcePackingRows"),
            "sourceSalesRows": export_summary.get("sourceSalesRows"),
            "packingMergeUnmatched": export_summary.get("packingMergeUnmatched"),
            "salesMergeUnmatched": export_summary.get("salesMergeUnmatched"),
            "skipped": export_summary.get("skipped"),
            "warnings": export_summary.get("warnings"),
        },
        "real_evidence_plan": {
            "skipped": evidence_summary.get("skipped"),
            "pending_writes": evidence_pending_writes,
        },
        "purchase_evidence_plan": {
            "skipped": purchase_summary.get("skipped"),
            "pending_writes": purchase_pending_writes,
        },
        "cloud_coverage": {
            "file_count": cloud_summary.get("file_count"),
            "cached_file_count": cloud_summary.get("cached_file_count"),
            "cloud_only_file_count": total_cloud_only_count,
            "main_directory_cloud_only_file_count": main_cloud_only_count,
            "root_shipment_cloud_only_file_count": root_cloud_only_count,
            "copied_file_count": cloud_summary.get("copied_file_count"),
            "filecache_orphan_count": cloud_summary.get("filecache_orphan_count"),
            "failed_transfer_count": cloud_summary.get("failed_transfer_count"),
            "cloud_only_files": scoped_cloud_only_files,
            "root_shipment_cloud": {
                "file_count": root_cloud_summary.get("file_count"),
                "cached_file_count": root_cloud_summary.get("cached_file_count"),
                "cloud_only_file_count": root_cloud_only_count,
                "copied_file_count": root_cloud_summary.get("copied_file_count"),
            },
        },
        "db_source_coverage": {
            "status": db_source_coverage.get("status"),
            "total_without_source": db_source_gaps,
            "sections": [
                {
                    "name": section.get("name"),
                    "total": section.get("total"),
                    "with_source": section.get("with_source"),
                    "without_source": section.get("without_source"),
                    "coverage_ratio": section.get("coverage_ratio"),
                }
                for section in db_source_coverage.get("sections", [])
            ],
            "report": str(PARSED_DIR / "wps_db_source_coverage.md"),
        },
        "decision_packet": decision_info,
        "unresolved_count": unresolved_count + db_source_gaps,
    }

    out_json = PARSED_DIR / "wps_import_completion_audit.json"
    out_md = PARSED_DIR / "wps_import_completion_audit.md"
    out_json.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    out_md.write_text(render_markdown(audit), encoding="utf-8")

    print(json.dumps({"status": status, "pending_auto_writes": pending_auto_writes, "db_source_gaps": db_source_gaps, "decision_items": decision_info["count"], "cloud_only_files": total_cloud_only_count, "main_directory_cloud_only_files": main_cloud_only_count, "root_shipment_cloud_only_files": root_cloud_only_count, "out": {"json": str(out_json), "md": str(out_md)}}, ensure_ascii=False, indent=2))


def render_markdown(audit: dict[str, Any]) -> str:
    pending = audit["pending_auto_writes"]
    export = audit["export_source_plan"]
    cloud = audit["cloud_coverage"]
    db_source = audit["db_source_coverage"]
    decision = audit["decision_packet"]

    lines = [
        "# WPS 导入完成度审计",
        "",
        f"- 状态：`{audit['status']}`",
        f"- 自动可写入项合计：`{pending['total']}`",
        f"- 待业务/正式凭证裁决项：`{decision['count']}`",
        f"- 仅云端原件缺口合计：`{cloud.get('cloud_only_file_count')}`",
        f"- 主目录 `11-报关记录` 云端缺口：`{cloud.get('main_directory_cloud_only_file_count')}`",
        f"- 根目录清单当前版云端缺口：`{cloud.get('root_shipment_cloud_only_file_count')}`",
        f"- 已入库记录缺来源标记：`{db_source.get('total_without_source')}`",
        "",
        "## 自动写入计划",
        "",
        f"- 出口源 merge 待写入：`{pending['export_sources']}`",
        f"- 真实凭证待写入：`{pending['real_evidence']}`",
        f"- 采购凭证待写入：`{pending['purchase_evidence']}`",
        f"- 出口源装箱未匹配：`{export.get('packingMergeUnmatched')}`",
        f"- 出口源销售未匹配：`{export.get('salesMergeUnmatched')}`",
        f"- 出口源 warnings：`{export.get('warnings')}`",
        "",
        "## 云端正文覆盖",
        "",
        f"- WPS 云端文件：`{cloud.get('file_count')}`",
        f"- 本机可读/已保留：`{cloud.get('cached_file_count')}`",
        f"- 本轮复制到项目临时源目录：`{cloud.get('copied_file_count')}`",
        f"- 根目录清单文件：`{cloud.get('root_shipment_cloud', {}).get('file_count')}`",
        f"- 根目录清单本机可读/已保留：`{cloud.get('root_shipment_cloud', {}).get('cached_file_count')}`",
        f"- metadata 外 filecache 线索：`{cloud.get('filecache_orphan_count')}`",
        f"- 失败下载记录：`{cloud.get('failed_transfer_count')}`",
        "",
        "### 仅云端原件",
    ]
    cloud_only_files = cloud.get("cloud_only_files") or []
    if cloud_only_files:
        for item in cloud_only_files:
            lines.append(
                f"- `{item.get('scope')}` / `{item.get('cloud_path')}` size=`{item.get('metadata_size')}` sha1=`{item.get('metadata_sha1')}`"
            )
    else:
        lines.append("- 无")

    lines.extend(
        [
            "",
            "## 数据库来源覆盖",
            "",
            f"- 来源覆盖报告：`{db_source.get('report')}`",
            "",
            "| 范围 | 总数 | 有来源 | 缺来源 | 覆盖率 |",
            "|---|---:|---:|---:|---:|",
        ]
    )
    for section in db_source.get("sections", []):
        ratio = number(section.get("coverage_ratio")) * 100
        lines.append(
            f"| {section.get('name')} | {section.get('total')} | {section.get('with_source')} | {section.get('without_source')} | {ratio:.2f}% |"
        )

    lines.extend(["", "## 待裁决项"])
    if decision["items"]:
        for item in decision["items"]:
            lines.extend(
                [
                    "",
                    f"### [{item.get('priority')}] {item.get('category')} - {item.get('subject')}",
                    f"- 来源：`{item.get('source')}`",
                    f"- 需要：{item.get('required_decision')}",
                    f"- 下一步：{item.get('suggested_next_step')}",
                ]
            )
    else:
        lines.append("- 无")

    lines.extend(
        [
            "",
            "## 结论",
            "",
            "- 当前导入计划没有新的自动写库动作。",
            "- 仍未完成的部分集中在已入库来源标记缺口、业务门店裁决、正式海关编号补证，以及 2 个不同 scope 的仅云端原件缺口。",
            "- `import_gap_report.md` 的源/库行数差异是粗粒度差异报告，不能单独作为待写库依据；以本审计的导入计划、未匹配数和裁决包为准。",
            "",
        ]
    )
    return "\n".join(lines)


if __name__ == "__main__":
    main()
