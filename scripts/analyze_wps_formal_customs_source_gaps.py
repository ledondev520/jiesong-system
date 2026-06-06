#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: backend/prisma/dev.db + parsed WPS source/evidence CSV/JSON files
Output: parsed/wps_formal_customs_gap_review.{json,csv,md}
Pos: WPS 正式报关来源缺口只读复核；核对占位报关单、装箱源集合和正式凭证候选，证明哪些缺口不能自动写库

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import csv
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "backend/prisma/dev.db"
PARSED_DIR = ROOT / "tmp/wps_11_export_list_raw/parsed"
DISPOSITION_JSON = PARSED_DIR / "wps_source_gap_disposition.json"
PREFERRED_PACKING_CSV = PARSED_DIR / "preferred_packing_items.csv"
PACKING_CSV = PARSED_DIR / "packing_items.csv"
EVIDENCE_MAPPING_CSV = PARSED_DIR / "evidence_db_mapping.csv"
EVIDENCE_EXTRACTS_CSV = PARSED_DIR / "evidence_extracts.csv"
ATTACHMENT_INVENTORY_CSV = PARSED_DIR / "attachment_inventory.csv"
OUT_JSON = PARSED_DIR / "wps_formal_customs_gap_review.json"
OUT_CSV = PARSED_DIR / "wps_formal_customs_gap_review.csv"
OUT_MD = PARSED_DIR / "wps_formal_customs_gap_review.md"

TARGET_CONTRACT_HINTS = {"EXP260005", "EXP260006", "EXP260007", "PENDING-威斯敏"}
TARGET_TEXT_HINTS = {"威斯敏", "Westminster", "EXP260005", "EXP260006", "EXP260007", "BGNDING"}
FORMAL_TEXT_HINTS = {"报关", "海关", "出口退税联", "退税", "放行", "关单", "declaration"}
FORMAL_CATEGORIES = {"customs_declaration", "tax_refund_invoice_list", "tax_refund"}


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = []
        for row in reader:
            rows.append({
                (key or "").replace("\ufeff", ""): (value or "").strip()
                for key, value in row.items()
            })
        return rows


def number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace(",", "").replace("￥", "").replace("¥", ""))
    except ValueError:
        return None


def quantity_text(value: Any) -> str:
    value_number = number(value)
    if value_number is None:
        return ""
    return f"{value_number:.4f}".rstrip("0").rstrip(".")


def normalize_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"\s+", "", text)
    text = text.replace("*", "").replace("（", "(").replace("）", ")")
    text = re.sub(r"(店|store)$", "", text)
    return text


def item_key(name: Any, quantity: Any, unit: Any) -> str:
    return "|".join([normalize_text(name), quantity_text(quantity), normalize_text(unit)])


def item_label(row: dict[str, Any], *, db: bool = False) -> str:
    if db:
        return f"{row.get('customsName')} / {quantity_text(row.get('quantity'))} {row.get('unit') or ''}".strip()
    return f"{row.get('product_name')} / {quantity_text(row.get('quantity'))} {row.get('unit') or ''}".strip()


def multiset(rows: list[dict[str, Any]], *, db: bool = False) -> Counter[str]:
    result: Counter[str] = Counter()
    for row in rows:
        if db:
            key = item_key(row.get("customsName"), row.get("quantity"), row.get("unit"))
        else:
            key = item_key(row.get("product_name"), row.get("quantity"), row.get("unit"))
        if key.split("|")[1]:
            result[key] += 1
    return result


def diff_multiset(left: Counter[str], right: Counter[str]) -> tuple[list[str], list[str], list[str]]:
    intersection: list[str] = []
    missing: list[str] = []
    extra: list[str] = []
    keys = sorted(set(left) | set(right))
    for key in keys:
        left_count = left.get(key, 0)
        right_count = right.get(key, 0)
        if left_count and right_count:
            intersection.extend([key] * min(left_count, right_count))
        if left_count > right_count:
            missing.extend([key] * (left_count - right_count))
        if right_count > left_count:
            extra.extend([key] * (right_count - left_count))
    return intersection, missing, extra


