/**
 * Input: tmp/wps_11_export_list_raw/parsed/wps_operational_source_gap_review.json + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/wps_operational_duplicate_coverage.{json,csv,md}
 * Pos: 复核零值/操作性来源缺口是否被带 WPS 来源的现库行严格覆盖；只读，不写库、不删除
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const backendPath = path.join(repoRoot, 'backend');
process.chdir(backendPath);

const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const parsedDir = path.join(repoRoot, 'tmp/wps_11_export_list_raw/parsed');
const inJson = path.join(parsedDir, 'wps_operational_source_gap_review.json');
const outJson = path.join(parsedDir, 'wps_operational_duplicate_coverage.json');
const outCsv = path.join(parsedDir, 'wps_operational_duplicate_coverage.csv');
const outMd = path.join(parsedDir, 'wps_operational_duplicate_coverage.md');
const sourceEvidencePattern = /\[WPS_|WPS_|11-报关记录|12-报关单|_wps_cloud_root|出货汇总|报关单|出口退税联/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function hasSourceEvidence(note) {
  return sourceEvidencePattern.test(String(note || ''));
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameNumber(left, right, tolerance = 0.000001) {
  const a = num(left);
  const b = num(right);
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= tolerance;
}

function sameText(left, right) {
  return String(left || '').trim() === String(right || '').trim();
}

function mdCell(value) {
  return String(value ?? '').replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 160) || '-';
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function salesTarget(row) {
  return prisma.salesItem.findUnique({
    where: { id: row.id },
    include: {
      salesContract: true,
      product: true,
      store: true,
      _count: { select: { inventories: true } },
    },
  });
}

async function packingTarget(row) {
  return prisma.packingItem.findUnique({
    where: { id: row.id },
    include: {
      salesContract: true,
      product: true,
      store: true,
      _count: { select: { customsDeclarationItems: true } },
    },
  });
}

function salesExact(target, peer) {
  return target.salesContractId === peer.salesContractId
    && target.productId === peer.productId
    && target.storeId === peer.storeId
    && sameNumber(target.quantity, peer.quantity)
    && sameNumber(target.sellingPrice, peer.sellingPrice)
    && sameNumber(target.costPrice, peer.costPrice)
    && sameText(target.unit, peer.unit)
    && sameText(target.specification, peer.specification);
}

function salesNearPriceConflict(target, peer) {
  return target.salesContractId === peer.salesContractId
    && target.productId === peer.productId
    && target.storeId === peer.storeId
    && sameNumber(target.quantity, peer.quantity)
    && sameNumber(target.sellingPrice, 0)
    && !sameNumber(peer.sellingPrice, 0);
}

function packingExact(target, peer) {
  return target.salesContractId === peer.salesContractId
    && target.productId === peer.productId
    && target.storeId === peer.storeId
    && sameNumber(target.quantity, peer.quantity)
    && sameNumber(target.boxes, peer.boxes)
    && sameNumber(target.grossWeight, peer.grossWeight)
    && sameNumber(target.netWeight, peer.netWeight)
    && sameNumber(target.volume, peer.volume)
    && sameText(target.unit, peer.unit)
    && sameText(target.specification, peer.specification)
    && sameText(target.manufacturer, peer.manufacturer);
}

function baseRow(row, target, peer, verdict, rationale) {
  return {
    verdict,
    rationale,
    type: row.type,
    id: row.id,
    peer_id: peer?.id || '',
    contract_no: row.contract_no || target?.salesContract?.contractNo || '',
    product: row.product || target?.product?.customsName || '',
    store: row.store || target?.store?.name || '',
    quantity: row.quantity ?? target?.quantity ?? '',
    price: row.price ?? target?.sellingPrice ?? '',
    peer_price: peer?.sellingPrice ?? '',
    unit: target?.unit || '',
    target_refs: target?._count?.inventories ?? target?._count?.customsDeclarationItems ?? '',
    peer_refs: peer?._count?.inventories ?? peer?._count?.customsDeclarationItems ?? '',
    target_note_excerpt: String(target?.note || '').replace(/\s+/g, ' ').slice(0, 180),
    peer_note_excerpt: String(peer?.note || '').replace(/\s+/g, ' ').slice(0, 180),
  };
}

async function reviewSales(row) {
  const target = await salesTarget(row);
  if (!target) return [baseRow(row, null, null, 'missing_target_row', '数据库中未找到目标销售行。')];
  if (target._count.inventories) {
    return [baseRow(row, target, null, 'target_has_inventory_refs', '目标销售行已有库存引用，不能自动清理。')];
  }
  const peers = await prisma.salesItem.findMany({
    where: {
      salesContractId: target.salesContractId,
      productId: target.productId,
      storeId: target.storeId,
      NOT: { id: target.id },
    },
    include: {
      salesContract: true,
      product: true,
      store: true,
      _count: { select: { inventories: true } },
    },
  });
  const sourcePeers = peers.filter((peer) => hasSourceEvidence(peer.note));
  const exact = sourcePeers.find((peer) => salesExact(target, peer));
  if (exact) {
    return [baseRow(row, target, exact, 'exact_duplicate_covered_by_source_row', '同合同/商品/门店/数量/成本/售价/单位/规格完全一致，且保留行带 WPS 来源。')];
  }
  const near = sourcePeers.filter((peer) => salesNearPriceConflict(target, peer));
  if (near.length) {
    return near.map((peer) => baseRow(row, target, peer, 'near_price_conflict_review', '同合同/商品/门店/数量一致，但目标为零售价、带来源行是非零售价；不能自动合并或删除。'));
  }
  return [baseRow(row, target, null, 'no_source_backed_duplicate', '没有带 WPS 来源的严格重复现库行。')];
}

async function reviewPacking(row) {
  const target = await packingTarget(row);
  if (!target) return [baseRow(row, null, null, 'missing_target_row', '数据库中未找到目标装箱行。')];
  if (target._count.customsDeclarationItems) {
    return [baseRow(row, target, null, 'target_has_customs_refs', '目标装箱行已有报关引用，不能自动清理。')];
  }
  const peers = await prisma.packingItem.findMany({
    where: {
      salesContractId: target.salesContractId,
      productId: target.productId,
      storeId: target.storeId,
      NOT: { id: target.id },
    },
    include: {
      salesContract: true,
      product: true,
      store: true,
      _count: { select: { customsDeclarationItems: true } },
    },
  });
  const exact = peers.filter((peer) => hasSourceEvidence(peer.note)).find((peer) => packingExact(target, peer));
  if (exact) {
    return [baseRow(row, target, exact, 'exact_duplicate_covered_by_source_row', '同合同/商品/门店/数量/箱数/重量/体积/单位/规格/厂家完全一致，且保留行带 WPS 来源。')];
  }
  return [baseRow(row, target, null, 'no_source_backed_duplicate', '没有带 WPS 来源的严格重复现库行。')];
}

async function buildReport() {
  const source = readJson(inJson);
  const rows = source.details || [];
  const details = [];
  for (const row of rows) {
    const reviewed = row.type === 'sales_item_missing_source'
      ? await reviewSales(row)
      : await reviewPacking(row);
    details.push(...reviewed);
  }
  const byVerdict = new Map();
  for (const row of details) {
    byVerdict.set(row.verdict, (byVerdict.get(row.verdict) || 0) + 1);
  }
  return {
    status: 'operational_duplicate_coverage_reviewed',
    source: path.relative(repoRoot, inJson),
    total_operational_rows: rows.length,
    report_rows: details.length,
    exact_duplicate_candidates: details.filter((row) => row.verdict === 'exact_duplicate_covered_by_source_row').length,
    near_price_conflict_reviews: details.filter((row) => row.verdict === 'near_price_conflict_review').length,
    auto_writable: 0,
    by_verdict: [...byVerdict.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([verdict, count]) => ({ verdict, count })),
    details,
  };
}

function writeCsv(report) {
  const fields = [
    'verdict',
    'type',
    'id',
    'peer_id',
    'contract_no',
    'product',
    'store',
    'quantity',
    'price',
    'peer_price',
    'unit',
    'target_refs',
    'peer_refs',
    'rationale',
  ];
  const lines = [fields.join(',')];
  for (const row of report.details) {
    lines.push(fields.map((field) => csvCell(row[field])).join(','));
  }
  fs.writeFileSync(outCsv, `${lines.join('\n')}\n`, 'utf8');
}

function writeMarkdown(report) {
  const lines = [
    '# WPS 操作性缺口重复覆盖复核',
    '',
    `状态：\`${report.status}\``,
    `复核操作性缺口：\`${report.total_operational_rows}\``,
    `严格覆盖候选：\`${report.exact_duplicate_candidates}\``,
    `近似价格冲突复核：\`${report.near_price_conflict_reviews}\``,
    `自动可写：\`${report.auto_writable}\``,
    '',
    '## 口径',
    '- 本报告只读，不写数据库、不删除记录。',
    '- 只有同合同、商品、门店、数量、价格、单位、规格等关键字段完全一致，且保留行带 WPS 来源时，才进入严格覆盖候选。',
    '- 同数量但零售价/非零价不同的记录只进入复核；不能自动删除零价历史行。',
    '',
    '## Verdict',
    '| Verdict | 数量 |',
    '|---|---:|',
  ];
  for (const row of report.by_verdict) {
    lines.push(`| \`${row.verdict}\` | ${row.count} |`);
  }
  lines.push('');
  lines.push('## 需要复核的近似价格冲突');
  lines.push('| 合同 | 商品 | 门店 | 数量 | 零价行 | 带来源行 | 来源行价格 | 说明 |');
  lines.push('|---|---|---|---:|---|---|---:|---|');
  const nearRows = report.details.filter((row) => row.verdict === 'near_price_conflict_review');
  if (!nearRows.length) {
    lines.push('| - | - | - | - | - | - | - | 无 |');
  } else {
    for (const row of nearRows) {
      lines.push(`| ${mdCell(row.contract_no)} | ${mdCell(row.product)} | ${mdCell(row.store)} | ${mdCell(row.quantity)} | ${mdCell(row.id)} | ${mdCell(row.peer_id)} | ${mdCell(row.peer_price)} | ${mdCell(row.rationale)} |`);
    }
  }
  fs.writeFileSync(outMd, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const report = await buildReport();
  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeCsv(report);
  writeMarkdown(report);
  console.log(JSON.stringify({
    status: report.status,
    totalOperationalRows: report.total_operational_rows,
    exactDuplicateCandidates: report.exact_duplicate_candidates,
    nearPriceConflictReviews: report.near_price_conflict_reviews,
    autoWritable: report.auto_writable,
    outJson,
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
