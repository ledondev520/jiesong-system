#!/usr/bin/env python3
"""Export an auditable zero-refund reference from an official CMCODE DBF."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from prepare_export_packet import read_dbf_records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dbf", type=Path, required=True)
    parser.add_argument("--as-of", required=True, help="YYYY-MM-DD")
    parser.add_argument("--version", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    as_of = args.as_of.replace("-", "")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    zero_rows = []
    active_rows = 0
    for row in read_dbf_records(args.dbf):
        if not (row.get("ST_DATE", "") <= as_of <= row.get("END_DATE", "")):
            continue
        active_rows += 1
        if float(row.get("TSL") or 0) == 0:
            zero_rows.append(
                {
                    "商品代码": row.get("CODE", ""),
                    "商品名称": row.get("NAME", ""),
                    "计量单位": row.get("UNIT", ""),
                    "征税率": row.get("ZSSL_SET", ""),
                    "退税率": row.get("TSL", ""),
                    "生效日期": row.get("ST_DATE", ""),
                    "失效日期": row.get("END_DATE", ""),
                    "文库版本": args.version,
                }
            )
    zero_rows.sort(key=lambda item: item["商品代码"])
    csv_path = args.output_dir / f"不可退税HS参考_{args.version}_{args.as_of}.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(zero_rows[0]))
        writer.writeheader()
        writer.writerows(zero_rows)
    metadata = {
        "version": args.version,
        "as_of": args.as_of,
        "source_url": args.source_url,
        "dbf_sha256": hashlib.sha256(args.dbf.read_bytes()).hexdigest(),
        "active_record_count": active_rows,
        "zero_refund_record_count": len(zero_rows),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "warning": "仅作筛查参考；每票仍须按出口日期和最终HS逐项查询当前税库。",
    }
    metadata_path = args.output_dir / f"退税率文库_{args.version}_元数据.json"
    metadata_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"csv": str(csv_path), "metadata": str(metadata_path), **metadata}, ensure_ascii=False))


if __name__ == "__main__":
    main()
