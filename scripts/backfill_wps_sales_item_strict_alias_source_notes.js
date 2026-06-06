/**
 * Input: wps_source_gap_disposition.json + preferred_sales_items.csv + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/sales_item_strict_alias_source_note_backfill_plan.json; optional note-only Prisma writes when --apply is passed
 * Pos: WPS 销售明细别名来源 note 回填脚本；只处理 no_candidate_source_required 中同合同/数量/单价强一致且商品别名唯一的销售记录
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

const ALIASES = new Map([
  ['led吊灯', new Set(['吊灯'])],
  ['吊灯', new Set(['led吊灯'])],
  ['餐盘', new Set(['密胺餐盘', '陶瓷餐盘'])],
  ['密胺餐盘', new Set(['餐盘'])],
  ['人造石英石制品', new Set(['人造石英石板材', '人造石英石台面'])],
  ['人造石英石板材', new Set(['人造石英石制品'])],
]);

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
  options.out = options.out || path.join(options.parsedDir, 'sales_item_strict_alias_source_note_backfill_plan.json');
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/backfill_wps_sales_item_strict_alias_source_notes.js [options]

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
    .toLowerCase();
}

function numberOrNull(value) {
  const number = Number(String(value ?? '').replace(/[￥¥$,]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function closeEnough(left, right, tolerance = 0.01) {
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

function sourceNote(row, item) {
  return `[WPS_SALES_STRICT_ALIAS_SOURCE] ${sourceReference(row)}/${row.product_name}/${row.quantity}@${row.unit_price} alias=${item.product.customsName}->${row.product_name}`;
}

function isAlias(dbProduct, sourceProduct) {
  const db = normalizeText(dbProduct);
  const source = normalizeText(sourceProduct);
  if (!db || !source || db === source) return false;
  const aliases = ALIASES.get(db);
  return Boolean(aliases?.has(source));
}

function noCandidateSalesIds(disposition) {
  return new Set(
    disposition.details
      .filter((row) => row.disposition === 'no_candidate_source_required')
      .filter((row) => row.type === 'sales_item_missing_source')
      .map((row) => row.id),
  );
}

function findMatches(sourceRows, item) {
  return sourceRows.filter((row) => {
    const sourceQuantity = numberOrNull(row.quantity);
    const sourcePrice = numberOrNull(row.unit_price);
    if (sourceQuantity == null || sourceQuantity <= 0 || sourcePrice == null) return false;
    if (row.contract_no !== item.salesContract.contractNo) return false;
    if (!isAlias(item.product.customsName, row.product_name)) return false;
    if (!closeEnough(sourceQuantity, item.quantity, 0.0001)) return false;
    if (!closeEnough(sourcePrice, item.sellingPrice, 0.0001)) return false;
    return true;
  });
}

async function sourceAlreadyAttached(source) {
  const [salesCount, packingCount] = await Promise.all([
    prisma.salesItem.count({ where: { note: { contains: source } } }),
    prisma.packingItem.count({ where: { note: { contains: source } } }),
  ]);
  return salesCount + packingCount;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceRows = readCsv(path.join(options.parsedDir, 'preferred_sales_items.csv'));
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
    const matches = findMatches(sourceRows, item);
    if (matches.length !== 1) {
      skipped.push({
        id: item.id,
        contractNo: item.salesContract.contractNo,
        product: item.product.customsName,
        store: item.store?.name || '',
        quantity: item.quantity,
        unit: item.unit || '',
        sellingPrice: item.sellingPrice,
        reason: matches.length > 1 ? 'ambiguous_strict_alias_source_match' : 'no_strict_alias_source_match',
        matchCount: matches.length,
      });
      continue;
    }
    const matched = matches[0];
    const source = sourceReference(matched);
    const attachedCount = await sourceAlreadyAttached(source);
    if (attachedCount > 0) {
      skipped.push({
        id: item.id,
        contractNo: item.salesContract.contractNo,
        product: item.product.customsName,
        store: item.store?.name || '',
        quantity: item.quantity,
        sellingPrice: item.sellingPrice,
        reason: 'source_already_attached_elsewhere',
        matchCount: matches.length,
        attachedCount,
        source,
      });
      continue;
    }
    const addition = sourceNote(matched, item);
    updates.push({
      id: item.id,
      contractNo: item.salesContract.contractNo,
      product: item.product.customsName,
      sourceProduct: matched.product_name,
      store: item.store?.name || '',
      quantity: item.quantity,
      unit: item.unit,
      sellingPrice: item.sellingPrice,
      oldNote: item.note || '',
      newNote: appendNote(item.note, addition),
      source: matched.source_file,
      sourceSheet: matched.sheet,
      sourceRow: matched.row,
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
