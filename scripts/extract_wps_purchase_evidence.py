#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: parsed/attachment_inventory.csv + tmp/wps_11_export_list_raw/11-报关记录
Output: parsed/purchase_evidence_*.csv/json/md
Pos: WPS 历史出货采购合同凭证抽取脚本；只抽取供应商、合同头与明细，不写数据库；支持 PDF 文本表格明细抽取，对已人工复核的扫描 PDF 保留路径级 OCR 兜底

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import csv
import json
import re
import sqlite3
import sys
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from docx import Document
from openpyxl import load_workbook

try:
    from pypdf import PdfReader
except ModuleNotFoundError:  # PDF text extraction is optional; DOCX/XLSX evidence remains usable.
    PdfReader = None  # type: ignore[assignment]


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = REPO_ROOT / "tmp/wps_11_export_list_raw/11-报关记录"
PARSED_DIR = REPO_ROOT / "tmp/wps_11_export_list_raw/parsed"
INVENTORY_PATH = PARSED_DIR / "attachment_inventory.csv"
DB_PATH = REPO_ROOT / "backend/prisma/dev.db"

CG_RE = re.compile(r"CG\s*[-_]?\s*(\d{7,8})(?!\d)", re.IGNORECASE)
MONEY_RE = re.compile(r"[-+]?\d[\d,]*(?:\.\d+)?")


PDF_OCR_CURATED_EVIDENCE: dict[str, dict[str, Any]] = {
    "2024年/0506 阿宗石头桌面+不锈钢盖子补充合同/归档-购销合同 CG2400008 阿宗订单.pdf": {
        "purchase_contract_no": "CG2400008",
        "supplier_name": "云浮市锦德石业有限公司",
        "signed_at": "2024-05-14",
        "total_amount": 215466.14,
        "tax_rate": 13,
        "text_preview": "扫描 PDF OCR/图像复核：单页合同顶部乙方为“云浮市锦德石业有限公司”；同目录 XLSX 保留 16 条产品明细。",
        "items": [],
    },
    "2024年/1201 安纳汉姆 吴物流/归档-购销合同 CG2400027 铁艺屏风 第3单.pdf": {
        "purchase_contract_no": "CG2400027",
        "supplier_name": "福建泉州晶联工艺品有限公司",
        "signed_at": "2024-12-01",
        "total_amount": 75769.2,
        "tax_rate": 13,
        "supplier_tax_id": "91350524MA33WK5W8C",
        "text_preview": "扫描 PDF OCR 复核：第 1 页合同号/日期，第 2 页乙方，第 3 页产品清单和总费用。",
        "items": [
            {"product_name": "铁艺屏风 图一底部 1.39*2.438", "unit": "平方米", "quantity": 40.66584, "unit_price": 358, "total_amount": 14558.4},
            {"product_name": "铁艺屏风 图一顶部 1.39*2.8", "unit": "平方米", "quantity": 23.352, "unit_price": 358, "total_amount": 8360.0},
            {"product_name": "铁艺屏风 图二底部 2.75*2.438", "unit": "平方米", "quantity": 80.454, "unit_price": 358, "total_amount": 28802.5},
            {"product_name": "铁艺屏风 图二顶部 2.75*2.8", "unit": "平方米", "quantity": 46.2, "unit_price": 358, "total_amount": 16539.6},
            {"product_name": "13%专票加收费", "unit": "项", "quantity": 1, "unit_price": 7508.7, "total_amount": 7508.7},
        ],
    },
    "2026年4月/归档-购销合同-CG2600024-寿司机-威斯敏.pdf": {
        "purchase_contract_no": "CG2600024",
        "supplier_name": "宜拓（肇庆）科技有限公司",
        "signed_at": "2026-04-23",
        "total_amount": 183253,
        "tax_rate": 13,
        "supplier_address": "肇庆高新区科技路4号",
        "bank_name": "中国银行股份有限公司肇庆高新区科技支行",
        "bank_account": "679580557117",
        "text_preview": "扫描 PDF OCR 复核：第 1 页合同头、设备清单、优惠价和乙方收款信息。",
        "items": [
            {"product_name": "台式拌醋机 MY-D1B", "unit": "台", "quantity": 1, "unit_price": 40454, "total_amount": 40454},
            {"product_name": "寿司饭团机 MY-C1", "unit": "台", "quantity": 1, "unit_price": 48477, "total_amount": 48477},
            {"product_name": "自动切卷机 MY-Q1", "unit": "台", "quantity": 1, "unit_price": 32657, "total_amount": 32657},
            {"product_name": "智能洗米机 MY-XMA", "unit": "台", "quantity": 1, "unit_price": 56274, "total_amount": 56274},
            {"product_name": "保温箱 MY-B10", "unit": "个", "quantity": 20, "unit_price": 622, "total_amount": 12430},
            {"product_name": "寿司托盘 MY-TPB", "unit": "个", "quantity": 100, "unit_price": 113, "total_amount": 11300},
            {"product_name": "寿司机润滑油 MY-RHY", "unit": "瓶", "quantity": 5, "unit_price": 179, "total_amount": 892.7},
            {"product_name": "刀片", "unit": "片", "quantity": 5, "unit_price": 226, "total_amount": 1130},
            {"product_name": "优惠价折扣", "unit": "项", "quantity": 1, "unit_price": -20361.7, "total_amount": -20361.7},
        ],
    },
    "2026年5月/归档-购销合同CG2600030-薄饼架-圣荷西2115.pdf": {
        "purchase_contract_no": "CG2600030",
        "supplier_name": "阳江市江城区浩泰工贸有限公司",
        "signed_at": "2026-05-06",
        "total_amount": 1165,
        "tax_rate": 13,
        "supplier_address": "阳江市江城区岗列鲤鱼山工业区ID-2",
        "bank_name": "中国农业银行股份有限公司阳江金星支行",
        "bank_account": "44551901040003149",
        "text_preview": "扫描 PDF OCR 复核：单页合同显示乙方、两项薄饼架明细、运费和总价。",
        "items": [
            {"product_name": "薄饼架2格", "unit": "个", "quantity": 200, "unit_price": 3.5, "total_amount": 700},
            {"product_name": "薄饼架3格", "unit": "个", "quantity": 100, "unit_price": 4.15, "total_amount": 415},
            {"product_name": "运费", "unit": "项", "quantity": 1, "unit_price": 50, "total_amount": 50},
        ],
    },
    "2026年5月/归档-购销合同CG2600031-冷冻肉切片机-威斯敏.pdf": {
        "purchase_contract_no": "CG2600031",
        "supplier_name": "北京南常肉食机械有限公司",
        "signed_at": "2026-05-06",
        "total_amount": 38000,
        "tax_rate": 13,
        "bank_name": "中国建设银行股份有限公司北京经济技术开发区分行",
        "bank_account": "11001029500056030801",
        "text_preview": "扫描 PDF OCR 复核：第 1 页合同头、乙方、型号 NFC-350YD 和总价。",
        "items": [
            {"product_name": "冷冻肉切片机 NFC-350YD", "unit": "台", "quantity": 2, "unit_price": 19000, "total_amount": 38000},
        ],
    },
}


