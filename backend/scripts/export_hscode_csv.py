#!/usr/bin/env python3
"""
Input: backend/data/hscode-live/records/*.json
Output: backend/data/hscode-live/hscode-live.csv
Pos: HSCode 原始快照转 CSV 导出脚本
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

DEFAULT_INPUT_DIR = Path(__file__).resolve().parents[1] / "data" / "hscode-live" / "records"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "data" / "hscode-live" / "hscode-live.csv"

FIELDNAMES = [
    "hs_code",
    "title",
    "source_url",
    "fetched_at",
    "product_code",
    "product_name",
    "product_description",
    "status",
    "updated_date",
    "unit",
    "export_rate",
    "export_refund_rate",
    "export_temp_rate",
    "vat_rate",
    "mf_rate",
    "import_temp_rate",
    "general_import_rate",
    "consumption_tax_rate",
    "declaration_elements",
    "supervision_conditions",
    "inspection_quarantine",
    "agreement_rates_json",
    "rcep_rates_json",
    "chapter_hierarchy",
    "ciq_codes",
]


def join_labeled_values(items: list[dict]) -> str:
    parts: list[str] = []
    for item in items:
        index = item.get("index")
        code = item.get("code")
        value = item.get("value", "")
        if index is not None:
            parts.append(f"{index}:{value}")
        elif code:
            parts.append(f"{code}:{value}")
        else:
            parts.append(str(value))
    return " | ".join(part for part in parts if part)


def join_code_values(items: list[dict]) -> str:
    return " | ".join(
        f"{item.get('code', '')}:{item.get('value', '')}".rstrip(":")
        for item in items
        if item.get("code") or item.get("value")
    )


def record_to_row(record: dict) -> dict[str, str]:
    basic_info = record.get("basic_info", {})
    tax_info = record.get("tax_info", {})
    return {
        "hs_code": record.get("hs_code", ""),
        "title": record.get("title", ""),
        "source_url": record.get("source_url", ""),
        "fetched_at": record.get("fetched_at", ""),
        "product_code": basic_info.get("商品编码", ""),
        "product_name": basic_info.get("商品名称", ""),
        "product_description": basic_info.get("商品描述", ""),
        "status": basic_info.get("编码状态", ""),
        "updated_date": basic_info.get("更新时间", ""),
        "unit": tax_info.get("计量单位", ""),
        "export_rate": tax_info.get("出口税率", ""),
        "export_refund_rate": tax_info.get("出口退税税率", ""),
        "export_temp_rate": tax_info.get("出口暂定税率", ""),
        "vat_rate": tax_info.get("增值税率", ""),
        "mf_rate": tax_info.get("最惠国税率", ""),
        "import_temp_rate": tax_info.get("进口暂定税率", ""),
        "general_import_rate": tax_info.get("进口普通税率", ""),
        "consumption_tax_rate": tax_info.get("消费税率", ""),
        "declaration_elements": join_labeled_values(record.get("declaration_elements", [])),
        "supervision_conditions": join_labeled_values(record.get("supervision_conditions", [])),
        "inspection_quarantine": join_labeled_values(record.get("inspection_quarantine", [])),
        "agreement_rates_json": json.dumps(record.get("agreement_rates", {}), ensure_ascii=False, sort_keys=True),
        "rcep_rates_json": json.dumps(record.get("rcep_rates", {}), ensure_ascii=False, sort_keys=True),
        "chapter_hierarchy": join_code_values(record.get("chapter_hierarchy", [])),
        "ciq_codes": join_code_values(record.get("ciq_codes", [])),
    }


def load_records(input_dir: Path) -> list[dict]:
    records = []
    for path in sorted(input_dir.glob("*.json")):
        records.append(json.loads(path.read_text(encoding="utf-8")))
    return records


def export_csv(input_dir: Path, output_path: Path) -> int:
    records = load_records(input_dir)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        for record in records:
            writer.writerow(record_to_row(record))
    return len(records)


def main() -> int:
    parser = argparse.ArgumentParser(description="Export raw HSCode JSON records to a single CSV file.")
    parser.add_argument("--input-dir", default=str(DEFAULT_INPUT_DIR))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    args = parser.parse_args()

    record_count = export_csv(Path(args.input_dir).resolve(), Path(args.output).resolve())
    print(f"Exported {record_count} records to {Path(args.output).resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
