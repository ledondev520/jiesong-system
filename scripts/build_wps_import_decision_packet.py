#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: tmp/wps_11_export_list_raw/parsed import/evidence/purchase reports + backend/prisma/dev.db
Output: parsed/wps_import_decision_packet.{csv,json,md}
Pos: WPS 历史导入待业务裁决事项聚合脚本；补充旧装箱候选、销售缺门店源行/候选/现库摘要、路径门店推断复核项、真实凭证缺口同目录证据；不写数据库

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

from __future__ import annotations

import csv
import json
import sqlite3
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
PARSED_DIR = REPO_ROOT / "tmp/wps_11_export_list_raw/parsed"
DB_PATH = REPO_ROOT / "backend/prisma/dev.db"
OUT_CSV = PARSED_DIR / "wps_import_decision_packet.csv"
OUT_JSON = PARSED_DIR / "wps_import_decision_packet.json"
OUT_MD = PARSED_DIR / "wps_import_decision_packet.md"


@dataclass
class DecisionItem:
    priority: str
    category: str
    subject: str
    source: str
    evidence: str
    required_decision: str
    suggested_next_step: str


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def compact(value: Any, limit: int = 360) -> str:
    text = " ".join(str(value or "").split())
    return text if len(text) <= limit else text[:limit - 1] + "…"


def looks_numeric(value: Any) -> bool:
    text = str(value or "").replace(",", "").replace("$", "").replace("¥", "").replace("￥", "").strip()
    if not text:
        return False
    try:
        float(text)
    except ValueError:
        return False
    return True


def source_ref(row: dict[str, Any]) -> str:
    source = row.get("source")
    if source:
        return str(source)
    source_file = row.get("source_file")
    sheet = row.get("sheet")
    line = row.get("row")
    if source_file and sheet and line:
        return f"{source_file}#{sheet}:{line}"
    return str(row.get("relative_path") or "")


def source_ref_aliases(row: dict[str, Any]) -> list[str]:
    refs = [source_ref(row)]
    source_file = row.get("source_file")
    sheet = row.get("sheet")
    line = row.get("row")
    if source_file and sheet and line:
        normalized_sheet = " ".join(str(sheet).split())
        refs.append(f"{source_file}#{normalized_sheet}:{line}")
    return list(dict.fromkeys(refs))


def load_packing_candidate_details(candidate_ids: set[str]) -> dict[str, dict[str, Any]]:
    if not candidate_ids or not DB_PATH.exists():
        return {}
    placeholders = ",".join("?" for _ in candidate_ids)
    query = f"""
        SELECT
            pi.id,
            sc.contractNo,
            p.customsName,
            p.description,
            st.name AS storeName,
            pi.quantity,
            pi.unit,
            pi.boxes,
            pi.grossWeight,
            pi.netWeight,
            pi.volume,
            pi.manufacturer,
            pi.specification,
            pi.purchaseContractNo,
            pi.invoiceNo,
            pi.note
        FROM packing_items pi
        JOIN sales_contracts sc ON sc.id = pi.salesContractId
        JOIN products p ON p.id = pi.productId
        LEFT JOIN stores st ON st.id = pi.storeId
        WHERE pi.id IN ({placeholders})
    """
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(query, sorted(candidate_ids)).fetchall()
    return {row["id"]: dict(row) for row in rows}


def load_sales_candidate_details(candidate_ids: set[str]) -> dict[str, dict[str, Any]]:
    if not candidate_ids or not DB_PATH.exists():
        return {}
    placeholders = ",".join("?" for _ in candidate_ids)
    query = f"""
        SELECT
            si.id,
            sc.contractNo,
            p.customsName,
            p.description,
            st.name AS storeName,
            si.quantity,
            si.unit,
            si.sellingPrice,
            si.specification,
            si.note
        FROM sales_items si
        JOIN sales_contracts sc ON sc.id = si.salesContractId
        JOIN products p ON p.id = si.productId
        LEFT JOIN stores st ON st.id = si.storeId
        WHERE si.id IN ({placeholders})
    """
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(query, sorted(candidate_ids)).fetchall()
    return {row["id"]: dict(row) for row in rows}


