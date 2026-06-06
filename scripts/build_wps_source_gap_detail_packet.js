/**
 * Input: WPS import plans + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/wps_source_gap_details.{json,csv,md}
 * Pos: WPS 剩余来源缺口逐条明细包；把每条 DB 缺口、匹配失败阶段和后续动作汇总到一个只读交付物，不写库
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const backendPath = path.join(repoRoot, 'backend');
process.chdir(backendPath);

const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));
const Papa = require(path.join(backendPath, 'node_modules/papaparse'));

const prisma = new PrismaClient();
const parsedDir = path.join(repoRoot, 'tmp/wps_11_export_list_raw/parsed');
const outJson = path.join(parsedDir, 'wps_source_gap_details.json');
const outCsv = path.join(parsedDir, 'wps_source_gap_details.csv');
const outMd = path.join(parsedDir, 'wps_source_gap_details.md');
const sourceEvidencePattern = /\[WPS_|WPS_|11-报关记录|12-报关单|_wps_cloud_root|出货汇总|报关单|出口退税联/;

function readJson(fileName, fallback = null) {
  const filePath = path.join(parsedDir, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function hasSourceEvidence(note) {
  return sourceEvidencePattern.test(String(note || ''));
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, '').replace(/\*/g, '').replace(/店$/, '').toLowerCase();
}

function closeEnough(left, right, tolerance = 0.02) {
  if (left == null && right == null) return true;
  return left != null && right != null && Math.abs(left - right) <= tolerance;
}

function textEqualWhenPresent(left, right) {
  if (!String(left || '').trim() && !String(right || '').trim()) return true;
  return normalizeText(left) === normalizeText(right);
}

function numberEqualWhenPresent(left, right, tolerance = 0.02) {
  if (left == null && right == null) return true;
  return closeEnough(left, right, tolerance);
}

function noteExcerpt(note) {
  return String(note || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function salesSourceRows(importPlan) {
  const rows = [];
  for (const group of importPlan.operations?.salesReplacements || []) {
    for (const row of group.rows || []) rows.push(row);
  }
  return rows;
}

function packingSourceRows(importPlan) {
  const rows = [];
  for (const group of importPlan.operations?.packingReplacements || []) {
    for (const row of group.rows || []) rows.push(row);
  }
  return rows;
}

function countBy(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row) || '(empty)';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => ({ key, count }));
}

function compactCandidates(rows, limit = 5) {
  return rows.slice(0, limit).map((row) => row.source || row.source_file || row.relative_path || '').filter(Boolean);
}

function salesCandidateProfile(rows, item) {
  const sameContract = rows.filter((row) => row.data.salesContractId === item.salesContractId);
  const sameProduct = sameContract.filter((row) => row.data.productId === item.productId);
  const sameStore = sameProduct.filter((row) => row.data.storeId === item.storeId);
  const sameQuantity = sameStore.filter((row) => closeEnough(row.data.quantity, item.quantity, 0.0001));
  const samePrice = sameQuantity.filter((row) => closeEnough(row.data.sellingPrice, item.sellingPrice, 0.05));
  const strict = samePrice.filter((row) => normalizeText(row.data.specification) === normalizeText(item.specification));
  const nearest = strict.length ? strict : samePrice.length ? samePrice : sameQuantity.length ? sameQuantity : sameStore.length ? sameStore : sameProduct;
  return {
    stage_counts: {
      same_contract: sameContract.length,
      same_contract_product: sameProduct.length,
      same_contract_product_store: sameStore.length,
      same_contract_product_store_quantity: sameQuantity.length,
      same_contract_product_store_quantity_price: samePrice.length,
      strict: strict.length,
    },
    strict_match_count: strict.length,
    candidate_sources: compactCandidates(nearest),
  };
}

