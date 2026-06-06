/**
 * Input: purchase_evidence_items.csv + purchase_evidence_preferred.csv + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/purchase_item_strict_alias_source_note_backfill_plan.json; optional note/quantity/unit Prisma writes when --apply is passed
 * Pos: WPS 采购明细来源 note 补强脚本；只在同合同、金额、单价、数量/单位强对齐，且商品名为包含式别名时补来源；可修复 quantity=0/unit=源数量的字段错位
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
  options.out = options.out || path.join(options.parsedDir, 'purchase_item_strict_alias_source_note_backfill_plan.json');
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/backfill_wps_purchase_item_strict_alias_source_notes.js [options]

Options:
  --parsed-dir <dir>  解析产物目录，默认 tmp/wps_11_export_list_raw/parsed
  --out <file>        输出 plan JSON
  --apply             执行写库；不传则只 dry-run
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
  return String(value || '').replace(/\s+/g, '').replace(/\*/g, '').toLowerCase();
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(String(value).replace(/[￥¥$,]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function closeEnough(left, right, tolerance = 0.02) {
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

function productCompatible(sourceName, dbName) {
  const source = normalizeText(sourceName);
  const db = normalizeText(dbName);
  if (!source || !db) return false;
  if (source === db) return true;
  if (source.length >= 2 && db.includes(source)) return true;
  if (db.length >= 2 && source.includes(db)) return true;
  return false;
}

function sourceNote(row, item, options = {}) {
  const markers = [];
  if (normalizeText(row.product_name) !== normalizeText(item.product.customsName)) {
    markers.push(`alias=${item.product.customsName}->${row.product_name}`);
  }
  if (options.correctQuantityUnit) {
    markers.push(`quantity_unit_corrected=${item.quantity}/${item.unit || ''}->${row.quantity}/${row.unit || ''}`);
  }
  const suffix = markers.length > 0 ? ` [WPS_PURCHASE_STRICT_ALIAS] ${markers.join(' ')}` : ' [WPS_PURCHASE_STRICT_ALIAS]';
  return `[WPS_PURCHASE_EVIDENCE] ${row.relative_path}#${row.product_name}/${row.quantity}${row.unit || ''}${suffix}`;
}

function preferredPathByContract(preferredRows) {
  const out = new Map();
  for (const row of preferredRows) {
    if (!row.purchase_contract_no || !row.relative_path) continue;
    if (!out.has(row.purchase_contract_no)) out.set(row.purchase_contract_no, row.relative_path);
  }
  return out;
}

function rowMatches(row, item) {
  if (row.purchase_contract_no !== item.purchaseContract.contractNo) return null;
  if (!productCompatible(row.product_name, item.product.customsName)) return null;
  const sourceQuantity = numberOrNull(row.quantity);
  const sourceUnitPrice = numberOrNull(row.unit_price);
  const sourceTotal = numberOrNull(row.total_amount);
  if (!closeEnough(sourceTotal, item.totalPrice, 0.05)) return null;
  if (!closeEnough(sourceUnitPrice, item.unitPrice, 0.05)) return null;

  const directQuantity = closeEnough(sourceQuantity, item.quantity, 0.0001);
  const unitAsQuantity = closeEnough(sourceQuantity, numberOrNull(item.unit), 0.0001)
    && closeEnough(item.quantity, 0, 0.0001)
    && String(row.unit || '').trim()
    && Number.isNaN(Number(row.unit));
  if (!directQuantity && !unitAsQuantity) return null;
  return { correctQuantityUnit: Boolean(unitAsQuantity) };
}

function chooseUniqueMatch(rows, item, preferredByContract) {
  const matches = [];
  for (const row of rows) {
    const matchOptions = rowMatches(row, item);
    if (matchOptions) matches.push({ row, options: matchOptions });
  }
  if (matches.length === 1) return { match: matches[0], skippedReason: null, matchCount: 1 };
  if (matches.length > 1) {
    const preferred = preferredByContract.get(item.purchaseContract.contractNo);
    const preferredMatches = matches.filter((match) => match.row.relative_path === preferred);
    if (preferredMatches.length === 1) return { match: preferredMatches[0], skippedReason: null, matchCount: matches.length };
    return { match: null, skippedReason: 'ambiguous_strict_alias_match', matchCount: matches.length };
  }
  return { match: null, skippedReason: 'no_strict_alias_match', matchCount: 0 };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceRows = readCsv(path.join(options.parsedDir, 'purchase_evidence_items.csv'));
  const preferredRows = readCsv(path.join(options.parsedDir, 'purchase_evidence_preferred.csv'));
  const preferredByContract = preferredPathByContract(preferredRows);
  const purchaseItems = await prisma.purchaseItem.findMany({
    select: {
      id: true,
      note: true,
      quantity: true,
      unit: true,
      unitPrice: true,
      totalPrice: true,
      purchaseContract: { select: { contractNo: true } },
      product: { select: { customsName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const updates = [];
  const skipped = [];
  for (const item of purchaseItems) {
    if (hasSourceEvidence(item.note)) continue;
    const { match, skippedReason, matchCount } = chooseUniqueMatch(sourceRows, item, preferredByContract);
    if (!match) {
      if (item.purchaseContract.contractNo.startsWith('CG25') || item.purchaseContract.contractNo.startsWith('CG26')) {
        skipped.push({
          contractNo: item.purchaseContract.contractNo,
          product: item.product.customsName,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          reason: skippedReason,
          matchCount,
        });
      }
      continue;
    }

    const addition = sourceNote(match.row, item, match.options);
    const update = {
      id: item.id,
      contractNo: item.purchaseContract.contractNo,
      product: item.product.customsName,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      newQuantity: match.options.correctQuantityUnit ? numberOrNull(match.row.quantity) : item.quantity,
      newUnit: match.options.correctQuantityUnit ? (match.row.unit || null) : item.unit,
      oldNote: item.note || '',
      newNote: appendNote(item.note, addition),
      source: match.row.relative_path,
      sourceProduct: match.row.product_name,
      sourceQuantity: numberOrNull(match.row.quantity),
      sourceUnit: match.row.unit || null,
      sourceUnitPrice: numberOrNull(match.row.unit_price),
      sourceTotal: numberOrNull(match.row.total_amount),
      correctQuantityUnit: match.options.correctQuantityUnit,
      matchCount,
      usedPreferredTieBreak: matchCount > 1,
    };
    updates.push(update);
  }

  if (options.apply) {
    await prisma.$transaction(
      updates.map((item) => prisma.purchaseItem.update({
        where: { id: item.id },
        data: {
          quantity: item.newQuantity,
          unit: item.newUnit,
          note: item.newNote,
        },
      })),
    );
  }

  const plan = {
    dryRun: !options.apply,
    purchaseItemUpdates: updates.length,
    quantityUnitCorrections: updates.filter((item) => item.correctQuantityUnit).length,
    skippedCount: skipped.length,
    updates: updates.map(({ id, ...item }) => item),
    skipped,
    mode: options.apply ? 'apply' : 'dry-run',
  };
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({
    dryRun: !options.apply,
    purchaseItemUpdates: updates.length,
    quantityUnitCorrections: plan.quantityUnitCorrections,
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
