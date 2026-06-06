/**
 * Input: wps_source_gap_disposition.json + preferred_packing_items.csv + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/sales_item_shipment_summary_source_note_backfill_plan.json; optional note-only Prisma writes when --apply is passed
 * Pos: WPS 销售明细出货汇总来源 note 回填脚本；只在出货汇总同合同/商品/门店/售价强一致且数量一行或同价多行精确覆盖时补来源标记
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
const DEFAULT_PARSED_DIR = path.join(repoRoot, 'tmp/wps_11_export_list_raw/parsed');
const sourceEvidencePattern = /\[WPS_|WPS_|11-报关记录|12-报关单|_wps_cloud_root|出货汇总|报关单|出口退税联/;

function parseArgs(argv) {
  const options = { parsedDir: DEFAULT_PARSED_DIR, out: null, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--parsed-dir') {
      options.parsedDir = path.resolve(argv[++index]);
    } else if (arg === '--out') {
      options.out = path.resolve(argv[++index]);
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  options.out = options.out || path.join(
    options.parsedDir,
    'sales_item_shipment_summary_source_note_backfill_plan.json',
  );
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/backfill_wps_sales_from_shipment_summary_notes.js [options]

Options:
  --parsed-dir <dir>  解析产物目录，默认 tmp/wps_11_export_list_raw/parsed
  --out <file>        输出 plan JSON
  --apply             执行 note-only 写库；不传则只 dry-run
`);
}

function readCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(`${filePath} CSV 解析失败: ${first.message}`);
  }
  return parsed.data.map((row) => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key.replace(/^\uFEFF/, '')] = typeof value === 'string' ? value.trim() : value;
    }
    return normalized;
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/\*/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/店$/, '')
    .toLowerCase();
}