@dataclass
class PurchaseEvidence:
    relative_path: str
    suffix: str
    inferred_contracts: list[str]
    status: str
    extraction_method: str = ""
    purchase_contract_no: str | None = None
    supplier_name: str | None = None
    signed_at: str | None = None
    total_amount: float | None = None
    tax_rate: int | None = None
    supplier_tax_id: str | None = None
    supplier_address: str | None = None
    bank_name: str | None = None
    bank_account: str | None = None
    item_count: int = 0
    item_total_amount: float | None = None
    db_contract_exists: bool = False
    readiness: str = "blocked"
    issues: list[str] = field(default_factory=list)
    text_preview: str = ""

    def to_row(self) -> dict[str, Any]:
        return {
            "relative_path": self.relative_path,
            "suffix": self.suffix,
            "inferred_contracts": ";".join(self.inferred_contracts),
            "status": self.status,
            "extraction_method": self.extraction_method,
            "purchase_contract_no": self.purchase_contract_no,
            "supplier_name": self.supplier_name,
            "signed_at": self.signed_at,
            "total_amount": self.total_amount,
            "tax_rate": self.tax_rate,
            "supplier_tax_id": self.supplier_tax_id,
            "supplier_address": self.supplier_address,
            "bank_name": self.bank_name,
            "bank_account": self.bank_account,
            "item_count": self.item_count,
            "item_total_amount": self.item_total_amount,
            "db_contract_exists": int(self.db_contract_exists),
            "readiness": self.readiness,
            "issues": "; ".join(unique_list(self.issues)),
            "text_preview": self.text_preview,
        }


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).replace("\u3000", " ")).strip()


