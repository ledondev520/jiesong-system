/**
 * Input: preferred_packing_items.csv + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/customs_placeholder_source_note_backfill_plan.json; optional note-only Prisma writes when --apply is passed
 * Pos: WPS 占位报关单来源 note 回填脚本；只在占位报关明细集合与同一 WPS 装箱源集合完全匹配时补来源标记，不改业务字段
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
  options.out = options.out || path.join(options.parsedDir, 'customs_placeholder_source_note_backfill_plan.json');
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/backfill_wps_customs_placeholder_source_notes.js [options]

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

function quantityText(value) {
  const number = numberOrNull(value);
  if (number == null) return '';
  return Number(number.toFixed(4)).toString();
}

function itemKey(name, quantity, unit) {
  return [normalizeText(name), quantityText(quantity), normalizeText(unit)].join('|');
}

function multiset(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key.split('|')[1]) return null;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function sameMultiset(left, right) {
  if (!left || !right || left.size !== right.size) return false;
  for (const [key, count] of left.entries()) {
    if (right.get(key) !== count) return false;
  }
  return true;
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

function groupPackingRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.contract_no || !row.source_file || !row.container_label) continue;
    if (numberOrNull(row.quantity) == null) continue;
    const key = [row.contract_no, row.source_file, row.container_label].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        contractNo: row.contract_no,
        sourceFile: row.source_file,
        containerLabel: row.container_label,
        rows: [],
      });
    }
    groups.get(key).rows.push(row);
  }
  return [...groups.values()];
}

function sourceNote(declaration, group) {
  const rowNumbers = group.rows.map((row) => row.row).filter(Boolean).join(',');
  return [
    `[WPS_PROVISIONAL_CUSTOMS_SOURCE] ${group.sourceFile}#${group.containerLabel}`,
    `placeholder_no=${declaration.declarationNo}`,
    `rows=${rowNumbers}`,
    'not_formal_customs_no',
  ].join(' ');
}

function findMatchingGroups(groups, declaration) {
  if (!/^BGP/.test(declaration.declarationNo)) return [];
  const dbSet = multiset(
    declaration.items,
    (item) => itemKey(item.customsName, item.quantity, item.unit),
  );
  return groups.filter((group) => {
    if (group.contractNo !== declaration.salesContract.contractNo) return false;
    const sourceSet = multiset(
      group.rows,
      (row) => itemKey(row.product_name, row.quantity, row.unit),
    );
    return sameMultiset(dbSet, sourceSet);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceRows = readCsv(path.join(options.parsedDir, 'preferred_packing_items.csv'));
  const groups = groupPackingRows(sourceRows);
  const declarations = await prisma.customsDeclaration.findMany({
    select: {
      id: true,
      declarationNo: true,
      note: true,
      salesContract: { select: { contractNo: true } },
      items: {
        select: {
          itemNo: true,
          customsName: true,
          quantity: true,
          unit: true,
        },
        orderBy: { itemNo: 'asc' },
      },
    },
    orderBy: { declarationNo: 'asc' },
  });

  const updates = [];
  const skipped = [];
  for (const declaration of declarations) {
    if (hasSourceEvidence(declaration.note)) continue;
    const matches = findMatchingGroups(groups, declaration);
    if (matches.length !== 1) {
      skipped.push({
        contractNo: declaration.salesContract.contractNo,
        declarationNo: declaration.declarationNo,
        itemCount: declaration.items.length,
        reason: matches.length > 1 ? 'ambiguous_source_group_match' : 'no_complete_source_group_match',
        matchCount: matches.length,
      });
      continue;
    }
    const matched = matches[0];
    const addition = sourceNote(declaration, matched);
    updates.push({
      id: declaration.id,
      contractNo: declaration.salesContract.contractNo,
      declarationNo: declaration.declarationNo,
      itemCount: declaration.items.length,
      oldNote: declaration.note || '',
      newNote: appendNote(declaration.note, addition),
      source: matched.sourceFile,
      containerLabel: matched.containerLabel,
      rowCount: matched.rows.length,
    });
  }

  if (options.apply) {
    await prisma.$transaction(
      updates.map((item) => prisma.customsDeclaration.update({ where: { id: item.id }, data: { note: item.newNote } })),
    );
  }

  const plan = {
    dryRun: !options.apply,
    customsDeclarationUpdates: updates.length,
    skippedCount: skipped.length,
    updates: updates.map(({ id, ...item }) => item),
    skipped,
    mode: options.apply ? 'apply' : 'dry-run',
  };
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({
    dryRun: !options.apply,
    customsDeclarationUpdates: updates.length,
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