function numberOrNull(value) {
  const number = Number(String(value ?? '').replace(/[￥¥$,]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function closeEnough(left, right, tolerance = 0.0001) {
  return left != null && right != null && Math.abs(left - right) <= tolerance;
}

function hasSourceEvidence(note) {
  return sourceEvidencePattern.test(String(note || ''));
}

function appendNote(existingNote, addition) {
  const existing = String(existingNote || '').trim();
  if (!existing) return addition;
  if (existing.includes(addition)) return existing;
  return `${existing}\n${addition}`;
}

function sourceReference(row) {
  return `${row.source_file}#${row.sheet}:${row.row}`;
}

function isShipmentSummaryRow(row) {
  const source = String(row.source_file || '');
  const sheet = String(row.sheet || '');
  return source.includes('出货汇总') || source.includes('_wps_cloud_root') || sheet.includes('出货汇总');
}

function noCandidateSalesIds(disposition) {
  return new Set(
    disposition.details
      .filter((row) => row.disposition === 'no_candidate_source_required')
      .filter((row) => row.type === 'sales_item_missing_source')
      .map((row) => row.id),
  );
}

function groupKey(row) {
  return [
    row.contract_no,
    normalizeText(row.product_name),
    normalizeText(row.store),
    normalizeText(row.unit),
    numberOrNull(row.unit_price),
  ].join('|');
}

function buildSourceGroups(sourceRows) {
  const groups = new Map();
  for (const row of sourceRows) {
    const quantity = numberOrNull(row.quantity);
    const unitPrice = numberOrNull(row.unit_price);
    if (!isShipmentSummaryRow(row)) continue;
    if (!row.contract_no || !row.product_name || !row.store) continue;
    if (quantity == null || quantity <= 0) continue;
    if (unitPrice == null) continue;
    const key = groupKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function sourceNote(rows, item) {
  const refs = rows.map((row) => `${sourceReference(row)}/${row.product_name}/${row.quantity}@${row.unit_price}`);
  return [
    `[WPS_SHIPMENT_SUMMARY_SALES_SOURCE] ${refs.join(' + ')}`,
    `matched=${item.product.customsName}/${item.store?.name || ''}/${item.quantity}@${item.sellingPrice}`,
  ].join(' ');
}

function findCoverage(sourceGroups, item) {
  const key = [
    item.salesContract.contractNo,
    normalizeText(item.product.customsName),
    normalizeText(item.store?.name),
    normalizeText(item.unit),
    item.sellingPrice,
  ].join('|');
  const rows = sourceGroups.get(key) || [];
  if (rows.length === 0) return { status: 'no_shipment_summary_match', rows: [] };

  const exactRows = rows.filter((row) => closeEnough(numberOrNull(row.quantity), item.quantity));
  if (exactRows.length === 1) return { status: 'single_exact_match', rows: exactRows };
  if (exactRows.length > 1) return { status: 'ambiguous_single_exact_match', rows: exactRows };

  const total = rows.reduce((sum, row) => sum + (numberOrNull(row.quantity) || 0), 0);
  if (closeEnough(total, item.quantity)) return { status: 'aggregate_exact_match', rows };
  return { status: 'quantity_not_covered', rows };
}

async function sourceAlreadyAttachedToSales(rows) {
  const counts = await Promise.all(
    rows.map((row) => prisma.salesItem.count({ where: { note: { contains: sourceReference(row) } } })),
  );
  return counts.reduce((sum, count) => sum + count, 0);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceRows = readCsv(path.join(options.parsedDir, 'preferred_packing_items.csv'));
  const sourceGroups = buildSourceGroups(sourceRows);
  const disposition = readJson(path.join(options.parsedDir, 'wps_source_gap_disposition.json'));
  const targetIds = noCandidateSalesIds(disposition);
  const salesItems = await prisma.salesItem.findMany({
    where: { id: { in: [...targetIds] } },
    select: {
      id: true,
      note: true,
      quantity: true,
      unit: true,
      sellingPrice: true,
      specification: true,
      salesContract: { select: { contractNo: true } },
      product: { select: { customsName: true } },
      store: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const updates = [];
  const skipped = [];
  for (const item of salesItems) {
    if (hasSourceEvidence(item.note)) continue;
    const coverage = findCoverage(sourceGroups, item);
    if (!['single_exact_match', 'aggregate_exact_match'].includes(coverage.status)) {
      skipped.push({
        id: item.id,
        contractNo: item.salesContract.contractNo,
        product: item.product.customsName,
        store: item.store?.name || '',
        quantity: item.quantity,
        unit: item.unit || '',
        sellingPrice: item.sellingPrice,
        reason: coverage.status,
        sourceRowsConsidered: coverage.rows.map(sourceReference),
        sourceQuantityTotal: coverage.rows.reduce((sum, row) => sum + (numberOrNull(row.quantity) || 0), 0),
      });
      continue;
    }
    const attachedCount = await sourceAlreadyAttachedToSales(coverage.rows);
    if (attachedCount > 0) {
      skipped.push({
        id: item.id,
        contractNo: item.salesContract.contractNo,
        product: item.product.customsName,
        store: item.store?.name || '',
        quantity: item.quantity,
        sellingPrice: item.sellingPrice,
        reason: 'source_already_attached_to_sales',
        attachedCount,
        sourceRowsConsidered: coverage.rows.map(sourceReference),
      });
      continue;
    }
    const addition = sourceNote(coverage.rows, item);
    updates.push({
      id: item.id,
      contractNo: item.salesContract.contractNo,
      product: item.product.customsName,
      store: item.store?.name || '',
      quantity: item.quantity,
      unit: item.unit || '',
      sellingPrice: item.sellingPrice,
      matchType: coverage.status,
      oldNote: item.note || '',
      newNote: appendNote(item.note, addition),
      sourceRows: coverage.rows.map((row) => ({
        source: row.source_file,
        sheet: row.sheet,
        row: row.row,
        product: row.product_name,
        store: row.store,
        quantity: row.quantity,
        unit: row.unit,
        unitPrice: row.unit_price,
        totalPrice: row.total_price,
        purchaseCost: row.purchase_cost,
      })),
    });
  }

  if (options.apply) {
    await prisma.$transaction(
      updates.map((item) => prisma.salesItem.update({ where: { id: item.id }, data: { note: item.newNote } })),
    );
  }

  const plan = {
    dryRun: !options.apply,
    targetCount: targetIds.size,
    scannedCount: salesItems.length,
    sourceGroupCount: sourceGroups.size,
    salesItemUpdates: updates.length,
    skippedCount: skipped.length,
    updates: updates.map(({ id, ...item }) => item),
    skipped,
    mode: options.apply ? 'apply' : 'dry-run',
  };
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({
    dryRun: !options.apply,
    targetCount: plan.targetCount,
    scannedCount: plan.scannedCount,
    sourceGroupCount: plan.sourceGroupCount,
    salesItemUpdates: updates.length,
    skippedCount: skipped.length,
    out: options.out,
    mode: plan.mode,
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
