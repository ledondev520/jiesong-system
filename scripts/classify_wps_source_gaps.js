/**
 * Input: wps_db_source_coverage.json + import/purchase/evidence plans + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/wps_source_gap_classification.{json,md}
 * Pos: WPS 剩余来源缺口只读分类脚本；把不能自动回填的原因分桶，帮助后续继续推进或人工裁决，不写库
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
const outJson = path.join(parsedDir, 'wps_source_gap_classification.json');
const outMd = path.join(parsedDir, 'wps_source_gap_classification.md');
const sourceEvidencePattern = /\[WPS_|WPS_|11-报关记录|12-报关单|_wps_cloud_root|出货汇总|报关单|出口退税联/;

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(parsedDir, fileName), 'utf8'));
}

function hasSourceEvidence(note) {
  return sourceEvidencePattern.test(String(note || ''));
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, '').replace(/\*/g, '').toLowerCase();
}

function closeEnough(left, right, tolerance = 0.02) {
  if (left == null && right == null) return true;
  return left != null && right != null && Math.abs(left - right) <= tolerance;
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

function strictSalesMatches(rows, item) {
  return rows.filter((row) => (
    row.data.salesContractId === item.salesContractId
    && row.data.productId === item.productId
    && row.data.storeId === item.storeId
    && closeEnough(row.data.quantity, item.quantity, 0.0001)
    && closeEnough(row.data.sellingPrice, item.sellingPrice, 0.05)
    && normalizeText(row.data.specification) === normalizeText(item.specification)
  ));
}

function strictPackingMatches(rows, item) {
  return rows.filter((row) => (
    row.data.salesContractId === item.salesContractId
    && row.data.productId === item.productId
    && (row.data.storeId || null) === (item.storeId || null)
    && closeEnough(row.data.quantity, item.quantity, 0.0001)
    && normalizeText(row.data.unit) === normalizeText(item.unit)
    && closeEnough(row.data.boxes, item.boxes, 0.0001)
    && closeEnough(row.data.grossWeight, item.grossWeight, 0.05)
    && closeEnough(row.data.netWeight, item.netWeight, 0.05)
    && closeEnough(row.data.volume, item.volume, 0.05)
    && normalizeText(row.data.specification) === normalizeText(item.specification)
    && normalizeText(row.data.manufacturer) === normalizeText(item.manufacturer)
  ));
}

function countBy(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) counts.set(keyFn(row), (counts.get(keyFn(row)) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }));
}

