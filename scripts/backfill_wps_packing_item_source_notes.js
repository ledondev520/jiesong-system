/**
 * Input: preferred_packing_items.csv + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/packing_item_source_note_backfill_plan.json; optional note-only Prisma writes when --apply is passed
 * Pos: WPS 装箱明细来源 note 回填脚本；只在合同号、商品、门店、数量和可用装箱字段唯一匹配时补来源标记，不改业务字段
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
  options.out = options.out || path.join(options.parsedDir, 'packing_item_source_note_backfill_plan.json');
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/backfill_wps_packing_item_source_notes.js [options]

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

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, '').replace(/\*/g, '').replace(/店$/, '').toLowerCase();
}

function numberOrNull(value) {
  const number = Number(String(value ?? '').replace(/[￥¥$,]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function closeEnough(left, right, tolerance = 0.02) {
  return left != null && right != null && Math.abs(left - right) <= tolerance;
}

function bothEmpty(left, right) {
  return String(left || '').trim() === '' && String(right || '').trim() === '';
}

function textEqualWhenPresent(left, right) {
  if (bothEmpty(left, right)) return true;
  return normalizeText(left) === normalizeText(right);
}

function numberEqualWhenPresent(left, right, tolerance = 0.02) {
  const leftNumber = numberOrNull(left);
  const rightNumber = numberOrNull(right);
  if (leftNumber == null && rightNumber == null) return true;
  return closeEnough(leftNumber, rightNumber, tolerance);
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

function sourceNote(row) {
  return `[WPS_PACKING_SOURCE] ${row.source_file}#${row.sheet}:${row.row}/${row.product_name}/${row.quantity}${row.unit || ''}`;
}

function hasUsefulPackingAnchor(row) {
  return Boolean(row.boxes || row.specification || row.manufacturer || row.gross_weight || row.net_weight || row.volume);
}

function findMatches(sourceRows, item) {
  return sourceRows.filter((row) => {
    const sourceQuantity = numberOrNull(row.quantity);
    if (sourceQuantity == null || sourceQuantity <= 0) return false;
    if (!hasUsefulPackingAnchor(row)) return false;
    if (row.contract_no !== item.salesContract.contractNo) return false;
    if (normalizeText(row.product_name) !== normalizeText(item.product.customsName)) return false;
    if (!item.store?.name || normalizeText(row.store) !== normalizeText(item.store.name)) return false;
    if (!closeEnough(sourceQuantity, item.quantity, 0.0001)) return false;
    if (!textEqualWhenPresent(row.specification, item.specification)) return false;
    if (!textEqualWhenPresent(row.manufacturer, item.manufacturer)) return false;
    if (!numberEqualWhenPresent(row.boxes, item.boxes, 0.0001)) return false;
    if (!numberEqualWhenPresent(row.gross_weight, item.grossWeight, 0.05)) return false;
    if (!numberEqualWhenPresent(row.net_weight, item.netWeight, 0.05)) return false;
    return numberEqualWhenPresent(row.volume, item.volume, 0.05);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceRows = readCsv(path.join(options.parsedDir, 'preferred_packing_items.csv'));
  const packingItems = await prisma.packingItem.findMany({
    select: {
      id: true,
      note: true,
      quantity: true,
      unit: true,
      boxes: true,
      grossWeight: true,
      netWeight: true,
      volume: true,
      specification: true,
      manufacturer: true,
      salesContract: { select: { contractNo: true } },
      product: { select: { customsName: true } },
      store: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const updates = [];
  const skipped = [];
  for (const item of packingItems) {
    if (hasSourceEvidence(item.note)) continue;
    const matches = findMatches(sourceRows, item);
    if (matches.length !== 1) {
      skipped.push({
        contractNo: item.salesContract.contractNo,
        product: item.product.customsName,
        store: item.store?.name || '',
        quantity: item.quantity,
        boxes: item.boxes,
        specification: item.specification,
        manufacturer: item.manufacturer,
        reason: matches.length > 1 ? 'ambiguous_source_match' : 'no_unique_source_match',
        matchCount: matches.length,
      });
      continue;
    }
    const matched = matches[0];
    const addition = sourceNote(matched);
    updates.push({
      id: item.id,
      contractNo: item.salesContract.contractNo,
      product: item.product.customsName,
      store: item.store?.name || '',
      quantity: item.quantity,
      unit: item.unit,
      boxes: item.boxes,
      specification: item.specification,
      manufacturer: item.manufacturer,
      oldNote: item.note || '',
      newNote: appendNote(item.note, addition),
      source: matched.source_file,
      sourceSheet: matched.sheet,
      sourceRow: matched.row,
    });
  }

  if (options.apply) {
    await prisma.$transaction(
      updates.map((item) => prisma.packingItem.update({ where: { id: item.id }, data: { note: item.newNote } })),
    );
  }

  const plan = {
    dryRun: !options.apply,
    packingItemUpdates: updates.length,
    skippedCount: skipped.length,
    updates: updates.map(({ id, ...item }) => item),
    skipped,
    mode: options.apply ? 'apply' : 'dry-run',
  };
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({
    dryRun: !options.apply,
    packingItemUpdates: updates.length,
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
