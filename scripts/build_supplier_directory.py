#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: 当前 SQLite 供应商/采购合同、WPS 采购合同凭证抽取 CSV、可选外部 Word 目录
Output: 受限 JSON，供供应商名录工作簿生成；stdout 只输出聚合计数
Pos: 供应商主体目录汇总 Adapter；只读来源和数据库，不自动回填，不按相似名称合并

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import os
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
EXTRACTOR_PATH = REPO_ROOT / "scripts/extract_wps_purchase_evidence.py"
WORD_SUFFIXES = {".docx"}
CONTRACT_MARKERS = ("合同", "购销", "采购", "供应商")
FIELD_MAP = {
    "taxId": "supplier_tax_id",
    "address": "supplier_address",
    "bankName": "bank_name",
    "bankAccount": "bank_account",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="汇总 Word 合同供应商目录，只输出受限 JSON")
    parser.add_argument("--db", type=Path, default=REPO_ROOT / "backend/prisma/dev.db")
    parser.add_argument(
        "--evidence-csv",
        type=Path,
        default=REPO_ROOT / "tmp/wps_11_export_list_raw/parsed/purchase_evidence_extracts.csv",
    )
    parser.add_argument(
        "--wps-word-root",
        type=Path,
        default=REPO_ROOT / "tmp/wps_11_export_list_raw/11-报关记录",
    )
    parser.add_argument("--canonical-root", type=Path)
    parser.add_argument("--extra-root", action="append", type=Path, default=[])
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def load_extractor():
    spec = importlib.util.spec_from_file_location("supplier_evidence_extractor", EXTRACTOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("无法加载采购合同凭证解析 Module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def clean(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).replace("\u3000", " ")).strip()


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def discover_word_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(
        path
        for path in root.rglob("*")
        if path.is_file()
        and path.suffix.lower() in WORD_SUFFIXES
        and not path.name.startswith("~$")
        and any(marker in path.name for marker in CONTRACT_MARKERS)
    )


def source_locator(path: Path, roots: list[Path]) -> str:
    for root in roots:
        try:
            return f"{root.name}/{path.relative_to(root)}"
        except ValueError:
            continue
    return path.name


def load_db(db_path: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    suppliers = [
        dict(row)
        for row in connection.execute(
            """
            SELECT id, name, shortName, contactName, contactPhone, contactEmail,
                   address, phone, taxId, bankAccountName, bankName, bankBranch,
                   bankCode, bankAccount, hasQualityIssue, qualityNote, isActive
            FROM suppliers
            ORDER BY name
            """
        )
    ]
    contracts = {
        row["contractNo"]: dict(row)
        for row in connection.execute(
            """
            SELECT pc.contractNo, pc.supplierId, s.name AS supplierName, s.taxId AS supplierTaxId
            FROM purchase_contracts pc
            JOIN suppliers s ON s.id = pc.supplierId
            """
        )
    }
    connection.close()
    return suppliers, contracts


def load_existing_evidence(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = []
        for row in csv.DictReader(handle):
            if clean(row.get("supplier_name")):
                row["source_group"] = "WPS合同证据"
                row["source_sha256"] = ""
                rows.append(row)
        return rows


def parse_external_word_evidence(
    extractor,
    wps_root: Path,
    extra_roots: list[Path],
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    known_hashes = {file_hash(path) for path in discover_word_files(wps_root)}
    seen_hashes: set[str] = set()
    rows: list[dict[str, Any]] = []
    metrics = Counter()
    roots = [wps_root, *extra_roots]

    for root in extra_roots:
        for path in discover_word_files(root):
            metrics["candidate_files"] += 1
            digest = file_hash(path)
            if digest in known_hashes:
                metrics["duplicate_of_wps"] += 1
                continue
            if digest in seen_hashes:
                metrics["duplicate_among_extra"] += 1
                continue
            seen_hashes.add(digest)
            metrics["unique_extra"] += 1
            try:
                text, tables = extractor.read_docx(path)
                evidence = extractor.PurchaseEvidence(
                    relative_path=source_locator(path, roots),
                    suffix=path.suffix.lower(),
                    inferred_contracts=[],
                    status="ok",
                    extraction_method="docx_external",
                )
                extractor.fill_fields(evidence, text, tables)
                if "上海捷淞国际物流有限公司" not in text or not evidence.purchase_contract_no:
                    metrics["not_jiesong_contract"] += 1
                    continue
                row = evidence.to_row()
                row["source_group"] = "外部独有Word"
                row["source_sha256"] = digest
                rows.append(row)
                metrics["parsed_relevant"] += 1
            except Exception:  # noqa: BLE001 - preserve count without logging confidential path.
                metrics["parse_error"] += 1
    return rows, dict(metrics)


def build_word_cleanup_audit(
    canonical_root: Path | None,
    wps_root: Path,
    extra_roots: list[Path],
) -> dict[str, Any]:
    if canonical_root is None or not canonical_root.exists():
        return {"summary": {}, "rows": []}

    roots = [("主目录", canonical_root), ("WPS导出", wps_root)]
    roots.extend((f"外部目录{index}", root) for index, root in enumerate(extra_roots, start=1))
    records: list[dict[str, Any]] = []
    seen_paths: set[Path] = set()
    for source_group, root in roots:
        for path in discover_word_files(root):
            resolved = path.resolve()
            if resolved in seen_paths:
                continue
            seen_paths.add(resolved)
            stat = path.stat()
            records.append({
                "source_group": source_group,
                "path": str(path),
                "sha256": file_hash(path),
                "size": stat.st_size,
                "mtime": stat.st_mtime,
            })

    canonical_by_hash: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        if record["source_group"] == "主目录":
            canonical_by_hash[record["sha256"]].append(record)
    keep_by_hash = {
        digest: sorted(rows, key=lambda row: (row["mtime"], row["path"]), reverse=True)[0]
        for digest, rows in canonical_by_hash.items()
    }

    rows: list[dict[str, Any]] = []
    for record in records:
        digest = record["sha256"]
        canonical_rows = canonical_by_hash.get(digest, [])
        if record["source_group"] == "主目录":
            keep = keep_by_hash[digest]
            if record["path"] == keep["path"]:
                action = "主目录保留"
            else:
                action = "主目录内部精确重复，可清理"
            target = keep["path"]
        elif canonical_rows:
            action = "主目录已有精确副本，外部可清理"
            target = keep_by_hash[digest]["path"]
        else:
            action = "主目录缺失，建议并入后再清理外部"
            target = str(canonical_root / Path(record["path"]).name)
        rows.append({
            "source_group": record["source_group"],
            "source_path": record["path"],
            "sha256": digest,
            "size_bytes": record["size"],
            "modified_at_epoch": record["mtime"],
            "suggested_action": action,
            "canonical_target": target,
        })

    action_counts = dict(sorted(Counter(row["suggested_action"] for row in rows).items()))
    return {
        "summary": {
            "canonical_root": str(canonical_root),
            "candidate_file_count": len(rows),
            "unique_content_count": len({row["sha256"] for row in rows}),
            "action_counts": action_counts,
        },
        "rows": rows,
    }


def candidate_values(rows: list[dict[str, Any]], source_field: str) -> list[str]:
    values = {
        normalize_evidence_value(source_field, row.get(source_field))
        for row in rows
    }
    return sorted(value for value in values if value)


def single_match(pattern: str, value: str) -> str:
    matches = {clean(match) for match in re.findall(pattern, value, flags=re.IGNORECASE) if clean(match)}
    return next(iter(matches)) if len(matches) == 1 else ""


def normalize_evidence_value(source_field: str, value: Any) -> str:
    text = clean(value)
    if not text:
        return ""
    if source_field == "supplier_tax_id":
        compact = re.sub(r"\s+", "", text.upper())
        matches = set(re.findall(r"(?<![0-9A-Z])[0-9A-Z]{15,20}(?![0-9A-Z])", compact))
        return next(iter(matches)) if len(matches) == 1 else ""
    if source_field == "bank_account":
        labeled = single_match(
            r"(?:收款帐号|收款账号|银行帐号|银行账号)\s*[：:]?\s*([0-9 ]{8,40})",
            text,
        )
        candidate = labeled or (text if re.fullmatch(r"[0-9 ]{8,40}", text) else "")
        return re.sub(r"\s+", "", candidate)
    if source_field == "supplier_address":
        if re.search(r"单位地址|收款银行|开户银行|收款账号|收款帐号|乙方", text):
            candidate = single_match(
                r"(?:单位地址|地址)\s*[：:]?\s*(.+?)(?=收款银行|开户银行|收款帐号|收款账号|银行帐号|银行账号|电话|邮箱|乙方|$)",
                text,
            )
        else:
            candidate = text
        return candidate if candidate and len(candidate) <= 160 else ""
    if source_field == "bank_name":
        if re.search(r"收款银行|开户银行|收款账号|收款帐号|乙方", text):
            candidate = single_match(
                r"(?:收款银行|开户银行)\s*[：:]?\s*(.+?)(?=收款帐号|收款账号|银行帐号|银行账号|电话|邮箱|乙方|$)",
                text,
            )
        else:
            candidate = text
        return candidate if candidate and len(candidate) <= 120 else ""
    return text


def normalize_supplier_name(value: Any) -> str:
    text = clean(value)
    if not text:
        return ""
    labeled = single_match(
        r"单位名称(?:（盖章）|\(盖章\))?\s*[：:]?\s*(.+?)(?=委托代理人|纳税人识别号|单位地址|收款银行|电话|邮箱|$)",
        text,
    )
    candidate = labeled or re.sub(r"^乙方(?:（供方）|\(供方\))?\s*[：:]?\s*", "", text)
    candidate = clean(re.split(r"委托代理人|纳税人识别号|单位地址|收款银行|电话|邮箱", candidate, maxsplit=1)[0])
    if not candidate or len(candidate) > 80:
        return ""
    if any(marker in candidate for marker in ("质量保证", "收到货", "甲方", "合同条款", "保修", "签订日期")):
        return ""
    return candidate


def field_status(current: str, candidates: list[str]) -> tuple[str, str, str]:
    if not candidates:
        return current, "无合同候选" if current else "缺失", ""
    if current:
        if all(value == current for value in candidates):
            return current, "一致", candidates[0]
        return current, "冲突待核", " | ".join(candidates)
    if len(candidates) == 1:
        return candidates[0], "建议补充", candidates[0]
    return "", "多值待核", " | ".join(candidates)


def build_directory(
    suppliers: list[dict[str, Any]],
    contracts: dict[str, dict[str, Any]],
    evidence_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    by_id = {row["id"]: row for row in suppliers}
    by_name = {clean(row["name"]): row["id"] for row in suppliers}
    by_tax: dict[str, list[str]] = defaultdict(list)
    for row in suppliers:
        if clean(row.get("taxId")):
            by_tax[clean(row["taxId"])].append(row["id"])

    mapped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    unmatched: list[dict[str, Any]] = []
    source_rows: list[dict[str, Any]] = []

    for row in evidence_rows:
        contract_no = clean(row.get("purchase_contract_no"))
        extracted_name = normalize_supplier_name(row.get("supplier_name"))
        extracted_tax = clean(row.get("supplier_tax_id"))
        supplier_id = ""
        match_method = ""
        if contract_no and contract_no in contracts:
            supplier_id = contracts[contract_no]["supplierId"]
            match_method = "合同号"
        elif extracted_name in by_name:
            supplier_id = by_name[extracted_name]
            match_method = "正式名称"
        elif extracted_tax and len(by_tax.get(extracted_tax, [])) == 1:
            supplier_id = by_tax[extracted_tax][0]
            match_method = "税号"

        normalized = dict(row)
        normalized["supplier_name"] = extracted_name
        normalized["match_method"] = match_method or "未匹配"
        normalized["supplier_id"] = supplier_id
        normalized["canonical_name"] = clean(by_id.get(supplier_id, {}).get("name"))
        normalized["name_conflict"] = bool(
            supplier_id and extracted_name and extracted_name != normalized["canonical_name"]
        )
        source_rows.append({
            "source_group": clean(row.get("source_group")),
            "source_path": clean(row.get("relative_path")),
            "source_sha256": clean(row.get("source_sha256")),
            "contract_no": contract_no,
            "extracted_name": extracted_name,
            "canonical_name": normalized["canonical_name"],
            "match_method": normalized["match_method"],
            "name_conflict": "是" if normalized["name_conflict"] else "否",
            "parse_status": clean(row.get("status")),
            "issues": clean(row.get("issues")),
        })
        if supplier_id:
            mapped[supplier_id].append(normalized)
        else:
            unmatched.append(normalized)

    directory_rows: list[dict[str, Any]] = []
    suggestion_rows: list[dict[str, Any]] = []
    name_conflicts: list[dict[str, Any]] = []
    status_counter = Counter()

    for supplier in suppliers:
        supplier_id = supplier["id"]
        rows = mapped.get(supplier_id, [])
        contract_nos = sorted({clean(row.get("purchase_contract_no")) for row in rows if clean(row.get("purchase_contract_no"))})
        source_paths = sorted({clean(row.get("relative_path")) for row in rows if clean(row.get("relative_path"))})
        extracted_names = sorted({clean(row.get("supplier_name")) for row in rows if clean(row.get("supplier_name"))})
        field_results: dict[str, tuple[str, str, str]] = {}
        for target_field, source_field in FIELD_MAP.items():
            raw_current = clean(supplier.get(target_field))
            current = normalize_evidence_value(source_field, raw_current)
            candidates = candidate_values(rows, source_field)
            field_results[target_field] = field_status(current, candidates)
            final_value, status, candidate = field_results[target_field]
            if raw_current and not current:
                status = "数据库值待清理" if not candidates else "数据库值待清理并复核候选"
                field_results[target_field] = (final_value, status, candidate)
            if status not in {"一致", "无合同候选"} or (not current and not candidates):
                suggestion_rows.append({
                    "supplier_id": supplier_id,
                    "supplier_name": supplier["name"],
                    "field": target_field,
                    "current_value": raw_current,
                    "document_candidate": candidate,
                    "recommended_value": final_value,
                    "status": status,
                    "contract_nos": ";".join(contract_nos),
                    "source_count": len(source_paths),
                })

        conflicts = [
            f"{field}:{result[1]}"
            for field, result in field_results.items()
            if result[1] in {"冲突待核", "多值待核", "数据库值待清理", "数据库值待清理并复核候选"}
        ]
        has_name_conflict = any(row["name_conflict"] for row in rows)
        if has_name_conflict:
            conflicts.append("供应商名称:冲突待核")
            grouped_contracts: dict[str, set[str]] = defaultdict(set)
            for row in rows:
                extracted = clean(row.get("supplier_name"))
                if row["name_conflict"] and extracted:
                    grouped_contracts[extracted].add(clean(row.get("purchase_contract_no")))
            for extracted, numbers in sorted(grouped_contracts.items()):
                name_conflicts.append({
                    "supplier_id": supplier_id,
                    "canonical_name": supplier["name"],
                    "extracted_name": extracted,
                    "contract_nos": ";".join(sorted(number for number in numbers if number)),
                    "status": "待人工确认",
                })

        contact_phone = clean(supplier.get("contactPhone")) or clean(supplier.get("phone"))
        phone_digits = re.sub(r"\D", "", contact_phone)
        if contact_phone and len(phone_digits) < 7:
            conflicts.append("联系电话:疑似异常")
        if "文件损坏" in clean(supplier.get("name")):
            conflicts.append("供应商名称:来源损坏占位")

        if conflicts:
            review_status = "待人工确认"
        elif any(result[1] == "建议补充" for result in field_results.values()):
            review_status = "可补充候选"
        elif rows:
            review_status = "合同已覆盖"
        else:
            review_status = "无合同证据"
        status_counter[review_status] += 1

        directory_rows.append({
            "supplier_id": supplier_id,
            "supplier_name": supplier["name"],
            "short_name": clean(supplier.get("shortName")),
            "tax_id": field_results["taxId"][0],
            "address": field_results["address"][0],
            "contact_name": clean(supplier.get("contactName")),
            "contact_phone": contact_phone,
            "contact_email": clean(supplier.get("contactEmail")),
            "bank_account_name": clean(supplier.get("bankAccountName")),
            "bank_name": field_results["bankName"][0],
            "bank_branch": clean(supplier.get("bankBranch")),
            "bank_code": clean(supplier.get("bankCode")),
            "bank_account": field_results["bankAccount"][0],
            "is_active": "是" if supplier.get("isActive") else "否",
            "quality_issue": "是" if supplier.get("hasQualityIssue") else "否",
            "contract_count": len(contract_nos),
            "word_evidence_count": len(source_paths),
            "extracted_names": " | ".join(extracted_names),
            "review_status": review_status,
            "difference_summary": "; ".join(conflicts),
            "contract_nos": ";".join(contract_nos),
        })

    unmatched_candidates = []
    for row in unmatched:
        unmatched_candidates.append({
            "extracted_name": clean(row.get("supplier_name")),
            "tax_id": clean(row.get("supplier_tax_id")),
            "address": clean(row.get("supplier_address")),
            "bank_name": clean(row.get("bank_name")),
            "bank_account": clean(row.get("bank_account")),
            "contract_no": clean(row.get("purchase_contract_no")),
            "source_path": clean(row.get("relative_path")),
            "status": "未匹配数据库供应商",
        })

    summary = {
        "db_supplier_count": len(suppliers),
        "evidence_row_count": len(evidence_rows),
        "mapped_evidence_count": sum(len(rows) for rows in mapped.values()),
        "unmatched_evidence_count": len(unmatched),
        "suppliers_with_evidence": sum(1 for row in directory_rows if row["word_evidence_count"] > 0),
        "supplier_review_status_counts": dict(sorted(status_counter.items())),
        "field_suggestion_count": len(suggestion_rows),
        "name_conflict_count": len(name_conflicts),
    }
    return {
        "summary": summary,
        "suppliers": directory_rows,
        "field_suggestions": suggestion_rows,
        "name_conflicts": name_conflicts,
        "unmatched_candidates": unmatched_candidates,
        "sources": source_rows,
    }


def main() -> int:
    args = parse_args()
    extractor = load_extractor()
    suppliers, contracts = load_db(args.db)
    evidence_rows = load_existing_evidence(args.evidence_csv)
    extra_rows, extra_metrics = parse_external_word_evidence(
        extractor,
        args.wps_word_root,
        args.extra_root,
    )
    evidence_rows.extend(extra_rows)
    result = build_directory(suppliers, contracts, evidence_rows)
    result["summary"]["external_word_metrics"] = extra_metrics
    cleanup_audit = build_word_cleanup_audit(
        args.canonical_root,
        args.wps_word_root,
        args.extra_root,
    )
    result["folder_audit"] = cleanup_audit
    result["summary"]["folder_audit"] = cleanup_audit["summary"]

    args.output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(args.output.parent, 0o700)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    os.chmod(args.output, 0o600)
    print(json.dumps(result["summary"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