def load_sales_rows_by_contract(contract_nos: set[str]) -> dict[str, list[dict[str, Any]]]:
    if not contract_nos or not DB_PATH.exists():
        return {}
    placeholders = ",".join("?" for _ in contract_nos)
    query = f"""
        SELECT
            sc.contractNo,
            p.customsName,
            p.description,
            st.name AS storeName,
            si.quantity,
            si.unit,
            si.sellingPrice,
            si.note
        FROM sales_items si
        JOIN sales_contracts sc ON sc.id = si.salesContractId
        JOIN products p ON p.id = si.productId
        LEFT JOIN stores st ON st.id = si.storeId
        WHERE sc.contractNo IN ({placeholders})
        ORDER BY sc.contractNo, p.customsName, st.name
    """
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        rows = [dict(row) for row in conn.execute(query, sorted(contract_nos)).fetchall()]
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(str(row["contractNo"]), []).append(row)
    return grouped


def same_product_name(left: str, right: str) -> bool:
    left = str(left or "")
    right = str(right or "")
    if not left or not right:
        return False
    return left == right or left in right or right in left


def sales_context(
    contract_no: str,
    product_names: set[str],
    sales_rows_by_contract: dict[str, list[dict[str, Any]]],
) -> str:
    rows = []
    for row in sales_rows_by_contract.get(contract_no, []):
        names = {str(row.get("customsName") or ""), str(row.get("description") or "")}
        if not any(same_product_name(left, right) for left in product_names for right in names):
            continue
        note = str(row.get("note") or "")
        source_flag = "有WPS来源" if "[WPS_SOURCE]" in note else "无WPS来源"
        rows.append(
            f"{row.get('storeName') or '未填门店'}:{row.get('quantity')}{row.get('unit') or ''}@{row.get('sellingPrice')}({source_flag})"
        )
    return "；同商品销售行=" + " | ".join(rows[:8]) if rows else ""


def candidate_summary(candidate: dict[str, Any], details: dict[str, dict[str, Any]]) -> str:
    candidate_id = str(candidate.get("packingItemId", ""))
    detail = details.get(candidate_id, {})
    if not detail:
        return f"{candidate_id}(score={candidate.get('score', '')})"
    product = detail.get("description") or detail.get("customsName") or ""
    store = detail.get("storeName") or "未填门店"
    qty = detail.get("quantity")
    unit = detail.get("unit") or ""
    boxes = detail.get("boxes")
    gross = detail.get("grossWeight")
    net = detail.get("netWeight")
    volume = detail.get("volume")
    manufacturer = detail.get("manufacturer") or ""
    parts = [
        f"id={candidate_id}",
        f"score={candidate.get('score', '')}",
        f"门店={store}",
        f"商品={product}",
        f"数量={qty}{unit}",
        f"箱数={boxes}",
        f"毛/净/体积={gross}/{net}/{volume}",
    ]
    if manufacturer:
        parts.append(f"厂家={manufacturer}")
    return "；".join(parts)


def sales_candidate_summary(candidate: dict[str, Any], details: dict[str, dict[str, Any]]) -> str:
    candidate_id = str(candidate.get("salesItemId", ""))
    detail = details.get(candidate_id, {})
    if not detail:
        return f"{candidate_id}(score={candidate.get('score', '')})"
    product = detail.get("description") or detail.get("customsName") or ""
    store = detail.get("storeName") or "未填门店"
    qty = detail.get("quantity")
    unit = detail.get("unit") or ""
    price = detail.get("sellingPrice")
    spec = detail.get("specification") or ""
    note = detail.get("note") or ""
    return compact(
        f"id={candidate_id}；score={candidate.get('score', '')}；门店={store}；商品={product}；"
        f"数量={qty}{unit}；售价={price}；规格={spec}；现有备注={note}",
        limit=900,
    )


def source_rows_by_ref() -> dict[str, dict[str, str]]:
    rows = read_csv(PARSED_DIR / "preferred_packing_items.csv")
    result: dict[str, dict[str, str]] = {}
    for row in rows:
        for ref in source_ref_aliases(row):
            result[ref] = row
    return result


def sales_source_rows_by_ref() -> dict[str, dict[str, str]]:
    rows = read_csv(PARSED_DIR / "preferred_sales_items.csv")
    result: dict[str, dict[str, str]] = {}
    for row in rows:
        for ref in source_ref_aliases(row):
            result[ref] = row
    return result


