#!/usr/bin/env python3
"""Build a read-only export-packet pricing and completeness proposal.

This script never mutates the database or WPS files. It reads one EXP contract,
its packing and purchase-cost evidence, the official export-refund DBF, and
historical EXP workbooks, then prints an auditable JSON proposal.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sqlite3
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable


DEFAULT_DB = Path(__file__).resolve().parents[1] / "backend/prisma/dev.db"
DEFAULT_HISTORY_ROOT = Path(
    "/Users/helena/Library/Containers/com.kingsoft.wpsoffice.mac/Data/Library/"
    "Application Support/Kingsoft/WPS Cloud Files/userdata/qing/filecache/212320004/"
    "团队文档/捷淞/11-报关记录"
)


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "")).strip()


def normalize_hs(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return re.sub(r"\D", "", str(value))


def parse_iso_day(value: str) -> str:
    datetime.strptime(value, "%Y-%m-%d")
    return value.replace("-", "")


@dataclass(frozen=True)
class RefundRecord:
    code: str
    name: str
    refund_rate: float
    start_date: str
    end_date: str
    source_version: str


def read_dbf_records(path: Path) -> Iterable[dict[str, str]]:
    raw = path.read_bytes()
    record_count = int.from_bytes(raw[4:8], "little")
    header_len = int.from_bytes(raw[8:10], "little")
    record_len = int.from_bytes(raw[10:12], "little")
    fields: list[tuple[str, int]] = []
    pos = 32
    while raw[pos] != 0x0D:
        descriptor = raw[pos : pos + 32]
        name = descriptor[:11].split(b"\0")[0].decode("ascii")
        fields.append((name, descriptor[16]))
        pos += 32
    for index in range(record_count):
        record = raw[
            header_len + index * record_len : header_len + (index + 1) * record_len
        ]
        if not record or record[0:1] == b"*":
            continue
        offset = 1
        values: dict[str, str] = {}
        for name, length in fields:
            field_raw = record[offset : offset + length]
            offset += length
            values[name] = field_raw.decode("gb18030", "replace").strip()
        yield values


def lookup_refund_rate(
    dbf_path: Path, hs_code: str, export_day: str, source_version: str
) -> RefundRecord | None:
    hs = normalize_hs(hs_code)
    candidates: list[dict[str, str]] = []
    for record in read_dbf_records(dbf_path):
        code = normalize_hs(record.get("CODE"))
        if not code or not hs.startswith(code):
            continue
        if record.get("ST_DATE", "") <= export_day <= record.get("END_DATE", ""):
            candidates.append(record)
    if not candidates:
        return None
    best = max(candidates, key=lambda row: len(normalize_hs(row.get("CODE"))))
    return RefundRecord(
        code=normalize_hs(best.get("CODE")),
        name=best.get("NAME", ""),
        refund_rate=float(best.get("TSL") or 0),
        start_date=best.get("ST_DATE", ""),
        end_date=best.get("END_DATE", ""),
        source_version=source_version,
    )


@dataclass(frozen=True)
class HistoricalQuote:
    contract_no: str
    product_name: str
    specification: str
    quantity: float
    unit_price_usd: float
    total_usd: float
    workbook: str
    workbook_mtime: float


def contract_sheet_name(sheet_names: Iterable[str]) -> str | None:
    for name in sheet_names:
        if normalize_text(name).replace("同", "同").replace(" ", "") == "合同":
            return name
    return None


def extract_contract_no(workbook_name: str, values: Iterable[Any]) -> str:
    for value in values:
        match = re.search(r"EXP\d{6}", str(value or ""), flags=re.I)
        if match:
            return match.group(0).upper()
    match = re.search(r"EXP\d{6}", workbook_name, flags=re.I)
    return match.group(0).upper() if match else ""


def scan_historical_quotes(history_root: Path) -> list[HistoricalQuote]:
    try:
        from openpyxl import load_workbook
    except ImportError as exc:  # pragma: no cover - environment guard
        raise RuntimeError("openpyxl is required for read-only history scanning") from exc

    quotes: list[HistoricalQuote] = []
    for path in sorted(history_root.rglob("外销出口合同+发票+箱单+EXP*.xlsx")):
        if path.name.startswith(".~") or "模板" in path.name:
            continue
        try:
            workbook = load_workbook(path, read_only=True, data_only=True)
            sheet_name = contract_sheet_name(workbook.sheetnames)
            if not sheet_name:
                continue
            sheet = workbook[sheet_name]
            header_values = [
                cell.value
                for row in sheet.iter_rows(min_row=1, max_row=min(sheet.max_row, 8))
                for cell in row
            ]
            contract_no = extract_contract_no(path.name, header_values)
            for row in sheet.iter_rows(min_row=1, max_row=min(sheet.max_row, 120)):
                values = [cell.value for cell in row[:6]]
                if len(values) < 6:
                    continue
                item, name, spec, quantity, unit_price, total = values
                if not re.fullmatch(r"\d+(?:\.0+)?", str(item or "").strip()):
                    continue
                if not name or not isinstance(unit_price, (int, float)):
                    continue
                if not isinstance(quantity, (int, float)) or quantity <= 0:
                    continue
                total_value = (
                    float(total)
                    if isinstance(total, (int, float))
                    else float(quantity) * float(unit_price)
                )
                quotes.append(
                    HistoricalQuote(
                        contract_no=contract_no,
                        product_name=str(name).strip(),
                        specification=str(spec or "").strip(),
                        quantity=float(quantity),
                        unit_price_usd=float(unit_price),
                        total_usd=total_value,
                        workbook=str(path),
                        workbook_mtime=path.stat().st_mtime,
                    )
                )
        except Exception:
            continue
    return quotes


def choose_historical_quote(
    quotes: Iterable[HistoricalQuote], product_name: str, specification: str
) -> HistoricalQuote | None:
    name_key = normalize_text(product_name)
    spec_key = normalize_text(specification)
    exact = [
        quote
        for quote in quotes
        if normalize_text(quote.product_name) == name_key
        and spec_key
        and normalize_text(quote.specification) == spec_key
    ]
    if exact:
        return max(exact, key=lambda quote: quote.workbook_mtime)
    return None


def same_name_history(
    quotes: Iterable[HistoricalQuote], product_name: str
) -> list[HistoricalQuote]:
    name_key = normalize_text(product_name)
    matches = [
        quote for quote in quotes if normalize_text(quote.product_name) == name_key
    ]
    return sorted(matches, key=lambda quote: quote.workbook_mtime, reverse=True)


def nearest_multiple_of_five(value: float) -> int:
    return int(round(value / 5.0) * 5)


def realized_markup(
    unit_price_usd: float, quantity: float, effective_rate: float, cost_cny: float
) -> float:
    if cost_cny <= 0:
        return math.nan
    return unit_price_usd * quantity * effective_rate / cost_cny - 1


def calculate_price(
    cost_cny: float,
    quantity: float,
    effective_rate: float,
    markup: float,
    strict_cap: bool,
) -> tuple[float, float, float, str]:
    raw_total = cost_cny * (1 + markup) / effective_rate
    raw_unit = raw_total / quantity
    integer_unit = math.floor(raw_unit) if strict_cap else round(raw_unit)
    integer_unit = max(integer_unit, 1)
    integer_total = integer_unit * quantity

    candidates: list[tuple[float, float, float, str]] = []
    candidates.append(
        (
            float(integer_unit),
            round(integer_total, 4),
            realized_markup(integer_unit, quantity, effective_rate, cost_cny),
            "integer_unit",
        )
    )
    target_total = nearest_multiple_of_five(raw_total)
    for offset in range(-10, 11, 5):
        total = max(target_total + offset, 5)
        unit = round(total / quantity, 4)
        actual_markup = realized_markup(unit, quantity, effective_rate, cost_cny)
        if strict_cap and actual_markup > markup + 1e-9:
            continue
        candidates.append((unit, float(total), actual_markup, "total_ends_0_or_5"))

    def score(candidate: tuple[float, float, float, str]) -> tuple[float, int, float]:
        unit, total, actual_markup, method = candidate
        markup_gap = abs(actual_markup - markup)
        integer_penalty = 0 if float(unit).is_integer() else 1
        total_gap = abs(total - raw_total)
        return (markup_gap, integer_penalty, total_gap)

    return min(candidates, key=score)


def fetch_contract_rows(database: Path, contract_no: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    connection = sqlite3.connect(database)
    connection.row_factory = sqlite3.Row
    header = connection.execute(
        """
        SELECT sc.contractNo, sc.exchangeRate, sc.totalAmount, sc.containerLabel,
               sc.shippedAt, sc.customsBroker, po.name AS port
          FROM sales_contracts sc
          LEFT JOIN ports po ON po.id = sc.portId
         WHERE sc.contractNo = ?
        """,
        (contract_no,),
    ).fetchone()
    if not header:
        raise ValueError(f"Contract not found: {contract_no}")
    rows = connection.execute(
        """
        SELECT pi.id, p.customsName, p.hsCode, p.declaration,
               pi.quantity, pi.unit, pi.boxes, pi.grossWeight, pi.netWeight,
               pi.volume, pi.purchaseCost, pi.specification, pi.supplement,
               pi.manufacturer, pi.purchaseContractNo, st.name AS store
          FROM packing_items pi
          JOIN sales_contracts sc ON sc.id = pi.salesContractId
          JOIN products p ON p.id = pi.productId
          LEFT JOIN stores st ON st.id = pi.storeId
         WHERE sc.contractNo = ?
         ORDER BY pi.createdAt, pi.id
        """,
        (contract_no,),
    ).fetchall()
    connection.close()
    return dict(header), [dict(row) for row in rows]


def build_proposal(args: argparse.Namespace) -> dict[str, Any]:
    export_day = parse_iso_day(args.export_date)
    effective_rate = round(args.spot_rate - args.fx_buffer, 6)
    if effective_rate <= 0:
        raise ValueError("Effective FX rate must be positive")
    header, rows = fetch_contract_rows(args.database, args.contract)
    history = scan_historical_quotes(args.history_root)
    proposal_rows: list[dict[str, Any]] = []
    blockers: list[str] = []

    for row in rows:
        name = row.get("customsName") or ""
        hs_code = normalize_hs(row.get("hsCode"))
        quantity = float(row.get("quantity") or 0)
        cost_cny = float(row.get("purchaseCost") or 0)
        specification = row.get("specification") or ""
        missing = [
            field
            for field in ("hsCode", "quantity", "unit", "boxes", "grossWeight", "netWeight", "volume")
            if row.get(field) in (None, "")
        ]
        if quantity <= 0:
            missing.append("positive_quantity")
        refund = (
            lookup_refund_rate(args.refund_dbf, hs_code, export_day, args.refund_version)
            if hs_code
            else None
        )
        historical = choose_historical_quote(history, name, specification)
        name_only_references = same_name_history(history, name)[:5]
        pricing: dict[str, Any]
        if historical:
            unit_price = historical.unit_price_usd
            total_usd = round(unit_price * quantity, 4)
            pricing = {
                "source": "historical_quote",
                "unit_price_usd": unit_price,
                "total_usd": total_usd,
                "reference_contract": historical.contract_no,
                "reference_specification": historical.specification,
                "reference_workbook": historical.workbook,
            }
        elif not refund:
            pricing = {"source": "blocked", "reason": "refund_rate_not_verified"}
        elif cost_cny <= 0:
            pricing = {"source": "blocked", "reason": "purchase_cost_missing"}
        elif quantity <= 0:
            pricing = {"source": "blocked", "reason": "quantity_invalid"}
        else:
            no_refund = refund.refund_rate == 0
            markup = args.no_refund_markup if no_refund else args.refundable_markup
            unit_price, total_usd, actual_markup, rounding_method = calculate_price(
                cost_cny=cost_cny,
                quantity=quantity,
                effective_rate=effective_rate,
                markup=markup,
                strict_cap=no_refund,
            )
            pricing = {
                "source": "formula",
                "unit_price_usd": unit_price,
                "total_usd": total_usd,
                "target_markup": markup,
                "realized_markup_at_effective_fx": round(actual_markup, 6),
                "rounding_method": rounding_method,
            }

        if missing:
            blockers.append(f"{name}: missing {', '.join(dict.fromkeys(missing))}")
        if pricing.get("source") == "blocked":
            blockers.append(f"{name}: {pricing['reason']}")
        proposal_rows.append(
            {
                "product_name": name,
                "specification": specification,
                "store": row.get("store"),
                "quantity": quantity,
                "unit": row.get("unit"),
                "boxes": row.get("boxes"),
                "gross_weight_kg": row.get("grossWeight"),
                "net_weight_kg": row.get("netWeight"),
                "volume_m3": row.get("volume"),
                "purchase_cost_cny": cost_cny,
                "purchase_contract_no": row.get("purchaseContractNo"),
                "hs_code": hs_code,
                "declaration": row.get("declaration"),
                "refund": asdict(refund) if refund else None,
                "pricing": pricing,
                "name_only_history_references": [
                    {
                        "contract_no": reference.contract_no,
                        "specification": reference.specification,
                        "unit_price_usd": reference.unit_price_usd,
                    }
                    for reference in name_only_references
                    if reference != historical
                ],
                "missing_fields": list(dict.fromkeys(missing)),
            }
        )

    priced_totals = [
        float(row["pricing"]["total_usd"])
        for row in proposal_rows
        if row["pricing"].get("total_usd") is not None
    ]
    return {
        "contract": header,
        "pricing_policy": {
            "spot_rate": args.spot_rate,
            "fx_buffer": args.fx_buffer,
            "effective_rate": effective_rate,
            "refundable_markup": args.refundable_markup,
            "no_refund_markup_cap": args.no_refund_markup,
            "history_first": True,
            "refund_version": args.refund_version,
            "export_date": args.export_date,
        },
        "rows": proposal_rows,
        "priced_total_usd": round(sum(priced_totals), 4),
        "blockers": blockers,
        "ready_for_wps_write": not blockers,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract", required=True, help="EXP contract number")
    parser.add_argument("--spot-rate", required=True, type=float)
    parser.add_argument("--export-date", default=date.today().isoformat())
    parser.add_argument("--fx-buffer", type=float, default=0.2)
    parser.add_argument("--refundable-markup", type=float, default=0.30)
    parser.add_argument("--no-refund-markup", type=float, default=0.10)
    parser.add_argument("--database", type=Path, default=DEFAULT_DB)
    parser.add_argument("--history-root", type=Path, default=DEFAULT_HISTORY_ROOT)
    parser.add_argument("--refund-dbf", type=Path, required=True)
    parser.add_argument("--refund-version", default="2026B")
    return parser.parse_args()


if __name__ == "__main__":
    print(json.dumps(build_proposal(parse_args()), ensure_ascii=False, indent=2))