def compact_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def unique_list(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def normalize_contract_no(value: Any) -> str | None:
    match = CG_RE.search(clean_text(value).upper())
    return f"CG{match.group(1)}" if match else None


def parse_number(value: Any) -> float | None:
    text = clean_text(value).replace(",", "").replace("，", "").replace("￥", "").replace("¥", "").replace("$", "")
    if not text:
        return None
    match = MONEY_RE.search(text)
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return None


def parse_tax_rate(value: Any) -> int | None:
    text = clean_text(value).replace("%", "")
    number = parse_number(text)
    if number is None:
        return None
    if 0 < number <= 1:
        number *= 100
    return int(round(number))


def parse_chinese_date(text: str) -> str | None:
    iso_match = re.search(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s+\d{1,2}:\d{2}:\d{2})?", text)
    if iso_match:
        year, month, day = (int(part) for part in iso_match.groups())
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            return None
    match = re.search(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", text)
    if not match:
        return None
    year, month, day = (int(part) for part in match.groups())
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def useful_value(value: Any) -> str | None:
    text = clean_text(value).strip(" ：:|/")
    if not text or text in {"0", "0.0", "None"}:
        return None
    return text


def first_match(patterns: list[str], text: str) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return clean_text(match.group(1))
    return None


def seller_side_text(tables: list[list[list[str]]]) -> str:
    chunks: list[str] = []
    for table in tables:
        for row in table:
            if len(row) >= 2 and ("甲方" in row[0] or "需方" in row[0]) and ("乙方" in row[1] or "供方" in row[1]):
                chunks.append(row[1])
            for cell in row:
                if ("乙方" in cell or "供方" in cell) and ("单位名称" in cell or "纳税人识别号" in cell):
                    chunks.append(cell)
    return " ".join(chunks)


def value_until(pattern: str, text: str, terminators: str) -> str | None:
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    value = clean_text(match.group(1))
    value = re.split(terminators, value, maxsplit=1)[0]
    return clean_text(value.strip(" ：:|/")) or None


def seller_label_values(tables: list[list[list[str]]], label: str) -> list[str]:
    values: list[str] = []
    for table in tables:
        for row in table:
            for index, cell in enumerate(row):
                if label in cell and index + 1 < len(row):
                    value = useful_value(row[index + 1])
                    if value:
                        values.append(value)
    return values


def seller_bank_values(tables: list[list[list[str]]]) -> tuple[str | None, str | None]:
    bank_name = None
    bank_account = None
    for table in tables:
        for row in table:
            for index, cell in enumerate(row):
                if "开户银行及账号" not in cell:
                    continue
                trailing = [useful_value(value) for value in row[index + 1:index + 3]]
                trailing = [value for value in trailing if value]
                if trailing:
                    bank_name = trailing[0]
                for value in trailing:
                    account_match = re.search(r"\d{8,40}", value.replace(" ", ""))
                    if account_match:
                        bank_account = account_match.group(0)
    return bank_name, bank_account


def table_cells(table: Any) -> list[list[str]]:
    rows: list[list[str]] = []
    for row in table.rows:
        rows.append([clean_text(cell.text) for cell in row.cells])
    return rows


def docx_text(element: ElementTree.Element) -> str:
    return clean_text("".join(node.text or "" for node in element.iter() if node.tag.endswith("}t")))


def read_docx_xml(path: Path) -> tuple[str, list[list[list[str]]]]:
    with zipfile.ZipFile(path) as archive:
        document_xml = archive.read("word/document.xml")
    root = ElementTree.fromstring(document_xml)
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:body/w:p", namespace):
        text = docx_text(paragraph)
        if text:
            paragraphs.append(text)
    tables: list[list[list[str]]] = []
    for table in root.findall(".//w:tbl", namespace):
        rows: list[list[str]] = []
        for table_row in table.findall("./w:tr", namespace):
            row = [docx_text(cell) for cell in table_row.findall("./w:tc", namespace)]
            if any(row):
                rows.append(row)
        if rows:
            tables.append(rows)
    table_text = [" | ".join(cell for cell in row if cell) for table in tables for row in table]
    return "\n".join(paragraphs + table_text), tables


def read_docx(path: Path) -> tuple[str, list[list[list[str]]]]:
    try:
        document = Document(path)
    except Exception as exc:
        try:
            return read_docx_xml(path)
        except Exception:
            raise exc
    paragraphs = [clean_text(paragraph.text) for paragraph in document.paragraphs if clean_text(paragraph.text)]
    tables = [table_cells(table) for table in document.tables]
    table_text = [" | ".join(cell for cell in row if cell) for table in tables for row in table]
    return "\n".join(paragraphs + table_text), tables


def read_xlsx(path: Path) -> tuple[str, list[list[list[str]]]]:
    workbook = load_workbook(path, data_only=True, read_only=True)
    all_tables: list[list[list[str]]] = []
    chunks: list[str] = []
    for sheet in workbook.worksheets:
        sheet_rows: list[list[str]] = []
        chunks.append(f"## {sheet.title}")
        for row in sheet.iter_rows(values_only=True):
            values = [clean_text(value) for value in row]
            if any(values):
                trimmed = [value for value in values if value]
                sheet_rows.append(trimmed)
                chunks.append(" | ".join(trimmed))
        if sheet_rows:
            all_tables.append(sheet_rows)
    return "\n".join(chunks), all_tables


def read_pdf(path: Path) -> tuple[str, list[list[list[str]]]]:
    if PdfReader is None:
        return "", []
    reader = PdfReader(str(path))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    return text, []


def extract_supplier_details(evidence: PurchaseEvidence, text: str, tables: list[list[list[str]]]) -> None:
    for line in text.splitlines():
        if "乙方" in line and "供方" in line and "单位名称" not in line:
            supplier = re.split(r"乙方[（(]供方[）)]\s*[：:]*", line, maxsplit=1)
            if len(supplier) == 2 and useful_value(supplier[1]):
                evidence.supplier_name = useful_value(supplier[1])
                break

    seller_names = seller_label_values(tables, "乙方")
    tax_ids = seller_label_values(tables, "纳税识别号")
    addresses = seller_label_values(tables, "地址")
    bank_name, bank_account = seller_bank_values(tables)
    if seller_names:
        evidence.supplier_name = useful_value(seller_names[-1]) or evidence.supplier_name
    if tax_ids:
        evidence.supplier_tax_id = useful_value(tax_ids[-1])
    if addresses:
        evidence.supplier_address = useful_value(addresses[-1])
    evidence.bank_name = bank_name or evidence.bank_name
    evidence.bank_account = bank_account or evidence.bank_account

    seller_text = seller_side_text(tables)
    if not seller_text:
        compact = compact_text(text)
        if "乙方（供方）" in compact:
            seller_text = compact.rsplit("乙方（供方）", 1)[-1]
        elif "乙方(供方)" in compact:
            seller_text = compact.rsplit("乙方(供方)", 1)[-1]
    evidence.supplier_name = evidence.supplier_name or useful_value(value_until(
        r"单位名称（盖章）[：:\s]*([^|/]+)",
        seller_text,
        r"委托代理人|纳税人识别号|单位地址|收款银行|电话|邮箱",
    ))
    evidence.supplier_tax_id = evidence.supplier_tax_id or first_match([r"纳税人识别号[：:\s]*([0-9A-Z ]{15,24})"], seller_text)
    if evidence.supplier_tax_id:
        evidence.supplier_tax_id = evidence.supplier_tax_id.replace(" ", "")
    evidence.supplier_address = evidence.supplier_address or value_until(
        r"单位地址[：:\s]*([^|/]+)",
        seller_text,
        r"收款银行|收款帐号|收款账号|电话|邮箱",
    )
    evidence.bank_name = evidence.bank_name or value_until(
        r"(?:收款银行|开户银行)[：:\s]*([^|/]+)",
        seller_text,
        r"收款帐号|收款账号|银行帐号|银行账号|电话|邮箱",
    )
    evidence.bank_account = evidence.bank_account or first_match([r"(?:收款帐号|收款账号|银行帐号|银行账号)[：:\s]*([0-9 ]{8,40})"], seller_text)
    if evidence.bank_account:
        evidence.bank_account = re.sub(r"\s+", "", evidence.bank_account)


def parse_item_tables(evidence: PurchaseEvidence, tables: list[list[list[str]]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for table in tables:
        if not table:
            continue
        header_index = None
        for index, row in enumerate(table):
            joined = "".join(row)
            if "产品" in joined and "数量" in joined and "总金额" in joined:
                header_index = index
                break
        if header_index is None:
            continue
        header = table[header_index]
        index_by_key = {}
        for idx, cell in enumerate(header):
            if "序号" in cell:
                index_by_key["line_no"] = idx
            elif "产品" in cell:
                index_by_key["product_name"] = idx
            elif "单位" in cell:
                index_by_key["unit"] = idx
            elif "数量" in cell:
                index_by_key["quantity"] = idx
            elif "单价" in cell:
                index_by_key["unit_price"] = idx
            elif cell == "金额":
                index_by_key["amount_without_tax"] = idx
            elif "税率" in cell:
                index_by_key["tax_rate"] = idx
            elif "税额" in cell:
                index_by_key["tax_amount"] = idx
            elif "总金额" in cell:
                index_by_key["total_amount"] = idx
        for row in table[header_index + 1:]:
            joined = "".join(row)
            if not joined or "合计" in joined or "小计" in joined:
                continue
            product_idx = index_by_key.get("product_name")
            if product_idx is None or product_idx >= len(row):
                continue
            line_idx = index_by_key.get("line_no")
            if line_idx is not None:
                if line_idx >= len(row):
                    continue
                line_no = parse_number(row[line_idx])
                if line_no is None or line_no <= 0:
                    continue
            product_name = clean_text(row[product_idx])
            if (
                not product_name
                or product_name in {"0", "0.0"}
                or product_name.startswith(("甲方", "乙方", "纳税", "地址", "电话", "开户"))
                or re.fullmatch(r"[-+]?\d+(?:\.\d+)?", product_name)
            ):
                continue
            unit_value = row[index_by_key["unit"]] if "unit" in index_by_key and index_by_key["unit"] < len(row) else None
            quantity_value = row[index_by_key["quantity"]] if "quantity" in index_by_key and index_by_key["quantity"] < len(row) else None
            unit = clean_text(unit_value)
            quantity = parse_number(quantity_value)
            if quantity is None and parse_number(unit_value) is not None and clean_text(quantity_value):
                quantity = parse_number(unit_value)
                unit = clean_text(quantity_value)
            item = {
                "relative_path": evidence.relative_path,
                "purchase_contract_no": evidence.purchase_contract_no,
                "supplier_name": evidence.supplier_name,
                "product_name": product_name,
                "unit": unit or None,
                "quantity": quantity,
                "unit_price": parse_number(row[index_by_key["unit_price"]]) if "unit_price" in index_by_key and index_by_key["unit_price"] < len(row) else None,
                "amount_without_tax": parse_number(row[index_by_key["amount_without_tax"]]) if "amount_without_tax" in index_by_key and index_by_key["amount_without_tax"] < len(row) else None,
                "tax_rate": parse_tax_rate(row[index_by_key["tax_rate"]]) if "tax_rate" in index_by_key and index_by_key["tax_rate"] < len(row) else None,
                "tax_amount": parse_number(row[index_by_key["tax_amount"]]) if "tax_amount" in index_by_key and index_by_key["tax_amount"] < len(row) else None,
                "total_amount": parse_number(row[index_by_key["total_amount"]]) if "total_amount" in index_by_key and index_by_key["total_amount"] < len(row) else None,
            }
            if (
                product_name in {"个", "件", "台", "套", "片", "千克", "平方米"}
                and (item["quantity"] is None or item["quantity"] <= 0)
                and (item["total_amount"] is None or item["total_amount"] <= 0)
            ):
                continue
            items.append(item)
    return items


def parse_pdf_text_items(text: str, relative_path: str) -> list[dict[str, Any]]:
    one_line = compact_text(text)
    table_match = re.search(
        r"序号\s+产品\s+单位\s+数量\s+单价[^总]*总金额\s+(.+?)\s+合计人民币",
        one_line,
    )
    search_text = table_match.group(1) if table_match else one_line
    unit_pattern = r"平方米|千克|公斤|套|台|个|件|片|项|瓶|张|只|把|块|米"
    item_pattern = re.compile(
        rf"(?:^|\s)(\d{{1,3}})\s+([^￥\n]+?)\s+({unit_pattern})\s+"
        r"([-+]?\d+(?:\.\d+)?)\s+￥?\s*([0-9,]+(?:\.\d+)?)\s+"
        r"￥?\s*([0-9,]+(?:\.\d+)?)\s+(\d{1,3})%\s+"
        r"￥?\s*([0-9,]+(?:\.\d+)?)\s+￥?\s*([0-9,]+(?:\.\d+)?)"
    )
    items: list[dict[str, Any]] = []
    for match in item_pattern.finditer(search_text):
        product_name = clean_text(match.group(2))
        if not product_name or product_name in {"产品", "序号"}:
            continue
        items.append({
            "relative_path": relative_path,
            "purchase_contract_no": "",
            "supplier_name": "",
            "product_name": product_name,
            "unit": match.group(3),
            "quantity": parse_number(match.group(4)),
            "unit_price": parse_number(match.group(5)),
            "amount_without_tax": parse_number(match.group(6)),
            "tax_rate": parse_tax_rate(match.group(7)),
            "tax_amount": parse_number(match.group(8)),
            "total_amount": parse_number(match.group(9)),
        })
    return items


def fill_fields(evidence: PurchaseEvidence, text: str, tables: list[list[list[str]]]) -> list[dict[str, Any]]:
    one_line = compact_text(text)
    evidence.purchase_contract_no = normalize_contract_no(one_line) or evidence.purchase_contract_no
    evidence.signed_at = parse_chinese_date(one_line)
    extract_supplier_details(evidence, text, tables)
    items = parse_item_tables(evidence, tables)
    if not items and evidence.extraction_method == "pdf_text":
        items = parse_pdf_text_items(text, evidence.relative_path)
    evidence.item_count = len(items)
    totals = [item["total_amount"] for item in items if item.get("total_amount") is not None]
    if totals:
        evidence.item_total_amount = round(sum(float(value) for value in totals), 4)
        evidence.total_amount = evidence.item_total_amount
    for item in items:
        if item.get("tax_rate") is not None:
            evidence.tax_rate = item["tax_rate"]
            break
    if evidence.total_amount is None:
        evidence.total_amount = parse_number(first_match([
            r"合计人民币小写[：:\s|]*￥?\s*([0-9,]+(?:\.\d+)?)",
            r"总金额为[：:\s|]*￥?\s*([0-9,]+(?:\.\d+)?)\s*元",
        ], one_line))
    if evidence.tax_rate is None:
        evidence.tax_rate = parse_tax_rate(first_match([
            r"含税[（(]?\s*(\d{1,3})\s*%?\s*增值税",
            r"(\d{1,3})\s*%\s*增值税",
        ], one_line))
    evidence.text_preview = one_line[:500]
    return items


def fill_pdf_ocr_curated(evidence: PurchaseEvidence, curated: dict[str, Any]) -> list[dict[str, Any]]:
    for field_name in [
        "purchase_contract_no",
        "supplier_name",
        "signed_at",
        "total_amount",
        "tax_rate",
        "supplier_tax_id",
        "supplier_address",
        "bank_name",
        "bank_account",
        "text_preview",
    ]:
        value = curated.get(field_name)
        if value not in (None, ""):
            setattr(evidence, field_name, value)
    evidence.extraction_method = "pdf_ocr_curated"
    items: list[dict[str, Any]] = []
    for item in curated.get("items", []):
        items.append({
            "relative_path": evidence.relative_path,
            "purchase_contract_no": evidence.purchase_contract_no,
            "supplier_name": evidence.supplier_name,
            "product_name": item.get("product_name"),
            "unit": item.get("unit"),
            "quantity": item.get("quantity"),
            "unit_price": item.get("unit_price"),
            "amount_without_tax": item.get("amount_without_tax"),
            "tax_rate": item.get("tax_rate", evidence.tax_rate),
            "tax_amount": item.get("tax_amount"),
            "total_amount": item.get("total_amount"),
        })
    evidence.item_count = len(items)
    totals = [item["total_amount"] for item in items if item.get("total_amount") is not None]
    if totals:
        evidence.item_total_amount = round(sum(float(value) for value in totals), 4)
    return items


def load_inventory() -> list[dict[str, str]]:
    with INVENTORY_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        return [row for row in csv.DictReader(handle) if row["category"] == "purchase_contract"]


def load_db_contracts() -> set[str]:
    conn = sqlite3.connect(DB_PATH)
    return {row[0] for row in conn.execute("select contractNo from purchase_contracts")}


def assess(evidence: PurchaseEvidence, db_contracts: set[str]) -> None:
    if evidence.purchase_contract_no:
        evidence.db_contract_exists = evidence.purchase_contract_no in db_contracts
    if evidence.status != "ok":
        evidence.readiness = "blocked"
        return
    for field_name in ["purchase_contract_no", "supplier_name", "signed_at", "total_amount"]:
        if not getattr(evidence, field_name):
            evidence.issues.append(f"missing_{field_name}")
    if evidence.item_count == 0:
        evidence.issues.append("missing_items")
    if evidence.item_count > 0:
        invalid_items = [
            item for item in getattr(evidence, "_items_for_assessment", [])
            if not item.get("quantity") or not item.get("unit_price") or not item.get("total_amount")
        ]
        if invalid_items:
            evidence.issues.append("invalid_item_amounts")
    header_complete = all(getattr(evidence, field_name) for field_name in [
        "purchase_contract_no",
        "supplier_name",
        "signed_at",
        "total_amount",
    ])
    issue_set = set(unique_list(evidence.issues))
    if evidence.db_contract_exists:
        evidence.readiness = "already_in_db"
    elif header_complete and issue_set == {"missing_items"}:
        evidence.readiness = "header_ready_for_import"
    elif evidence.issues:
        evidence.readiness = "needs_review"
    else:
        evidence.readiness = "ready_for_import"


def extract_one(row: dict[str, str], db_contracts: set[str]) -> tuple[PurchaseEvidence, list[dict[str, Any]]]:
    relative_path = row["relative_path"]
    path = SOURCE_ROOT / relative_path
    evidence = PurchaseEvidence(
        relative_path=relative_path,
        suffix=row["suffix"],
        inferred_contracts=[item for item in row["inferred_contracts"].split(";") if item],
        status="ok",
    )
    inventory_contracts = [item for item in row.get("purchase_contract_nos", "").split(";") if item]
    if len(inventory_contracts) == 1:
        evidence.purchase_contract_no = inventory_contracts[0]
    items: list[dict[str, Any]] = []
    try:
        suffix = path.suffix.lower()
        if suffix == ".docx":
            text, tables = read_docx(path)
            evidence.extraction_method = "docx"
        elif suffix == ".xlsx":
            text, tables = read_xlsx(path)
            evidence.extraction_method = "xlsx"
        elif suffix == ".pdf":
            has_curated_ocr = relative_path in PDF_OCR_CURATED_EVIDENCE
            if PdfReader is None and not has_curated_ocr:
                evidence.issues.append("pdf_text_extractor_unavailable")
            text, tables = read_pdf(path)
            evidence.extraction_method = "pdf_text"
            if not text and has_curated_ocr:
                items = fill_pdf_ocr_curated(evidence, PDF_OCR_CURATED_EVIDENCE[relative_path])
                setattr(evidence, "_items_for_assessment", items)
        else:
            text, tables = "", []
            evidence.status = "unsupported_suffix"
        if text:
            items = fill_fields(evidence, text, tables)
            setattr(evidence, "_items_for_assessment", items)
        elif items:
            pass
        elif evidence.status == "ok":
            evidence.status = "empty_text"
            evidence.issues.append("no_extractable_text")
    except Exception as exc:  # noqa: BLE001 - preserve failed evidence file.
        evidence.status = "parse_error"
        evidence.issues.append(str(exc))
    assess(evidence, db_contracts)
    for item in items:
        item["purchase_contract_no"] = evidence.purchase_contract_no
        item["supplier_name"] = evidence.supplier_name
    return evidence, items


def preferred_evidence(extracts: list[PurchaseEvidence]) -> dict[str, PurchaseEvidence]:
    rank = {"docx": 1, "xlsx": 2, "pdf_ocr_curated": 3, "pdf_text": 4}
    grouped: dict[str, list[PurchaseEvidence]] = defaultdict(list)
    for evidence in extracts:
        if evidence.purchase_contract_no:
            grouped[evidence.purchase_contract_no].append(evidence)
    result: dict[str, PurchaseEvidence] = {}
    for contract_no, rows in grouped.items():
        result[contract_no] = sorted(
            rows,
            key=lambda item: (
                0 if item.readiness == "ready_for_import" else 1 if item.readiness == "header_ready_for_import" else 2 if item.readiness == "already_in_db" else 3,
                rank.get(item.extraction_method, 9),
                -item.item_count,
                item.relative_path,
            ),
        )[0]
    return result


def backfill_supplier_from_signed_pdf(extracts: list[PurchaseEvidence], items: list[dict[str, Any]]) -> None:
    grouped: dict[str, list[PurchaseEvidence]] = defaultdict(list)
    for evidence in extracts:
        if evidence.purchase_contract_no:
            grouped[evidence.purchase_contract_no].append(evidence)

    for contract_no, rows in grouped.items():
        signed_pdf_suppliers = {
            row.supplier_name
            for row in rows
            if row.supplier_name
            and row.suffix.lower() == ".pdf"
            and row.extraction_method == "pdf_ocr_curated"
        }
        if len(signed_pdf_suppliers) != 1:
            continue
        supplier_name = next(iter(signed_pdf_suppliers))
        for row in rows:
            if row.supplier_name:
                continue
            row.supplier_name = supplier_name
            # 乙方为空的 XLSX 可能在尾部签章区误抽到甲方税号/地址/银行；PDF 只证明乙方名称。
            row.supplier_tax_id = None
            row.supplier_address = None
            row.bank_name = None
            row.bank_account = None
            row.issues = [issue for issue in row.issues if issue != "missing_supplier_name"]
            if row.status == "ok" and row.issues:
                row.readiness = "needs_review"
            elif row.status == "ok" and row.db_contract_exists:
                row.readiness = "already_in_db"
            elif row.status == "ok":
                row.readiness = "ready_for_import"
            if "supplier_backfilled_from_signed_pdf" not in row.extraction_method:
                row.extraction_method = f"{row.extraction_method}+supplier_backfilled_from_signed_pdf"
        for item in items:
            if item.get("purchase_contract_no") == contract_no and not item.get("supplier_name"):
                item["supplier_name"] = supplier_name


def write_outputs(extracts: list[PurchaseEvidence], items: list[dict[str, Any]]) -> None:
    PARSED_DIR.mkdir(parents=True, exist_ok=True)
    rows = [extract.to_row() for extract in extracts]
    preferred = preferred_evidence(extracts)
    csv_path = PARSED_DIR / "purchase_evidence_extracts.csv"
    item_path = PARSED_DIR / "purchase_evidence_items.csv"
    preferred_path = PARSED_DIR / "purchase_evidence_preferred.csv"
    json_path = PARSED_DIR / "purchase_evidence_summary.json"
    summary_path = PARSED_DIR / "purchase_evidence_summary.md"

    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()) if rows else [])
        if rows:
            writer.writeheader()
            writer.writerows(rows)

    item_fields = [
        "relative_path",
        "purchase_contract_no",
        "supplier_name",
        "product_name",
        "unit",
        "quantity",
        "unit_price",
        "amount_without_tax",
        "tax_rate",
        "tax_amount",
        "total_amount",
    ]
    with item_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=item_fields)
        writer.writeheader()
        writer.writerows(items)

    preferred_rows = [evidence.to_row() for evidence in sorted(preferred.values(), key=lambda item: item.purchase_contract_no or "")]
    with preferred_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()) if rows else [])
        if rows:
            writer.writeheader()
            writer.writerows(preferred_rows)

    missing_contracts = [item for item in preferred.values() if not item.db_contract_exists]
    ready_missing = [item for item in missing_contracts if item.readiness == "ready_for_import"]
    header_ready_missing = [item for item in missing_contracts if item.readiness == "header_ready_for_import"]
    summary = {
        "extract_count": len(extracts),
        "preferred_contract_count": len(preferred),
        "item_count": len(items),
        "status_counts": dict(sorted(Counter(item.status for item in extracts).items())),
        "method_counts": dict(sorted(Counter(item.extraction_method for item in extracts).items())),
        "readiness_counts": dict(sorted(Counter(item.readiness for item in extracts).items())),
        "missing_contract_count": len(missing_contracts),
        "ready_missing_contract_count": len(ready_missing),
        "header_ready_missing_contract_count": len(header_ready_missing),
        "missing_contracts": sorted(item.purchase_contract_no for item in missing_contracts if item.purchase_contract_no),
        "ready_missing_contracts": sorted(item.purchase_contract_no for item in ready_missing if item.purchase_contract_no),
        "header_ready_missing_contracts": sorted(item.purchase_contract_no for item in header_ready_missing if item.purchase_contract_no),
    }
    json_path.write_text(json.dumps({"summary": summary, "extracts": rows, "preferred": preferred_rows}, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# WPS 采购合同凭证抽取",
        "",
        f"- 附件抽取数：`{summary['extract_count']}`",
        f"- 唯一采购合同数：`{summary['preferred_contract_count']}`",
        f"- 抽取明细行数：`{summary['item_count']}`",
        f"- 库里缺失采购合同数：`{summary['missing_contract_count']}`",
        f"- 缺失且字段齐全可导入数：`{summary['ready_missing_contract_count']}`",
        f"- 缺失且仅合同头可导入数：`{summary['header_ready_missing_contract_count']}`",
        "",
        "## Readiness",
        "",
    ]
    for key, count in summary["readiness_counts"].items():
        lines.append(f"- `{key}`: `{count}`")
    lines.extend(["", "## 缺失且字段齐全的采购合同", ""])
    for contract_no in summary["ready_missing_contracts"][:120]:
        row = preferred[contract_no]
        lines.append(f"- `{contract_no}` `{row.supplier_name}` `{row.total_amount}` {row.relative_path}")
    lines.extend(["", "## 缺失且仅合同头可导入的采购合同", ""])
    for contract_no in summary["header_ready_missing_contracts"][:120]:
        row = preferred[contract_no]
        lines.append(f"- `{contract_no}` `{row.supplier_name}` `{row.total_amount}` {row.relative_path}")
    summary_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    if not INVENTORY_PATH.exists():
        print(f"missing inventory: {INVENTORY_PATH}", file=sys.stderr)
        return 1
    db_contracts = load_db_contracts()
    extracts: list[PurchaseEvidence] = []
    items: list[dict[str, Any]] = []
    for row in load_inventory():
        evidence, row_items = extract_one(row, db_contracts)
        extracts.append(evidence)
        items.extend(row_items)
    backfill_supplier_from_signed_pdf(extracts, items)
    write_outputs(extracts, items)
    preferred = preferred_evidence(extracts)
    ready_missing = [
        item for item in preferred.values()
        if not item.db_contract_exists and item.readiness == "ready_for_import"
    ]
    header_ready_missing = [
        item for item in preferred.values()
        if not item.db_contract_exists and item.readiness == "header_ready_for_import"
    ]
    print(json.dumps({
        "extract_count": len(extracts),
        "preferred_contract_count": len(preferred),
        "item_count": len(items),
        "ready_missing_contract_count": len(ready_missing),
        "header_ready_missing_contract_count": len(header_ready_missing),
        "readiness_counts": dict(sorted(Counter(item.readiness for item in extracts).items())),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