function section(coverage, name) {
  return coverage.sections.find((item) => item.name === name);
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# WPS 剩余来源缺口分类');
  lines.push('');
  lines.push(`状态：\`${report.status}\``);
  lines.push(`总来源缺口：\`${report.total_without_source}\``);
  lines.push('');
  lines.push('## 覆盖摘要');
  for (const item of report.coverage_summary) {
    lines.push(`- \`${item.name}\`: \`${item.with_source}/${item.total}\`，缺 \`${item.without_source}\``);
  }
  lines.push('');
  lines.push('## 自动回填复核');
  lines.push(`- 销售明细严格匹配：缺口 \`${report.auto_backfill_checks.sales.missing}\`，可唯一回填 \`${report.auto_backfill_checks.sales.eligible}\`，歧义 \`${report.auto_backfill_checks.sales.ambiguous}\`。`);
  lines.push(`- 装箱明细严格匹配：缺口 \`${report.auto_backfill_checks.packing.missing}\`，可唯一回填 \`${report.auto_backfill_checks.packing.eligible}\`，歧义 \`${report.auto_backfill_checks.packing.ambiguous}\`。`);
  lines.push(`- 采购 mismatch：\`${report.auto_backfill_checks.purchase_mismatch.summary}\`。`);
  lines.push('');
  lines.push('## 剩余缺口分桶');
  for (const bucket of report.remaining_buckets) {
    lines.push(`- \`${bucket.bucket}\`: \`${bucket.count}\` - ${bucket.reason}`);
  }
  lines.push('');
  lines.push('## 仍需业务或正式材料');
  for (const item of report.manual_items) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('## 结论');
  lines.push(report.conclusion);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const coverage = readJson('wps_db_source_coverage.json');
  const importPlan = readJson('import_plan.json');
  const mismatchPlan = fs.existsSync(path.join(parsedDir, 'purchase_mismatch_source_note_backfill_plan.json'))
    ? readJson('purchase_mismatch_source_note_backfill_plan.json')
    : null;

  const [salesItems, packingItems, purchaseContracts, purchaseItems, customsDeclarations] = await Promise.all([
    prisma.salesItem.findMany({
      select: {
        id: true, note: true, salesContractId: true, productId: true, storeId: true,
        quantity: true, sellingPrice: true, specification: true,
        salesContract: { select: { contractNo: true } },
      },
    }),
    prisma.packingItem.findMany({
      select: {
        id: true, note: true, salesContractId: true, productId: true, storeId: true,
        quantity: true, unit: true, boxes: true, grossWeight: true, netWeight: true,
        volume: true, specification: true, manufacturer: true,
        salesContract: { select: { contractNo: true } },
      },
    }),
    prisma.purchaseContract.findMany({
      select: { contractNo: true, note: true },
      orderBy: { contractNo: 'asc' },
    }),
    prisma.purchaseItem.findMany({
      select: { note: true, purchaseContract: { select: { contractNo: true } } },
    }),
    prisma.customsDeclaration.findMany({
      select: { declarationNo: true, note: true, salesContract: { select: { contractNo: true } }, items: true },
    }),
  ]);

  const salesRows = salesSourceRows(importPlan);
  const packingRows = packingSourceRows(importPlan);
  const missingSales = salesItems.filter((item) => !hasSourceEvidence(item.note));
  const missingPacking = packingItems.filter((item) => !hasSourceEvidence(item.note));
  const salesMatchCounts = missingSales.map((item) => strictSalesMatches(salesRows, item).length);
  const packingMatchCounts = missingPacking.map((item) => strictPackingMatches(packingRows, item).length);
  const missingPurchaseContracts = purchaseContracts.filter((item) => !hasSourceEvidence(item.note));
  const missingPurchaseItems = purchaseItems.filter((item) => !hasSourceEvidence(item.note));
  const missingCustoms = customsDeclarations.filter((item) => !hasSourceEvidence(item.note));
  const pendingCustoms = missingCustoms.filter((item) => item.declarationNo.startsWith('BGNDING'));

  const report = {
    status: 'source_gaps_classified',
    total_without_source: coverage.total_without_source,
    coverage_summary: coverage.sections.map((item) => ({
      name: item.name,
      total: item.total,
      with_source: item.with_source,
      without_source: item.without_source,
    })),
    auto_backfill_checks: {
      sales: {
        missing: missingSales.length,
        eligible: salesMatchCounts.filter((count) => count === 1).length,
        ambiguous: salesMatchCounts.filter((count) => count > 1).length,
        none: salesMatchCounts.filter((count) => count === 0).length,
      },
      packing: {
        missing: missingPacking.length,
        eligible: packingMatchCounts.filter((count) => count === 1).length,
        ambiguous: packingMatchCounts.filter((count) => count > 1).length,
        none: packingMatchCounts.filter((count) => count === 0).length,
      },
      purchase_mismatch: {
        summary: mismatchPlan
          ? `purchaseContractUpdates=${mismatchPlan.purchaseContractUpdates}; purchaseItemUpdates=${mismatchPlan.purchaseItemUpdates}; skipped=${mismatchPlan.skippedCount}`
          : 'plan not generated',
        skipped: mismatchPlan?.skipped || [],
      },
    },
    remaining_buckets: [
      {
        bucket: 'sales_items_no_strict_source_match',
        count: missingSales.length,
        reason: '当前标准化销售源无法按同合同、同商品、同规格、同数量、同价格、同门店唯一匹配；不自动补。',
      },
      {
        bucket: 'packing_items_no_strict_source_match',
        count: missingPacking.length,
        reason: '当前标准化装箱源无法按完整装箱字段唯一匹配；多为 0 数量、PENDING、拼船/他方报关或历史弱来源。',
      },
      {
        bucket: 'purchase_contracts_remaining',
        count: missingPurchaseContracts.length,
        reason: `剩余合同：${missingPurchaseContracts.map((item) => item.contractNo).join(', ') || '无'}`,
      },
      {
        bucket: 'purchase_items_remaining_by_contract',
        count: missingPurchaseItems.length,
        reason: JSON.stringify(countBy(missingPurchaseItems, (item) => item.purchaseContract.contractNo).slice(0, 10)),
      },
      {
        bucket: 'customs_pending_placeholders',
        count: pendingCustoms.reduce((sum, item) => sum + 1 + item.items.length, 0),
        reason: 'PENDING-威斯敏 占位报关单无法完整匹配同一个 WPS 源集合，不能补来源或当正式编号。',
      },
    ],
    manual_items: [
      'EXP2500002 / 瓷砖 / 合同:13：同一销售数量在不同出货汇总来源中分别指向 Burbank 与 安纳汉姆，需要业务指定门店或拆分。',
      'EXP2400006：旧空运底稿缺正式 18 位海关编号，不能用 invoice_no、模板发票汇总或旧底稿替代正式报关号。',
      'CG2500045 顶层旧副本：仍只在 WPS metadata 可见；业务数据已由已缓存正文覆盖，若必须保留原件需要在 WPS 中打开该副本。',
      'CG2500013：PDF 文件名合同号与同目录 DOCX 正文合同号冲突，且正文候选不唯一。',
    ],
    conclusion: '本轮没有新的安全自动 note 回填项；剩余缺口已按可操作类别归档，后续继续需要更强文件证据或业务/正式材料裁决。',
  };

  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(outMd, renderMarkdown(report));
  console.log(JSON.stringify({
    status: report.status,
    total_without_source: report.total_without_source,
    sales_eligible: report.auto_backfill_checks.sales.eligible,
    packing_eligible: report.auto_backfill_checks.packing.eligible,
    out: { json: outJson, md: outMd },
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