def packing_rows_by_contract_product() -> dict[tuple[str, str], list[dict[str, str]]]:
    grouped: dict[tuple[str, str], list[dict[str, str]]] = {}
    for row in read_csv(PARSED_DIR / "preferred_packing_items.csv"):
        key = (str(row.get("contract_no") or ""), str(row.get("product_name") or ""))
        if not key[0] or not key[1]:
            continue
        grouped.setdefault(key, []).append(row)
    return grouped


def source_row_summary(row: dict[str, Any] | None) -> str:
    if not row:
        return ""
    return compact(
        "；".join(
            [
                f"源商品={row.get('product_name', '')}",
                f"源门店={row.get('store', '') or '未填'}",
                f"源港口={row.get('port', '') or '未填'}",
                f"源数量={row.get('quantity', '')}{row.get('unit', '')}",
                f"源箱数={row.get('boxes', '')}",
                f"源毛/净/体积={row.get('gross_weight', '')}/{row.get('net_weight', '')}/{row.get('volume', '')}",
                f"源厂家={row.get('manufacturer', '')}",
            ]
        ),
        limit=260,
    )


def sales_source_row_summary(row: dict[str, Any] | None) -> str:
    if not row:
        return "销售源行=未找到"
    unit = "" if looks_numeric(row.get("unit")) else row.get("unit", "")
    return compact(
        "；".join(
            [
                f"销售源商品={row.get('product_name', '')}",
                f"源数量={row.get('quantity', '')}{unit}",
                f"源单价={row.get('unit_price', '')}",
                f"源总价={row.get('total_price', '')}",
                f"源规格={row.get('specification', '')}",
            ]
        ),
        limit=240,
    )


