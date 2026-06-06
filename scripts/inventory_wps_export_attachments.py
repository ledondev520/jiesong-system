#!/usr/bin/env python3
"""
Input: tmp/wps_11_export_list_raw/11-报关记录 + parsed/contracts.csv
Output: parsed/attachment_inventory.csv/json + attachment_inventory_summary.md
Pos: WPS 历史出货附件盘点脚本；只分类和归属附件，不解析 PDF 正文、不写数据库

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_ROOT = REPO_ROOT / "tmp/wps_11_export_list_raw/11-报关记录"
DEFAULT_PARSED_DIR = REPO_ROOT / "tmp/wps_11_export_list_raw/parsed"
ATTACHMENT_SUFFIXES = {".pdf", ".doc", ".docx", ".xls", ".xlsx"}


def clean_text(value: str | None) -> str:
    return (value or "").replace("\u3000", " ").strip()


def norm_path(path: Path) -> str:
    return path.as_posix()


def rel_path(path: Path, root: Path) -> str:
    return norm_path(path.relative_to(root))


def extract_exp_numbers(text: str) -> list[str]:
    matches = re.findall(r"EXP\s*([0-9]{6,8})", text, flags=re.IGNORECASE)
    result = []
    for match in matches:
        number = match.strip()
        if len(number) == 6 and number.startswith("25"):
            result.append(f"EXP{number}")
        else:
            result.append(f"EXP{number}")
    return sorted(set(result))


def extract_cg_numbers(text: str) -> list[str]:
    return sorted(set(re.findall(r"CG\s*([0-9]{7})", text, flags=re.IGNORECASE)))


def classify_attachment(relative_path: str) -> str:
    text = relative_path.lower()
    raw = relative_path

    if "出货汇总" in raw or "替换模板" in raw:
      return "template_or_summary"
    if "外销出口合同+发票+箱单" in raw:
      return "sales_invoice_packing_bundle"
    if "报关单" in raw or "放行通知书" in raw or "装船单" in raw:
      return "customs_declaration"
    if "出口退税" in raw or "退税联" in raw or "退税用途" in raw:
      return "export_tax_refund"
    if "提单" in raw or "hbl" in text or "电放" in raw or "海运出口" in raw or "保函" in raw:
      return "bill_of_lading"
    if "箱单" in raw or "装箱单" in raw:
      return "packing_list"
    if "外销出口合同" in raw or "销售合同" in raw:
      return "sales_contract"
    if "2-进项发票" in raw or "进项发票" in raw:
      return "input_invoice"
    if "4-销项材料" in raw or "销项" in raw or re.search(r"(^|/)(归档-)?发票[^/]*\.pdf$", raw):
      return "output_invoice"
    if "购销合同" in raw or "/3-采购合同/" in raw or "采购合同" in raw:
      return "purchase_contract"
    if "服务费" in raw or "服务协议" in raw:
      return "service_document"
    if Path(relative_path).suffix.lower() in {".xlsx", ".xls"}:
      return "spreadsheet_other"
    if Path(relative_path).suffix.lower() in {".doc", ".docx"}:
      return "word_other"
    return "other_pdf" if Path(relative_path).suffix.lower() == ".pdf" else "other"


def build_contract_dir_index(parsed_dir: Path) -> dict[str, list[str]]:
    contracts_path = parsed_dir / "contracts.csv"
    index: dict[str, set[str]] = defaultdict(set)
    if not contracts_path.exists():
        return {}

    with contracts_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            contract_no = clean_text(row.get("contract_no"))
            source_files = clean_text(row.get("source_files"))
            if not contract_no or "外销出口合同" not in source_files:
                continue
            for source_file in re.findall(r"11-报关记录/[^']+?\.xlsx", source_files):
                if "外销出口合同" not in source_file:
                    continue
                directory = str(Path(source_file).parent)
                index[directory].add(contract_no)

    return {key: sorted(values) for key, values in index.items()}


def infer_contracts(relative_path: str, contract_dir_index: dict[str, list[str]]) -> tuple[list[str], str]:
    explicit = extract_exp_numbers(relative_path)
    if explicit:
        return explicit, "filename"

    parts = Path(f"11-报关记录/{relative_path}").parts
    candidate_dirs = []
    for depth in range(len(parts), 0, -1):
        candidate_dirs.append(norm_path(Path(*parts[:depth])))
    for directory in candidate_dirs:
        contracts = contract_dir_index.get(directory)
        if contracts:
            return contracts, "directory"
    return [], "unknown"


def build_inventory(source_root: Path, parsed_dir: Path) -> tuple[list[dict[str, object]], dict[str, object]]:
    contract_dir_index = build_contract_dir_index(parsed_dir)
    records = []

    for file_path in sorted(source_root.rglob("*")):
        if not file_path.is_file() or file_path.suffix.lower() not in ATTACHMENT_SUFFIXES:
            continue
        relative = rel_path(file_path, source_root)
        category = classify_attachment(relative)
        contracts, inference = infer_contracts(relative, contract_dir_index)
        stat = file_path.stat()
        records.append({
            "relative_path": relative,
            "file_name": file_path.name,
            "suffix": file_path.suffix.lower(),
            "category": category,
            "inferred_contracts": ";".join(contracts),
            "contract_inference": inference,
            "purchase_contract_nos": ";".join(f"CG{number}" for number in extract_cg_numbers(relative)),
            "size_bytes": stat.st_size,
        })

    category_counts = Counter(record["category"] for record in records)
    suffix_counts = Counter(record["suffix"] for record in records)
    contract_category: dict[str, Counter[str]] = defaultdict(Counter)
    unknown_by_category = Counter()

    for record in records:
        contracts = [item for item in str(record["inferred_contracts"]).split(";") if item]
        if not contracts:
            unknown_by_category[str(record["category"])] += 1
            continue
        for contract_no in contracts:
            contract_category[contract_no][str(record["category"])] += 1

    high_value_categories = {
        "customs_declaration",
        "export_tax_refund",
        "output_invoice",
        "input_invoice",
        "bill_of_lading",
    }
    contracts_with_high_value = {
        contract_no: {
            category: count
            for category, count in sorted(counter.items())
            if category in high_value_categories
        }
        for contract_no, counter in sorted(contract_category.items())
    }
    contracts_with_high_value = {
        contract_no: counts
        for contract_no, counts in contracts_with_high_value.items()
        if counts
    }

    summary = {
        "source_root": norm_path(source_root),
        "file_count": len(records),
        "category_counts": dict(sorted(category_counts.items())),
        "suffix_counts": dict(sorted(suffix_counts.items())),
        "contract_count_with_any_attachment": len(contract_category),
        "contract_count_with_high_value_attachment": len(contracts_with_high_value),
        "unknown_contract_counts_by_category": dict(sorted(unknown_by_category.items())),
        "contracts_with_high_value_attachment": contracts_with_high_value,
    }
    return records, summary


def write_outputs(records: list[dict[str, object]], summary: dict[str, object], parsed_dir: Path) -> None:
    parsed_dir.mkdir(parents=True, exist_ok=True)
    csv_path = parsed_dir / "attachment_inventory.csv"
    json_path = parsed_dir / "attachment_inventory.json"
    summary_path = parsed_dir / "attachment_inventory_summary.md"

    fieldnames = [
        "relative_path",
        "file_name",
        "suffix",
        "category",
        "inferred_contracts",
        "contract_inference",
        "purchase_contract_nos",
        "size_bytes",
    ]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)

    json_path.write_text(
        json.dumps({"summary": summary, "records": records}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lines = [
        "# WPS 出货附件盘点",
        "",
        f"- 文件总数：`{summary['file_count']}`",
        f"- 有任意附件归属的 EXP 合同数：`{summary['contract_count_with_any_attachment']}`",
        f"- 有高价值凭证归属的 EXP 合同数：`{summary['contract_count_with_high_value_attachment']}`",
        "",
        "## 分类计数",
        "",
    ]
    for category, count in summary["category_counts"].items():
        lines.append(f"- `{category}`: `{count}`")
    lines.extend(["", "## 未能归属合同的类别计数", ""])
    for category, count in summary["unknown_contract_counts_by_category"].items():
        lines.append(f"- `{category}`: `{count}`")
    summary_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    records, summary = build_inventory(DEFAULT_SOURCE_ROOT, DEFAULT_PARSED_DIR)
    write_outputs(records, summary, DEFAULT_PARSED_DIR)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
