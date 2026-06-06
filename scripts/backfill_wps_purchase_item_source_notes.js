/**
 * Input: purchase_evidence_items.csv + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/purchase_item_source_note_backfill_plan.json; optional note-only Prisma writes when --apply is passed
 * Pos: WPS 采购明细来源 note 回填脚本；只在合同号、商品、数量、单价/总额唯一匹配时补来源标记，不改业务字段
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
  options.out = options.out || path.join(options.parsedDir, 'purchase_item_source_note_backfill_plan.json');
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/backfill_wps_purchase_item_source_notes.js [options]

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
  return String(value || '').replace(/\s+/g, '').replace(/\*/g, '').toLowerCase();
}

function numberOrNull(value) {
  const number = Number(String(value || '').replace(/[￥¥$,]/g, ''));
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

function sourceNote(row) {
  return `[WPS_PURCHASE_EVIDENCE] ${row.relative_path}#${row.product_name}/${row.quantity}${row.unit || ''}`;
}

function findMatches(sourceRows, item) {
  return sourceRows.filter((row) => {
    if (row.purchase_contract_no !== item.purchaseContract.contractNo) return false;
    if (normalizeText(row.product_name) !== normalizeText(item.product.customsName)) return false;
    if (!closeEnough(numberOrNull(row.quantity), item.quantity, 0.0001)) return false;
    return closeEnough(numberOrNull(row.total_amount), item.totalPrice, 0.05)
      || closeEnough(numberOrNull(row.unit_price), item.unitPrice, 0.05);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceRows = readCsv(path.join(options.parsedDir, 'purchase_evidence_items.csv'));
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
    const matches = findMatches(sourceRows, item);
    if (matches.length !== 1) {
      skipped.push({
        contractNo: item.purchaseContract.contractNo,
        product: item.product.customsName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        reason: matches.length > 1 ? 'ambiguous_source_match' : 'no_unique_source_match',
        matchCount: matches.length,
      });
      continue;
    }
    const matched = matches[0];
    const addition = sourceNote(matched);
    updates.push({
      id: item.id,
      contractNo: item.purchaseContract.contractNo,
      product: item.product.customsName,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      oldNote: item.note || '',
      newNote: appendNote(item.note, addition),
      source: matched.relative_path,
    });
  }

  if (options.apply) {
    await prisma.$transaction(
      updates.map((item) => prisma.purchaseItem.update({ where: { id: item.id }, data: { note: item.newNote } })),
    );
  }

  const plan = {
    dryRun: !options.apply,
    purchaseItemUpdates: updates.length,
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