function packingCandidateProfile(rows, item) {
  const sameContract = rows.filter((row) => row.data.salesContractId === item.salesContractId);
  const sameProduct = sameContract.filter((row) => row.data.productId === item.productId);
  const sameStore = sameProduct.filter((row) => (row.data.storeId || null) === (item.storeId || null));
  const sameQuantity = sameStore.filter((row) => closeEnough(row.data.quantity, item.quantity, 0.0001));
  const sameBoxes = sameQuantity.filter((row) => numberEqualWhenPresent(row.data.boxes, item.boxes, 0.0001));
  const sameWeight = sameBoxes.filter((row) => (
    numberEqualWhenPresent(row.data.grossWeight, item.grossWeight, 0.05)
    && numberEqualWhenPresent(row.data.netWeight, item.netWeight, 0.05)
    && numberEqualWhenPresent(row.data.volume, item.volume, 0.05)
  ));
  const strict = sameWeight.filter((row) => (
    normalizeText(row.data.unit) === normalizeText(item.unit)
    && textEqualWhenPresent(row.data.specification, item.specification)
    && textEqualWhenPresent(row.data.manufacturer, item.manufacturer)
  ));
  const nearest = strict.length ? strict : sameWeight.length ? sameWeight : sameBoxes.length ? sameBoxes : sameQuantity.length ? sameQuantity : sameStore.length ? sameStore : sameProduct;
  return {
    stage_counts: {
      same_contract: sameContract.length,
      same_contract_product: sameProduct.length,
      same_contract_product_store: sameStore.length,
      same_contract_product_store_quantity: sameQuantity.length,
      same_contract_product_store_quantity_boxes: sameBoxes.length,
      same_contract_product_store_quantity_boxes_weight_volume: sameWeight.length,
      strict: strict.length,
    },
    strict_match_count: strict.length,
    candidate_sources: compactCandidates(nearest),
  };
}

function purchaseSkipKey(row) {
  return [
    row.contractNo,
    normalizeText(row.product),
    Number(row.quantity),
    Number(row.unitPrice),
    Number(row.totalPrice),
  ].join('|');
}

function purchaseItemKey(item) {
  return [
    item.purchaseContract.contractNo,
    normalizeText(item.product.customsName),
    Number(item.quantity),
    Number(item.unitPrice),
    Number(item.totalPrice),
  ].join('|');
}

function detailBase({ type, id, contractNo, product, store, quantity, unit, price, specification, documentNo, note, sourceStatus, reason, matchCount, actionNeeded, candidateSources }) {
  return {
    type,
    id: id || '',
    contract_no: contractNo || '',
    document_no: documentNo || '',
    product: product || '',
    store: store || '',
    quantity: quantity ?? '',
    unit: unit || '',
    price: price ?? '',
    specification: specification || '',
    source_status: sourceStatus,
    reason,
    match_count: matchCount ?? '',
    action_needed: actionNeeded,
    note_excerpt: noteExcerpt(note),
    candidate_sources: candidateSources || [],
  };
}