def packing_source_candidates_summary(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "同商品装箱候选=未找到"
    parts = []
    for row in rows[:8]:
        parts.append(
            compact(
                "；".join(
                    [
                        f"{row.get('store') or '未填门店'}",
                        f"数量={row.get('quantity', '')}{row.get('unit', '')}",
                        f"箱数={row.get('boxes', '')}",
                        f"毛/净/体积={row.get('gross_weight', '')}/{row.get('net_weight', '')}/{row.get('volume', '')}",
                        f"来源={source_ref(row)}",
                    ]
                ),
                limit=260,
            )
        )
    suffix = f"；另有{len(rows) - 8}条" if len(rows) > 8 else ""
    return f"同商品装箱候选={' | '.join(parts)}{suffix}"


def existing_sales_summary(
    contract_no: str,
    product_name: str,
    sales_rows_by_contract: dict[str, list[dict[str, Any]]],
) -> str:
    rows = []
    for row in sales_rows_by_contract.get(contract_no, []):
        names = {str(row.get("customsName") or ""), str(row.get("description") or "")}
        if not any(same_product_name(product_name, name) for name in names):
            continue
        note = str(row.get("note") or "")
        flags = []
        if "[WPS_SOURCE]" in note:
            flags.append("有WPS来源")
        else:
            flags.append("无WPS来源")
        if "[WPS_SOURCE_PATH_STORE]" in note:
            flags.append("路径推断")
        if "[WPS_PACKING_SPEC_QUANTITY_STORE]" in note:
            flags.append("同源装箱规格数量推断")
        if "[WPS_PACKING_QUANTITY_STORE]" in note:
            flags.append("同源装箱数量推断")
        if "[WPS_CONTRACT_STORE]" in note:
            flags.append("合同聚合推断")
        rows.append(
            f"{row.get('storeName') or '未填门店'}:{row.get('quantity')}{row.get('unit') or ''}@{row.get('sellingPrice')}({','.join(flags)})"
        )
    return "现库同商品销售行=" + " | ".join(rows[:10]) if rows else "现库同商品销售行=未找到"


def add_mismatches(items: list[DecisionItem]) -> None:
    for row in read_json(PARSED_DIR / "workbook_mismatches.json", []):
        if row.get("decision") == "按工作簿内容中的合同号归集":
            continue
        filename_no = row.get("filename_contract_no", "")
        sheet_no = row.get("sheet_contract_no", "")
        items.append(DecisionItem(
            priority="P0",
            category="source_contract_mismatch",
            subject=f"{filename_no} vs {sheet_no}",
            source=row.get("source_file", ""),
            evidence=f"文件名合同号={filename_no}；工作簿内容合同号={sheet_no}；当前自动策略={row.get('decision', '')}",
            required_decision="确认按哪个 EXP 合同号归集，或继续排除该源文件。",
            suggested_next_step="打开该工作簿核对合同页抬头与业务实际出货编号。",
        ))


def add_export_plan_items(items: list[DecisionItem]) -> None:
    plan = read_json(PARSED_DIR / "import_plan.json", {})
    cleanup_plan = read_json(PARSED_DIR / "ambiguous_sales_store_cleanup_plan.json", {})
    operations = plan.get("operations", {})
    contract_nos = {str(group.get("contractNo", "")) for group in operations.get("packingMerges", []) if group.get("unmatched")}
    candidate_ids = {
        str(candidate.get("packingItemId", ""))
        for group in operations.get("packingMerges", [])
        for row in group.get("unmatched", [])
        for candidate in row.get("candidates", [])
        if candidate.get("packingItemId")
    }
    sales_candidate_ids = {
        str(candidate.get("salesItemId", ""))
        for group in operations.get("salesMerges", [])
        for row in group.get("unmatched", [])
        for candidate in row.get("candidates", [])
        if row.get("reason") == "conflicting_existing_packing_store_marker" and candidate.get("salesItemId")
    }
    candidate_details = load_packing_candidate_details(candidate_ids)
    sales_candidate_details = load_sales_candidate_details(sales_candidate_ids)
    skipped_contract_nos = {
        str(row.get("contractNo", ""))
        for row in plan.get("skipped", [])
        if row.get("type") in {"sales_row_without_source_store", "sales_row_ambiguous_packing_stores"}
    }
    sales_conflict_contract_nos = {
        str(group.get("contractNo", ""))
        for group in operations.get("salesMerges", [])
        if any(row.get("reason") == "conflicting_existing_packing_store_marker" for row in group.get("unmatched", []))
    }
    sales_rows = load_sales_rows_by_contract(contract_nos | skipped_contract_nos | sales_conflict_contract_nos)
    packing_rows_by_ref = source_rows_by_ref()
    sales_rows_by_ref = sales_source_rows_by_ref()
    packing_rows_by_product = packing_rows_by_contract_product()
    for group in operations.get("packingMerges", []):
        for row in group.get("unmatched", []):
            candidates = row.get("candidates", [])
            ref = source_ref(row)
            source_row = packing_rows_by_ref.get(ref)
            product_names = {str(source_row.get("product_name", ""))} if source_row else set()
            for candidate in candidates:
                detail = candidate_details.get(str(candidate.get("packingItemId", "")), {})
                product_names.update(
                    str(detail.get(key) or "")
                    for key in ("customsName", "description")
                    if detail.get(key)
                )
            candidate_text = " | ".join(candidate_summary(candidate, candidate_details) for candidate in candidates)
            items.append(DecisionItem(
                priority="P1",
                category="packing_ambiguous_match",
                subject=group.get("contractNo", ""),
                source=ref,
                evidence=compact(
                    f"{source_row_summary(source_row)}{sales_context(group.get('contractNo', ''), product_names, sales_rows)}；"
                    f"装箱源行可匹配 {len(candidates)} 条最高同分旧装箱候选；候选={candidate_text}",
                    limit=1100,
                ),
                required_decision="指定应更新哪条旧装箱行，或确认作为独立新装箱行处理。",
                suggested_next_step="在系统装箱明细中按合同、商品、数量、重量对照候选行。",
            ))

    for group in operations.get("salesMerges", []):
        contract_no = str(group.get("contractNo", ""))
        for row in group.get("unmatched", []):
            if row.get("reason") != "conflicting_existing_packing_store_marker":
                continue
            ref = source_ref(row)
            sales_source = sales_rows_by_ref.get(ref)
            candidates = row.get("candidates", [])
            candidate_text = " | ".join(
                sales_candidate_summary(candidate, sales_candidate_details)
                for candidate in candidates
            )
            source_notes = [
                compact(str(candidate.get("sourceNote", "")), limit=500)
                for candidate in candidates
                if candidate.get("sourceNote")
            ]
            product_name = str(sales_source.get("product_name", "")) if sales_source else ""
            evidence = (
                f"{sales_source_row_summary(sales_source)}；"
                f"候选销售行={candidate_text}；"
                f"新来源备注={source_notes}"
            )
            items.append(DecisionItem(
                priority="P1",
                category="sales_store_conflict",
                subject=f"{contract_no} / {product_name or '未知商品'}",
                source=ref,
                evidence=compact(evidence, limit=1600),
                required_decision="确认这条销售来源应归属现有门店、改为新门店、拆分，或保留现状。",
                suggested_next_step="按销售合同页、同源装箱行、已入库销售行和实际出货门店核对；没有唯一口径前不自动改门店。",
            ))

    skipped_sales_sources = set()
    for row in plan.get("skipped", []):
        if row.get("type") not in {"sales_row_without_source_store", "sales_row_ambiguous_packing_stores"}:
            continue
        contract_no = str(row.get("contractNo", ""))
        product_name = str(row.get("productName", ""))
        ref = source_ref(row)
        skipped_sales_sources.add(ref)
        sales_source = sales_rows_by_ref.get(ref)
        packing_candidates = packing_rows_by_product.get((contract_no, product_name), [])
        base_evidence = (
            f"{sales_source_row_summary(sales_source)}；"
            f"{packing_source_candidates_summary(packing_candidates)}；"
            f"{existing_sales_summary(contract_no, product_name, sales_rows)}"
        )
        if row.get("type") == "sales_row_ambiguous_packing_stores":
            evidence = (
                f"{base_evidence}；销售合同商品行缺门店；"
                f"同合同同商品装箱来源存在多个门店={row.get('stores', [])}；"
                "不能再用源文件路径推断单一门店。"
            )
            required = "指定这条销售行归属门店、拆分比例，或确认暂不导入/保留现状。"
            next_step = "按合同号、商品名和实际出货门店核对线下拆分口径。"
        else:
            evidence = f"{base_evidence}；销售合同商品行存在，但源文件无法唯一推出门店；系统 sales_items.storeId 必填。"
            required = "指定这条销售行归属门店，或确认暂不导入。"
            next_step = "按合同号和商品名核对线下出货门店。"
        items.append(DecisionItem(
            priority="P1",
            category="sales_missing_store",
            subject=f"{contract_no} / {product_name}",
            source=ref,
            evidence=compact(evidence, limit=1500),
            required_decision=required,
            suggested_next_step=next_step,
        ))

    review_reasons = {
        "path_store_without_exact_quantity_packing_evidence",
        "path_store_multiple_exact_quantity_packing_stores",
        "path_store_conflict_without_equivalent_correct_row",
        "path_store_conflict_has_inventory_refs",
    }
    for row in cleanup_plan.get("kept", []):
        reason = row.get("reason", "")
        if reason not in review_reasons:
            continue
        ref = source_ref(row)
        if ref in skipped_sales_sources:
            continue
        contract_no = str(row.get("contractNo", ""))
        product_name = str(row.get("productName", ""))
        candidate_stores = row.get("candidateStores") or row.get("productPackingStores") or []
        parts = [
            f"路径推断门店={row.get('storeName', '')}",
            f"源数量={row.get('sourceQuantity', '')}",
            f"复核原因={reason}",
        ]
        if candidate_stores:
            parts.append(f"装箱候选门店={candidate_stores}")
        items.append(DecisionItem(
            priority="P2",
            category="sales_path_store_inference_review",
            subject=f"{contract_no} / {product_name}",
            source=ref,
            evidence=compact("；".join(parts), limit=900),
            required_decision="确认这条路径门店推断是否可以保留，或提供销售/装箱拆分依据。",
            suggested_next_step="优先核对源销售合同页、同合同装箱清单和实际出货门店；没有更强证据前不自动改门店。",
        ))

    for row in plan.get("warnings", []):
        if row.get("type") != "store_without_known_port":
            continue
        items.append(DecisionItem(
            priority="P1",
            category="store_port_mapping",
            subject=str(row.get("store", "")),
            source=source_ref(row),
            evidence=f"源文件门店={row.get('store', '')}；港口={row.get('port', '')}；无法对应现有单一门店。",
            required_decision="确认拆分规则，或建立新的门店/港口口径。",
            suggested_next_step="确认混合港口行是否需要拆分到多个门店。",
        ))


def add_purchase_items(items: list[DecisionItem]) -> None:
    for row in read_csv(PARSED_DIR / "purchase_evidence_preferred.csv"):
        if row.get("db_contract_exists") == "1":
            continue
        readiness = row.get("readiness", "")
        if readiness not in {"needs_review", "blocked"}:
            continue
        contract_no = row.get("purchase_contract_no") or row.get("inferred_contracts") or "unknown"
        issues = row.get("issues", "")
        if "missing_supplier_name" in issues:
            required = "提供正式乙方公司名，或确认这份合同不进入采购合同表。"
            next_step = "不要使用出货汇总里的厂家简称直接入库。"
        elif "missing_items" in issues or "missing_total_amount" in issues:
            required = "提供带产品、数量、单价、金额的逐项明细，或确认仅保留附件。"
            next_step = "补一份可读合同明细页或人工确认明细表。"
        else:
            required = "提供可读版合同，或确认供应商与逐项明细。"
            next_step = "优先找 DOCX/XLSX 原件；OCR 不完整时不入库。"
        items.append(DecisionItem(
            priority="P0" if contract_no in {"CG2400008", "CG2400013"} else "P1",
            category="purchase_contract_gap",
            subject=contract_no,
            source=row.get("relative_path", ""),
            evidence=compact(
                f"readiness={readiness}; issues={issues}; supplier={row.get('supplier_name', '')}; "
                f"date={row.get('signed_at', '')}; total={row.get('total_amount', '')}; item_count={row.get('item_count', '')}"
            ),
            required_decision=required,
            suggested_next_step=next_step,
        ))


def evidence_same_directory_context(row: dict[str, str]) -> str:
    relative_path = row.get("relative_path", "")
    contract_no = row.get("contract_no") or row.get("matched_contract_no") or ""
    directory = str(Path(relative_path).parent)
    if not directory or directory == ".":
        return ""

    metadata_prefix = f"11-报关记录/{directory}/"
    metadata_hits = []
    relevant_tokens = ("EXP2400006", "空运", "报关", "放行", "WTS", "HDU", "222920240004561873")
    for meta in read_csv(PARSED_DIR / "wps_cloud_metadata.csv"):
        cloud_path = meta.get("cloud_path", "")
        name = meta.get("name", "")
        if not cloud_path.startswith(metadata_prefix):
            continue
        if not any(token in name or token in cloud_path for token in relevant_tokens):
            continue
        metadata_hits.append(f"{name}({meta.get('suffix', '')},{meta.get('metadata_size', '')}B)")

    formal_hits = []
    for extract in read_csv(PARSED_DIR / "evidence_extracts.csv"):
        extract_path = extract.get("relative_path", "")
        if str(Path(extract_path).parent) != directory:
            continue
        declaration_no = extract.get("declaration_no")
        if not declaration_no:
            continue
        formal_hits.append(
            f"{Path(extract_path).name}->{declaration_no}/合同={extract.get('contract_no') or extract.get('inferred_contracts')}/"
            f"毛净={extract.get('gross_weight')}/{extract.get('net_weight')}"
        )

    source_extract = next(
        (extract for extract in read_csv(PARSED_DIR / "evidence_extracts.csv") if extract.get("relative_path") == relative_path),
        {},
    )
    preview = source_extract.get("text_preview", "")
    draft_facts = []
    for token in ("EXP2400006", "Sp food trading LLC", "密胺餐盘", "125", "110", "676.5"):
        if token in preview:
            draft_facts.append(token)

    shipment_invoice_values = []
    if contract_no:
        for packing in read_csv(PARSED_DIR / "packing_items.csv"):
            if packing.get("contract_no") != contract_no:
                continue
            invoice_no = packing.get("invoice_no", "")
            if not invoice_no:
                continue
            shipment_invoice_values.append(
                f"{packing.get('source_file')}#{packing.get('sheet')}:{packing.get('row')} invoice_no={invoice_no}"
            )

    parts = []
    if draft_facts:
        parts.append(f"底稿可读字段={','.join(draft_facts)}")
    if shipment_invoice_values:
        parts.append("同合同出货汇总 invoice_no 线索=" + " | ".join(shipment_invoice_values[:4]))
        parts.append("这些 invoice_no 属出货汇总发票列，不是正式 18 位海关编号")
    if metadata_hits:
        parts.append("同目录云端索引相关文件=" + " | ".join(metadata_hits[:8]))
    if formal_hits:
        parts.append("同目录已识别正式报关编号=" + " | ".join(formal_hits[:4]))
    return "；".join(parts)


def add_evidence_items(items: list[DecisionItem]) -> None:
    for row in read_csv(PARSED_DIR / "evidence_db_mapping.csv"):
        action = row.get("mapping_action")
        if action != "blocked":
            continue
        category = row.get("category", "")
        issues = row.get("mapping_issues", "")
        if category == "customs_declaration" and "legacy_xls_read_via_frontend_xlsx" in issues:
            priority = "P2"
            if row.get("matched_contract_no"):
                required = "补充正式 18 位海关编号。"
                next_step = "不要用底稿里的商业发票/合同金额替代正式海关编号。"
            else:
                required = "补充正式 18 位海关编号，并确认唯一 EXP 合同归属。"
                next_step = "不要用底稿里的商业发票/合同金额替代正式海关编号；先确认这份底稿属于哪一票出口。"
        elif category == "customs_declaration" and "legacy_xls" in issues:
            priority = "P2"
            required = "确认是否需要转换旧 .xls，并检查是否有 PDF 未覆盖的发票/箱单信息。"
            next_step = "如需要继续，先用 WPS/LibreOffice 转为 .xlsx 后再跑抽取。"
        elif category == "output_invoice":
            priority = "P2"
            required = "提供正式 20 位发票号、税号、金额，或确认仅作为商业发票附件保留。"
            next_step = "不要把商业发票号或合同号当税票号写入退税链路。"
        else:
            priority = "P2"
            required = "补充缺失的报关单号或归属合同信息。"
            next_step = "按源文件路径核对实际凭证。"
        context = evidence_same_directory_context(row)
        evidence = f"readiness={row.get('readiness', '')}; issues={issues}"
        if context:
            evidence = f"{evidence}; {context}"
        items.append(DecisionItem(
            priority=priority,
            category=f"evidence_{category}_blocked",
            subject=row.get("contract_no") or row.get("matched_contract_no") or row.get("relative_path", ""),
            source=row.get("relative_path", ""),
            evidence=compact(evidence, limit=1500),
            required_decision=required,
            suggested_next_step=next_step,
        ))


def write_outputs(items: list[DecisionItem]) -> None:
    PARSED_DIR.mkdir(parents=True, exist_ok=True)
    rows = [asdict(item) for item in items]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()) if rows else list(DecisionItem.__annotations__))
        writer.writeheader()
        writer.writerows(rows)
    OUT_JSON.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    counts = Counter(item.category for item in items)
    lines = [
        "# WPS 历史导入待裁决包",
        "",
        f"- 待裁决总数：`{len(items)}`",
        "",
        "## 分类统计",
        "",
    ]
    for category, count in sorted(counts.items()):
        lines.append(f"- `{category}`: `{count}`")
    lines.extend(["", "## 明细", ""])
    for item in items:
        lines.extend([
            f"### [{item.priority}] {item.category} - {item.subject}",
            "",
            f"- 来源：`{item.source}`",
            f"- 证据：{item.evidence}",
            f"- 需要裁决：{item.required_decision}",
            f"- 下一步：{item.suggested_next_step}",
            "",
        ])
    OUT_MD.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    items: list[DecisionItem] = []
    add_mismatches(items)
    add_export_plan_items(items)
    add_purchase_items(items)
    add_evidence_items(items)
    write_outputs(items)
    print(json.dumps({
        "decision_item_count": len(items),
        "counts": Counter(item.category for item in items),
        "out": {
            "csv": str(OUT_CSV),
            "json": str(OUT_JSON),
            "md": str(OUT_MD),
        },
    }, ensure_ascii=False, indent=2, default=dict))


if __name__ == "__main__":
    main()
