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


def json_safe_value(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


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


def exclude_current_contract(
    quotes: Iterable[HistoricalQuote], contract_no: str
) -> list[HistoricalQuote]:
    current = normalize_text(contract_no).upper()
    return [
        quote
        for quote in quotes
        if normalize_text(quote.contract_no).upper() != current
    ]


def nearest_multiple_of_five(value: float) -> int:
    return int(round(value / 5.0) * 5)


def realized_markup(
    unit_price_usd: float, quantity: float, effective_rate: float, cost_cny: float
) -> float:
    if cost_cny <= 0:
        return math.nan
    return unit_price_usd * quantity * effective_rate / cost_cny - 1


def historical_quote_allowed(
    unit_price_usd: float,
    quantity: float,
    effective_rate: float,
    cost_cny: float,
    refund_rate: float,
    no_refund_markup_cap: float,
    refundable_markup: float = 0.30,
    refundable_tolerance: float = 0.05,
) -> tuple[bool, float]:
    markup = realized_markup(unit_price_usd, quantity, effective_rate, cost_cny)
    if refund_rate == 0 and math.isfinite(markup):
        return -1e-9 <= markup <= no_refund_markup_cap + 1e-9, markup
    if refund_rate > 0 and math.isfinite(markup):
        return abs(markup - refundable_markup) <= refundable_tolerance + 1e-9, markup
    return True, markup


def unit_for_rounded_total(total: float, quantity: float) -> float:
    exact = total / quantity
    for precision in range(0, 11):
        factor = 10**precision
        candidates = {
            math.floor(exact * factor) / factor,
            round(exact, precision),
            math.ceil(exact * factor) / factor,
        }
        for unit in sorted(candidates, key=lambda value: abs(value - exact)):
            product = unit * quantity
            roundup_one_decimal = math.ceil((product - 1e-10) * 10) / 10
            if (
                round(product, 1) == round(total, 1)
                and abs(roundup_one_decimal - round(total, 1)) <= 1e-9
            ):
                return unit
    return round(total / quantity, 10)


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
        unit = unit_for_rounded_total(total, quantity)
        actual_markup = total * effective_rate / cost_cny - 1
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


def read_catalog(path: Path) -> dict[str, dict[str, Any]]:
    try:
        from openpyxl import load_workbook
    except ImportError as exc:  # pragma: no cover - environment guard
        raise RuntimeError("openpyxl is required for catalog reading") from exc

    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["货品目录"]
    rows = sheet.iter_rows(values_only=True)
    headers = [normalize_text(value) for value in next(rows)]
    index = {header: position for position, header in enumerate(headers)}
    catalog: dict[str, dict[str, Any]] = {}
    for values in rows:
        name = values[index["商品品名"]]
        if not name:
            continue
        catalog[normalize_text(name)] = {
            "hsCode": values[index["HSCode"]],
            "declaration": values[index["商品要素聚合"]],
            "origin": values[index["境内货源地"]],
        }
    return catalog


def read_confirmed_goods(path: Path) -> tuple[dict[tuple[str, str], dict[str, Any]], dict[str, dict[str, Any]]]:
    try:
        from openpyxl import load_workbook
    except ImportError as exc:  # pragma: no cover - environment guard
        raise RuntimeError("openpyxl is required for confirmed-workbook reading") from exc

    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet_name = next((name for name in workbook.sheetnames if normalize_text(name) == "箱单"), None)
    if not sheet_name:
        raise ValueError("Confirmed workbook missing packing-list sheet")
    sheet = workbook[sheet_name]
    exact: dict[tuple[str, str], dict[str, Any]] = {}
    by_spec_candidates: dict[str, list[dict[str, Any]]] = {}
    for row in sheet.iter_rows(min_row=9, max_row=min(sheet.max_row, 200), values_only=True):
        item, name, hs_code, specification = row[:4]
        if not isinstance(item, (int, float)) or not name:
            continue
        evidence = {
            "customsName": str(name).strip(),
            "hsCode": hs_code,
            "specification": str(specification or "").strip(),
            "declaration": row[10] if len(row) > 10 else None,
            "origin": row[11] if len(row) > 11 else None,
            "boxes": row[4] if len(row) > 4 else None,
            "grossWeight": row[5] if len(row) > 5 else None,
            "netWeight": row[6] if len(row) > 6 else None,
            "volume": row[7] if len(row) > 7 else None,
            "quantity": row[8] if len(row) > 8 else None,
            "unit": row[9] if len(row) > 9 else None,
            "source": str(path),
        }
        name_key = normalize_text(name)
        spec_key = normalize_text(specification)
        exact[(name_key, spec_key)] = evidence
        if spec_key:
            by_spec_candidates.setdefault(spec_key, []).append(evidence)
    by_spec = {
        spec: candidates[0]
        for spec, candidates in by_spec_candidates.items()
        if len(candidates) == 1
    }
    return exact, by_spec


def fetch_shipment_summary_rows(
    workbook_path: Path,
    contract_no: str,
    catalog_path: Path,
    confirmed_workbook: Path | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    try:
        from openpyxl import load_workbook
    except ImportError as exc:  # pragma: no cover - environment guard
        raise RuntimeError("openpyxl is required for shipment-summary reading") from exc

    workbook = load_workbook(workbook_path, read_only=True, data_only=True)
    sheet = workbook["出货总清单"]
    values = sheet.iter_rows(values_only=True)
    headers = [normalize_text(value) for value in next(values)]
    index = {header: position for position, header in enumerate(headers) if header}
    required = (
        "报关名", "门店", "港口", "报关数量", "单位", "厂家", "规格", "箱数",
        "毛重", "净重", "体积", "柜子编号", "出货日期", "合同号", "报关公司",
        "购销合同号", "采购金额", "商品补充信息",
    )
    missing_headers = [header for header in required if header not in index]
    if missing_headers:
        raise ValueError(f"Shipment summary missing headers: {', '.join(missing_headers)}")

    catalog = read_catalog(catalog_path)
    confirmed_exact: dict[tuple[str, str], dict[str, Any]] = {}
    confirmed_by_spec: dict[str, dict[str, Any]] = {}
    if confirmed_workbook:
        confirmed_exact, confirmed_by_spec = read_confirmed_goods(confirmed_workbook)
    matched: list[dict[str, Any]] = []
    for row_number, row in enumerate(values, start=2):
        source_contract = normalize_text(row[index["合同号"]]).upper()
        if source_contract != contract_no.upper():
            continue
        source_name = str(row[index["报关名"]] or "").strip()
        specification = str(row[index["规格"]] or "").strip()
        product = catalog.get(normalize_text(source_name), {})
        confirmed = confirmed_exact.get(
            (normalize_text(source_name), normalize_text(specification))
        ) or confirmed_by_spec.get(normalize_text(specification))
        if confirmed:
            product = confirmed
        output_name = confirmed.get("customsName") if confirmed else source_name
        evidence_conflicts: list[dict[str, Any]] = []
        if confirmed:
            source_values = {
                "quantity": row[index["报关数量"]],
                "unit": row[index["单位"]],
                "boxes": row[index["箱数"]],
                "grossWeight": row[index["毛重"]],
                "netWeight": row[index["净重"]],
                "volume": row[index["体积"]],
            }
            for field, source_value in source_values.items():
                confirmed_value = confirmed.get(field)
                if source_value in (None, "") or confirmed_value in (None, ""):
                    continue
                if isinstance(source_value, (int, float)) and isinstance(
                    confirmed_value, (int, float)
                ):
                    matches = abs(float(source_value) - float(confirmed_value)) <= 1e-6
                else:
                    matches = normalize_text(source_value) == normalize_text(confirmed_value)
                if not matches:
                    evidence_conflicts.append(
                        {
                            "field": field,
                            "shipment_summary": source_value,
                            "confirmed_workbook": confirmed_value,
                        }
                    )
        matched.append(
            {
                "id": f"shipment-summary:{row_number}",
                "sourceRow": row_number,
                "customsName": output_name,
                "hsCode": product.get("hsCode"),
                "declaration": product.get("declaration"),
                "origin": product.get("origin"),
                "quantity": row[index["报关数量"]],
                "unit": row[index["单位"]],
                "boxes": row[index["箱数"]],
                "grossWeight": row[index["毛重"]],
                "netWeight": row[index["净重"]],
                "volume": row[index["体积"]],
                "purchaseCost": row[index["采购金额"]],
                "specification": specification,
                "supplement": row[index["商品补充信息"]],
                "manufacturer": row[index["厂家"]],
                "purchaseContractNo": row[index["购销合同号"]],
                "store": row[index["门店"]],
                "port": row[index["港口"]],
                "containerLabel": row[index["柜子编号"]],
                "shippedAt": json_safe_value(row[index["出货日期"]]),
                "customsBroker": row[index["报关公司"]],
                "productEvidenceSource": (
                    "confirmed_workbook" if confirmed else "declaration_catalog"
                ),
                "evidenceConflicts": evidence_conflicts,
            }
        )
    if not matched:
        raise ValueError(f"Contract not found in shipment summary: {contract_no}")
    header = {
        "contractNo": contract_no,
        "exchangeRate": None,
        "totalAmount": None,
        "containerLabel": next((row["containerLabel"] for row in matched if row["containerLabel"]), None),
        "shippedAt": next((row["shippedAt"] for row in matched if row["shippedAt"]), None),
        "customsBroker": next((row["customsBroker"] for row in matched if row["customsBroker"]), None),
        "port": next((row["port"] for row in matched if row["port"]), None),
        "sourceWorkbook": str(workbook_path),
    }
    return header, matched


def build_proposal(args: argparse.Namespace) -> dict[str, Any]:
    export_day = parse_iso_day(args.export_date)
    effective_rate = round(args.spot_rate - args.fx_buffer, 6)
    if effective_rate <= 0:
        raise ValueError("Effective FX rate must be positive")
    if args.shipment_summary:
        if not args.declaration_catalog:
            raise ValueError("--declaration-catalog is required with --shipment-summary")
        header, rows = fetch_shipment_summary_rows(
            args.shipment_summary,
            args.contract,
            args.declaration_catalog,
            args.confirmed_workbook,
        )
    else:
        header, rows = fetch_contract_rows(args.database, args.contract)
    history = exclude_current_contract(
        scan_historical_quotes(args.history_root), args.contract
    )
    proposal_rows: list[dict[str, Any]] = []
    blockers: list[str] = []

    for row in rows:
        name = row.get("customsName") or ""
        hs_code = normalize_hs(row.get("hsCode"))
        quantity = float(row.get("quantity") or 0)
        cost_cny = float(row.get("purchaseCost") or 0)
        specification = row.get("specification") or ""
        required_fields = [
            "hsCode", "quantity", "unit", "boxes", "grossWeight", "netWeight", "volume"
        ]
        if args.shipment_summary:
            required_fields.extend(("declaration", "origin"))
        missing = [
            field for field in required_fields if row.get(field) in (None, "")
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
        rejected_historical: dict[str, Any] | None = None
        if historical and refund and cost_cny > 0 and quantity > 0:
            allowed, historical_markup = historical_quote_allowed(
                unit_price_usd=historical.unit_price_usd,
                quantity=quantity,
                effective_rate=effective_rate,
                cost_cny=cost_cny,
                refund_rate=refund.refund_rate,
                no_refund_markup_cap=args.no_refund_markup,
                refundable_markup=args.refundable_markup,
                refundable_tolerance=args.history_markup_tolerance,
            )
            if not allowed:
                rejected_historical = {
                    "contract_no": historical.contract_no,
                    "unit_price_usd": historical.unit_price_usd,
                    "realized_markup_at_effective_fx": round(historical_markup, 6),
                    "reason": (
                        "zero_refund_markup_outside_allowed_range"
                        if refund.refund_rate == 0
                        else "refundable_markup_outside_target_band"
                    ),
                }
                historical = None
        pricing: dict[str, Any]
        if historical:
            unit_price = historical.unit_price_usd
            total_usd = round(unit_price * quantity, 4)
            current_markup = realized_markup(
                unit_price, quantity, effective_rate, cost_cny
            )
            pricing = {
                "source": "historical_quote",
                "unit_price_usd": unit_price,
                "total_usd": total_usd,
                "realized_markup_at_effective_fx": (
                    round(current_markup, 6) if math.isfinite(current_markup) else None
                ),
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
        evidence_conflicts = row.get("evidenceConflicts") or []
        if evidence_conflicts:
            fields = ", ".join(conflict["field"] for conflict in evidence_conflicts)
            blockers.append(f"{name}: source_conflict {fields}")
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
                "origin": row.get("origin"),
                "source_row": row.get("sourceRow"),
                "product_evidence_source": row.get("productEvidenceSource"),
                "evidence_conflicts": evidence_conflicts,
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
                "rejected_historical_quote": rejected_historical,
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
    parser.add_argument("--shipment-summary", type=Path)
    parser.add_argument("--declaration-catalog", type=Path)
    parser.add_argument("--confirmed-workbook", type=Path)
    parser.add_argument("--history-markup-tolerance", type=float, default=0.05)
    parser.add_argument("--history-root", type=Path, default=DEFAULT_HISTORY_ROOT)
    parser.add_argument("--refund-dbf", type=Path, required=True)
    parser.add_argument("--refund-version", default="2026B")
    return parser.parse_args()


if __name__ == "__main__":
    print(json.dumps(build_proposal(parse_args()), ensure_ascii=False, indent=2))