function renderMarkdown(report) {
  function display(value) {
    if (value == null || value === '') return '-';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
    return String(value);
  }

  const lines = [];
  lines.push('# WPS 来源缺口逐条明细包');
  lines.push('');
  lines.push(`状态：\`${report.status}\``);
  lines.push(`总缺口：\`${report.summary.total}\``);
  lines.push('');
  lines.push('## 分桶');
  for (const item of report.summary.by_type) {
    lines.push(`- \`${item.key}\`: \`${item.count}\``);
  }
  lines.push('');
  lines.push('## 处理口径');
  lines.push('- 本报告只读，不写库。');
  lines.push('- `match_count=0` 表示当前标准化源无法唯一证明该 DB 行来源。');
  lines.push('- `match_count>1` 表示候选来源歧义，不能自动挂 note。');
  lines.push('- 报关明细没有独立 note，来源只能继承报关单 note；父报关单缺来源时单独列出。');
  lines.push('');

  const groups = new Map();
  for (const row of report.details) {
    if (!groups.has(row.type)) groups.set(row.type, []);
    groups.get(row.type).push(row);
  }
  for (const [type, rows] of groups.entries()) {
    lines.push(`## ${type}`);
    lines.push('');
    lines.push('| 合同/单号 | 商品 | 门店 | 数量 | 原因 | 后续动作 |');
    lines.push('|---|---|---|---:|---|---|');
    for (const row of rows) {
      const key = [row.contract_no, row.document_no].filter(Boolean).join(' / ');
      lines.push(`| ${display(key)} | ${display(row.product)} | ${display(row.store)} | ${display(row.quantity)} | ${row.reason} | ${row.action_needed} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const importPlan = readJson('import_plan.json');
  const purchaseItemPlan = readJson('purchase_item_source_note_backfill_plan.json', { skipped: [] });
  const purchaseMismatchPlan = readJson('purchase_mismatch_source_note_backfill_plan.json', { skipped: [] });
  const salesRows = salesSourceRows(importPlan);
  const packingRows = packingSourceRows(importPlan);
  const purchaseSkipByKey = new Map(purchaseItemPlan.skipped.map((row) => [purchaseSkipKey(row), row]));
  const mismatchByContract = new Map(purchaseMismatchPlan.skipped.map((row) => [row.contractNo, row]));

  const [
    salesItems,
    packingItems,
    purchaseContracts,
    purchaseItems,
    customsDeclarations,
    customsItems,
  ] = await Promise.all([
    prisma.salesItem.findMany({
      select: {
        id: true, note: true, salesContractId: true, productId: true, storeId: true,
        quantity: true, unit: true, sellingPrice: true, specification: true,
        salesContract: { select: { contractNo: true } },
        product: { select: { customsName: true } },
        store: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.packingItem.findMany({
      select: {
        id: true, note: true, salesContractId: true, productId: true, storeId: true,
        quantity: true, unit: true, boxes: true, grossWeight: true, netWeight: true,
        volume: true, specification: true, manufacturer: true,
        salesContract: { select: { contractNo: true } },
        product: { select: { customsName: true } },
        store: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.purchaseContract.findMany({
      select: { id: true, contractNo: true, totalAmount: true, note: true, supplier: { select: { name: true } } },
      orderBy: { contractNo: 'asc' },
    }),
    prisma.purchaseItem.findMany({
      select: {
        id: true, note: true, quantity: true, unit: true, unitPrice: true, totalPrice: true, specification: true,
        purchaseContract: { select: { contractNo: true } },
        product: { select: { customsName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.customsDeclaration.findMany({
      select: {
        id: true, declarationNo: true, note: true,
        salesContract: { select: { contractNo: true } },
        items: { select: { id: true } },
      },
      orderBy: { declarationNo: 'asc' },
    }),
    prisma.customsDeclarationItem.findMany({
      select: {
        id: true, itemNo: true, customsName: true, hsCode: true, quantity: true, unit: true,
        customsDeclaration: {
          select: {
            declarationNo: true, note: true,
            salesContract: { select: { contractNo: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const details = [];

  for (const item of salesItems.filter((row) => !hasSourceEvidence(row.note))) {
    const profile = salesCandidateProfile(salesRows, item);
    details.push({
      ...detailBase({
        type: 'sales_item_missing_source',
        id: item.id,
        contractNo: item.salesContract.contractNo,
        product: item.product.customsName,
        store: item.store.name,
        quantity: item.quantity,
        unit: item.unit,
        price: item.sellingPrice,
        specification: item.specification,
        note: item.note,
        sourceStatus: 'missing_note',
        reason: profile.strict_match_count === 0 ? 'no_strict_source_match' : 'ambiguous_strict_source_match',
        matchCount: profile.strict_match_count,
        actionNeeded: '需要更强销售源证据、门店裁决或确认该历史行不需要来源 note',
        candidateSources: profile.candidate_sources,
      }),
      stage_counts: profile.stage_counts,
    });
  }

  for (const item of packingItems.filter((row) => !hasSourceEvidence(row.note))) {
    const profile = packingCandidateProfile(packingRows, item);
    details.push({
      ...detailBase({
        type: 'packing_item_missing_source',
        id: item.id,
        contractNo: item.salesContract.contractNo,
        product: item.product.customsName,
        store: item.store?.name || '',
        quantity: item.quantity,
        unit: item.unit,
        price: item.unitPrice,
        specification: item.specification,
        note: item.note,
        sourceStatus: 'missing_note',
        reason: profile.strict_match_count === 0 ? 'no_strict_source_match' : 'ambiguous_strict_source_match',
        matchCount: profile.strict_match_count,
        actionNeeded: '需要更强装箱源字段、门店/厂家裁决或确认该历史行不需要来源 note',
        candidateSources: profile.candidate_sources,
      }),
      boxes: item.boxes,
      manufacturer: item.manufacturer || '',
      gross_weight: item.grossWeight,
      net_weight: item.netWeight,
      volume: item.volume,
      stage_counts: profile.stage_counts,
    });
  }

  for (const item of purchaseContracts.filter((row) => row.contractNo.startsWith('CG') && !hasSourceEvidence(row.note))) {
    const skipped = mismatchByContract.get(item.contractNo);
    details.push(detailBase({
      type: 'purchase_contract_missing_source',
      id: item.id,
      contractNo: item.contractNo,
      product: '',
      quantity: '',
      price: item.totalAmount,
      note: item.note,
      sourceStatus: 'missing_note',
      reason: skipped?.reason || 'no_source_note',
      matchCount: skipped?.matchCount ?? '',
      actionNeeded: skipped ? '需要确认文件名合同号与正文合同号冲突归属' : '需要找到可证明合同头的 WPS 来源',
      candidateSources: skipped?.source ? [skipped.source] : [],
    }));
  }

  for (const item of purchaseItems.filter((row) => !hasSourceEvidence(row.note))) {
    const skipped = purchaseSkipByKey.get(purchaseItemKey(item));
    details.push(detailBase({
      type: 'purchase_item_missing_source',
      id: item.id,
      contractNo: item.purchaseContract.contractNo,
      product: item.product.customsName,
      quantity: item.quantity,
      unit: item.unit,
      price: item.totalPrice,
      specification: item.specification,
      note: item.note,
      sourceStatus: 'missing_note',
      reason: skipped?.reason || 'not_in_backfill_skip_plan',
      matchCount: skipped?.matchCount ?? '',
      actionNeeded: '需要唯一采购凭证明细；歧义或无唯一匹配时不自动挂来源',
    }));
  }

  for (const item of customsDeclarations.filter((row) => !hasSourceEvidence(row.note))) {
    details.push(detailBase({
      type: 'customs_declaration_missing_source',
      id: item.id,
      contractNo: item.salesContract.contractNo,
      documentNo: item.declarationNo,
      quantity: item.items.length,
      note: item.note,
      sourceStatus: 'missing_note',
      reason: item.declarationNo.startsWith('BGNDING') ? 'pending_placeholder_not_formal_customs_no' : 'no_source_note',
      actionNeeded: '需要正式报关单来源或整张占位单可完整匹配的 WPS 装箱源集合',
    }));
  }

  for (const item of customsItems.filter((row) => !hasSourceEvidence(row.customsDeclaration.note))) {
    details.push(detailBase({
      type: 'customs_item_inherits_missing_declaration_source',
      id: item.id,
      contractNo: item.customsDeclaration.salesContract.contractNo,
      documentNo: item.customsDeclaration.declarationNo,
      product: item.customsName,
      quantity: item.quantity,
      unit: item.unit,
      specification: item.hsCode,
      sourceStatus: 'declaration_note_missing',
      reason: 'parent_customs_declaration_missing_source',
      actionNeeded: '先补父报关单来源；不能给明细单独伪造来源',
    }));
  }

  const report = {
    status: 'source_gap_details_built',
    summary: {
      total: details.length,
      by_type: countBy(details, (row) => row.type),
      by_contract_top20: countBy(details, (row) => row.contract_no).slice(0, 20),
      no_safe_auto_note_backfill: details.every((row) => Number(row.match_count || 0) !== 1),
    },
    details,
  };

  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(outCsv, Papa.unparse(details.map((row) => ({
    type: row.type,
    id: row.id,
    contract_no: row.contract_no,
    document_no: row.document_no,
    product: row.product,
    store: row.store,
    quantity: row.quantity,
    unit: row.unit,
    price: row.price,
    specification: row.specification,
    source_status: row.source_status,
    reason: row.reason,
    match_count: row.match_count,
    action_needed: row.action_needed,
    note_excerpt: row.note_excerpt,
    candidate_sources: row.candidate_sources.join(' | '),
  })), { newline: '\n' }));
  fs.writeFileSync(outMd, renderMarkdown(report));
  console.log(JSON.stringify({
    status: report.status,
    total: report.summary.total,
    by_type: report.summary.by_type,
    out: { json: outJson, csv: outCsv, md: outMd },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