def db_items_by_declaration() -> dict[str, dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        declarations = conn.execute(
            """
            select
              cd.id,
              cd.declarationNo,
              cd.note,
              sc.contractNo
            from customs_declarations cd
            join sales_contracts sc on sc.id = cd.salesContractId
            where cd.declarationNo like 'BGNDING-%'
            order by cd.declarationNo
            """
        ).fetchall()
        result: dict[str, dict[str, Any]] = {}
        for declaration in declarations:
            items = conn.execute(
                """
                select
                  itemNo,
                  customsName,
                  hsCode,
                  quantity,
                  unit,
                  unitPrice,
                  totalPrice
                from customs_declaration_items
                where customsDeclarationId = ?
                order by itemNo
                """,
                (declaration["id"],),
            ).fetchall()
            result[declaration["declarationNo"]] = {
                "id": declaration["id"],
                "declaration_no": declaration["declarationNo"],
                "contract_no": declaration["contractNo"],
                "note": declaration["note"] or "",
                "items": [dict(row) for row in items],
            }
        return result


def disposition_targets() -> list[dict[str, Any]]:
    report = read_json(DISPOSITION_JSON, {})
    details = report.get("details") or []
    return [
        row
        for row in details
        if row.get("disposition") == "formal_evidence_required"
    ]


def group_packing_rows(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not row.get("source_file"):
            continue
        if number(row.get("quantity")) is None:
            continue
        key = "|".join([
            row.get("contract_no") or "",
            row.get("source_file") or "",
            row.get("container_label") or "",
        ])
        groups.setdefault(key, {
            "contract_no": row.get("contract_no") or "",
            "source_file": row.get("source_file") or "",
            "container_label": row.get("container_label") or "",
            "rows": [],
        })
        groups[key]["rows"].append(row)
    return list(groups.values())


def relevant_group(group: dict[str, Any], db_set: Counter[str]) -> bool:
    text = " ".join([
        group.get("contract_no") or "",
        group.get("source_file") or "",
        group.get("container_label") or "",
    ])
    if any(hint.lower() in text.lower() for hint in TARGET_TEXT_HINTS):
        return True
    source_set = multiset(group["rows"])
    intersection, _, _ = diff_multiset(db_set, source_set)
    return len(intersection) > 0


def nearest_groups(groups: list[dict[str, Any]], db_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    db_set = multiset(db_rows, db=True)
    candidates: list[dict[str, Any]] = []
    for group in groups:
        source_set = multiset(group["rows"])
        intersection, missing, extra = diff_multiset(db_set, source_set)
        if not relevant_group(group, db_set):
            continue
        score = (len(intersection) * 10) - len(missing) - min(len(extra), 12)
        candidates.append({
            "contract_no": group["contract_no"],
            "source_file": group["source_file"],
            "container_label": group["container_label"],
            "row_count": len(group["rows"]),
            "score": score,
            "matched_count": len(intersection),
            "missing_count": len(missing),
            "extra_count": len(extra),
            "matched_items": intersection[:20],
            "missing_items": missing[:20],
            "extra_items": extra[:20],
        })
    candidates.sort(key=lambda row: (-row["matched_count"], row["missing_count"], row["extra_count"], -row["score"], row["source_file"]))
    return candidates[:10]


def strict_item_candidates(rows: list[dict[str, str]], db_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_key: defaultdict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        by_key[item_key(row.get("product_name"), row.get("quantity"), row.get("unit"))].append(row)

    result = []
    for db_row in db_rows:
        key = item_key(db_row.get("customsName"), db_row.get("quantity"), db_row.get("unit"))
        matches = by_key.get(key, [])
        narrowed = [
            row for row in matches
            if any(hint.lower() in " ".join([row.get("contract_no", ""), row.get("source_file", ""), row.get("container_label", "")]).lower() for hint in TARGET_TEXT_HINTS)
        ]
        result.append({
            "db_item": item_label(db_row, db=True),
            "strict_candidate_count": len(narrowed),
            "strict_candidates": [
                {
                    "contract_no": row.get("contract_no"),
                    "source_file": row.get("source_file"),
                    "sheet": row.get("sheet"),
                    "row": row.get("row"),
                    "store": row.get("store"),
                    "container_label": row.get("container_label"),
                    "product_name": row.get("product_name"),
                    "quantity": row.get("quantity"),
                    "unit": row.get("unit"),
                }
                for row in narrowed[:12]
            ],
        })
    return result


def contains_any(text: str, hints: set[str]) -> bool:
    lower = text.lower()
    return any(hint.lower() in lower for hint in hints)


def evidence_candidates() -> dict[str, Any]:
    mapping = read_csv(EVIDENCE_MAPPING_CSV)
    extracts = read_csv(EVIDENCE_EXTRACTS_CSV)
    attachments = read_csv(ATTACHMENT_INVENTORY_CSV)

    def compact(row: dict[str, str], fields: list[str]) -> dict[str, str]:
        return {field: row.get(field, "") for field in fields if row.get(field, "")}

    formal_rows: list[dict[str, str]] = []
    related_rows: list[dict[str, str]] = []

    for row in mapping:
        text = " ".join(str(value) for value in row.values())
        if row.get("category") in FORMAL_CATEGORIES or contains_any(text, FORMAL_TEXT_HINTS):
            if contains_any(text, TARGET_TEXT_HINTS):
                formal_rows.append(compact(row, [
                    "relative_path", "category", "readiness", "contract_no", "matched_contract_no",
                    "declaration_no", "mapping_action", "mapping_issues",
                ]))
        if contains_any(text, TARGET_TEXT_HINTS):
            related_rows.append(compact(row, [
                "relative_path", "category", "readiness", "contract_no", "matched_contract_no",
                "declaration_no", "mapping_action", "mapping_issues",
            ]))

    for row in extracts:
        text = " ".join(str(value) for value in row.values())
        if (row.get("category") in FORMAL_CATEGORIES or contains_any(text, FORMAL_TEXT_HINTS)) and contains_any(text, TARGET_TEXT_HINTS):
            formal_rows.append(compact(row, [
                "relative_path", "category", "status", "extraction_method", "declaration_no",
                "contract_no", "readiness", "issues",
            ]))
        if contains_any(text, TARGET_TEXT_HINTS):
            related_rows.append(compact(row, [
                "relative_path", "category", "status", "extraction_method", "declaration_no",
                "contract_no", "readiness", "issues",
            ]))

    for row in attachments:
        text = " ".join(str(value) for value in row.values())
        if contains_any(text, TARGET_TEXT_HINTS):
            related_rows.append(compact(row, [
                "relative_path", "file_name", "suffix", "category", "inferred_contracts",
                "purchase_contract_nos", "size_bytes",
            ]))
            if row.get("category") in FORMAL_CATEGORIES or contains_any(text, FORMAL_TEXT_HINTS):
                formal_rows.append(compact(row, [
                    "relative_path", "file_name", "suffix", "category", "inferred_contracts",
                    "purchase_contract_nos", "size_bytes",
                ]))

    def dedupe(rows: list[dict[str, str]]) -> list[dict[str, str]]:
        seen = set()
        output = []
        for row in rows:
            key = json.dumps(row, ensure_ascii=False, sort_keys=True)
            if key in seen:
                continue
            seen.add(key)
            output.append(row)
        return output

    formal = dedupe(formal_rows)
    related = dedupe(related_rows)
    return {
        "formal_customs_candidate_count": len(formal),
        "formal_customs_candidates": formal[:50],
        "related_file_candidate_count": len(related),
        "related_file_candidates": related[:80],
    }


def verdict_for(declaration_review: dict[str, Any], evidence: dict[str, Any]) -> str:
    exact = declaration_review["complete_source_group_matches"]
    if exact:
        return "complete_source_group_manual_review"
    if evidence["formal_customs_candidate_count"] > 0:
        return "formal_candidate_manual_review"
    return "no_complete_placeholder_source_match_and_no_formal_evidence_found"


def build_report() -> dict[str, Any]:
    target_rows = disposition_targets()
    by_declaration = db_items_by_declaration()
    preferred_groups = group_packing_rows(read_csv(PREFERRED_PACKING_CSV))
    all_packing_rows = read_csv(PACKING_CSV)
    evidence = evidence_candidates()

    declaration_reviews = []
    for declaration_no, declaration in by_declaration.items():
        db_rows = declaration["items"]
        db_set = multiset(db_rows, db=True)
        group_reviews = nearest_groups(preferred_groups, db_rows)
        exact = [
            group for group in group_reviews
            if group["missing_count"] == 0 and group["extra_count"] == 0
        ]
        item_candidates = strict_item_candidates(all_packing_rows, db_rows)
        review = {
            **declaration,
            "db_items": [item_label(row, db=True) for row in db_rows],
            "db_item_keys": sorted(db_set.elements()),
            "complete_source_group_matches": exact,
            "nearest_source_groups": group_reviews,
            "strict_item_candidates": item_candidates,
        }
        review["verdict"] = verdict_for(review, evidence)
        declaration_reviews.append(review)

    verdict_counts = Counter(row["verdict"] for row in declaration_reviews)
    missing_item_rows = [
        row
        for review in declaration_reviews
        for row in review["strict_item_candidates"]
        if row["strict_candidate_count"] == 0
    ]
    return {
        "status": "formal_customs_gap_reviewed",
        "scope": "formal_evidence_required / PENDING-威斯敏",
        "disposition_rows": len(target_rows),
        "declaration_count": len(declaration_reviews),
        "auto_writable": 0,
        "verdict_counts": dict(verdict_counts),
        "missing_strict_item_candidate_count": len(missing_item_rows),
        "evidence": evidence,
        "declarations": declaration_reviews,
    }


def write_csv(report: dict[str, Any]) -> None:
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        fieldnames = [
            "declaration_no",
            "contract_no",
            "item_count",
            "verdict",
            "complete_group_match_count",
            "nearest_group_1",
            "missing_strict_item_candidate_count",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for review in report["declarations"]:
            nearest = review["nearest_source_groups"][0] if review["nearest_source_groups"] else {}
            missing_count = sum(
                1
                for item in review["strict_item_candidates"]
                if item["strict_candidate_count"] == 0
            )
            writer.writerow({
                "declaration_no": review["declaration_no"],
                "contract_no": review["contract_no"],
                "item_count": len(review["items"]),
                "verdict": review["verdict"],
                "complete_group_match_count": len(review["complete_source_group_matches"]),
                "nearest_group_1": " / ".join(
                    value for value in [
                        nearest.get("contract_no", ""),
                        nearest.get("source_file", ""),
                        nearest.get("container_label", ""),
                        f"matched={nearest.get('matched_count', '')}",
                        f"missing={nearest.get('missing_count', '')}",
                        f"extra={nearest.get('extra_count', '')}",
                    ]
                    if value
                ),
                "missing_strict_item_candidate_count": missing_count,
            })


def md_cell(value: Any, limit: int = 180) -> str:
    text = str(value if value is not None else "")
    return text.replace("|", "/").replace("\n", " ")[:limit] or "-"


def render_md(report: dict[str, Any]) -> str:
    lines = [
        "# WPS 正式报关来源缺口复核",
        "",
        f"状态：`{report['status']}`",
        f"范围：`{report['scope']}`",
        f"来源缺口行数：`{report['disposition_rows']}`",
        f"占位报关单数：`{report['declaration_count']}`",
        f"自动可写：`{report['auto_writable']}`",
        "",
        "## 结论",
        "- 本报告只读，不写数据库、不改 note。",
        "- `BGNDING-威斯敏*` 仍是占位报关单；当前没有完整装箱源集合可证明整张占位单来源。",
        "- 现有凭证抽取和附件清单中没有命中 `EXP260005/EXP260006/EXP260007/威斯敏` 的正式报关单候选。",
        "- 因此本轮不能把占位 HS 编码、占位海关编号或近似装箱行当作正式报关证据写库。",
        "",
        "## Verdict",
        "| Verdict | 数量 |",
        "|---|---:|",
    ]
    for verdict, count in sorted(report["verdict_counts"].items()):
        lines.append(f"| `{verdict}` | {count} |")

    evidence = report["evidence"]
    lines.extend([
        "",
        "## 凭证候选",
        f"- 正式报关候选：`{evidence['formal_customs_candidate_count']}`",
        f"- 相关 WPS/采购/销售文件候选：`{evidence['related_file_candidate_count']}`",
        "",
        "## 占位报关单",
        "| 占位单 | DB 项数 | 完整源集合匹配 | 最近源集合 | 严格逐项无候选 | Verdict |",
        "|---|---:|---:|---|---:|---|",
    ])
    for review in report["declarations"]:
        nearest = review["nearest_source_groups"][0] if review["nearest_source_groups"] else {}
        nearest_text = " / ".join(
            value for value in [
                nearest.get("contract_no", ""),
                nearest.get("source_file", ""),
                nearest.get("container_label", ""),
                f"matched={nearest.get('matched_count', '')}",
                f"missing={nearest.get('missing_count', '')}",
                f"extra={nearest.get('extra_count', '')}",
            ]
            if value
        )
        missing_count = sum(1 for item in review["strict_item_candidates"] if item["strict_candidate_count"] == 0)
        lines.append(
            f"| `{md_cell(review['declaration_no'])}` | {len(review['items'])} | "
            f"{len(review['complete_source_group_matches'])} | {md_cell(nearest_text, 260)} | "
            f"{missing_count} | `{review['verdict']}` |"
        )

    lines.extend(["", "## 逐单明细"])
    for review in report["declarations"]:
        lines.extend([
            "",
            f"### {review['declaration_no']}",
            "",
            "DB 商品：",
        ])
        for item in review["db_items"]:
            lines.append(f"- {item}")
        lines.extend([
            "",
            "最近源集合：",
            "| 合同 | 来源 | 柜/标签 | 命中 | 缺失 | 多出 |",
            "|---|---|---|---:|---:|---:|",
        ])
        for group in review["nearest_source_groups"][:5]:
            lines.append(
                f"| `{md_cell(group['contract_no'])}` | {md_cell(group['source_file'], 260)} | "
                f"{md_cell(group['container_label'])} | {group['matched_count']} | "
                f"{group['missing_count']} | {group['extra_count']} |"
            )
        lines.extend([
            "",
            "严格逐项候选：",
            "| DB 商品 | 候选数 | 首个候选 |",
            "|---|---:|---|",
        ])
        for item in review["strict_item_candidates"]:
            first = item["strict_candidates"][0] if item["strict_candidates"] else {}
            first_text = " / ".join(
                value for value in [
                    first.get("contract_no", ""),
                    first.get("source_file", ""),
                    first.get("container_label", ""),
                    f"row={first.get('row', '')}" if first else "",
                ]
                if value
            )
            lines.append(
                f"| {md_cell(item['db_item'])} | {item['strict_candidate_count']} | {md_cell(first_text, 260)} |"
            )
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    report = build_report()
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(report)
    OUT_MD.write_text(render_md(report), encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "scope": report["scope"],
        "disposition_rows": report["disposition_rows"],
        "declaration_count": report["declaration_count"],
        "auto_writable": report["auto_writable"],
        "verdict_counts": report["verdict_counts"],
        "formal_customs_candidate_count": report["evidence"]["formal_customs_candidate_count"],
        "related_file_candidate_count": report["evidence"]["related_file_candidate_count"],
        "out": {"json": str(OUT_JSON), "csv": str(OUT_CSV), "md": str(OUT_MD)},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
