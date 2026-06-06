/**
 * Input: purchase_evidence_extracts.csv + purchase_evidence_items.csv + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/purchase_mismatch_source_note_backfill_plan.json; optional note-only Prisma writes when --apply is passed
 * Pos: WPS 采购合同号口径冲突来源 note 回填脚本；只在文件名合同号与正文合同号不同但供应商/日期/金额可对齐时补 mismatch 来源标记，不改业务字段
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
  options.out = options.out || path.join(options.parsedDir, 'purchase_mismatch_source_note_backfill_plan.json');
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/backfill_wps_purchase_mismatch_source_notes.js [options]

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
  const number = Number(String(value ?? '').replace(/[￥¥$,]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function closeEnough(left, right, tolerance = 0.02) {
  return left != null && right != null && Math.abs(left - right) <= tolerance;
}

function dateKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function dirName(relativePath) {
  return path.dirname(relativePath || '').replace(/\\/g, '/');
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

function sourceNote(contract, blockedRow, bodyRow) {
  return [
    `[WPS_PURCHASE_FILENAME_CONTRACT_MISMATCH] ${blockedRow.relative_path}`,
    `filename_contract_no=${contract.contractNo}`,
    `body_contract_no=${bodyRow.purchase_contract_no}`,
    'body_contract_no_mismatch',
    'pdf_text_blocked',
  ].join(' ');
}

function itemSourceNote(item, blockedRow, bodyRow) {
  return [
    `[WPS_PURCHASE_FILENAME_CONTRACT_MISMATCH] ${blockedRow.relative_path}`,
    `filename_contract_no=${item.purchaseContract.contractNo}`,
    `body_contract_no=${bodyRow.purchase_contract_no}`,
    'body_contract_no_mismatch',
    'pdf_text_blocked',
  ].join(' ');
}

function findBodyRows(extractRows, blockedRow, contract) {
  const blockedDir = dirName(blockedRow.relative_path);
  return extractRows.filter((row) => {
    if (row.status !== 'ok') return false;
    if (row.extraction_method !== 'docx') return false;
    if (dirName(row.relative_path) !== blockedDir) return false;
    if (row.purchase_contract_no === contract.contractNo) return false;
    if (normalizeText(row.supplier_name) !== normalizeText(contract.supplier.name)) return false;
    if (!closeEnough(numberOrNull(row.total_amount), contract.totalAmount, 0.05)) return false;
    if (dateKey(row.signed_at) !== dateKey(contract.signedAt)) return false;
    return true;
  });
}

function findItemBodyRows(itemRows, bodyRow, item) {
  return itemRows.filter((row) => {
    if (row.relative_path !== bodyRow.relative_path) return false;
    if (row.purchase_contract_no !== bodyRow.purchase_contract_no) return false;
    if (normalizeText(row.supplier_name) !== normalizeText(item.purchaseContract.supplier.name)) return false;
    if (!closeEnough(numberOrNull(row.quantity), item.quantity, 0.0001)) return false;
    if (!closeEnough(numberOrNull(row.total_amount), item.totalPrice, 0.05)) return false;
    return normalizeText(row.product_name).includes(normalizeText(item.product.customsName))
      || normalizeText(item.product.customsName).includes(normalizeText(row.product_name));
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const extractRows = readCsv(path.join(options.parsedDir, 'purchase_evidence_extracts.csv'));
  const itemRows = readCsv(path.join(options.parsedDir, 'purchase_evidence_items.csv'));
  const purchaseContracts = await prisma.purchaseContract.findMany({
    select: {
      id: true,
      contractNo: true,
      note: true,
      signedAt: true,
      totalAmount: true,
      supplier: { select: { name: true } },
      items: {
        select: {
          id: true,
          note: true,
          quantity: true,
          totalPrice: true,
          product: { select: { customsName: true } },
        },
      },
    },
    orderBy: { contractNo: 'asc' },
  });

  const contractUpdates = [];
  const itemUpdates = [];
  const skipped = [];
  for (const contract of purchaseContracts) {
    if (hasSourceEvidence(contract.note)) continue;
    const blockedRows = extractRows.filter((row) => (
      row.purchase_contract_no === contract.contractNo
      && row.status === 'empty_text'
      && String(row.issues || '').includes('pdf_text_extractor_unavailable')
      && String(row.relative_path || '').toLowerCase().endsWith('.pdf')
    ));
    if (blockedRows.length !== 1) {
      skipped.push({
        contractNo: contract.contractNo,
        reason: blockedRows.length > 1 ? 'ambiguous_blocked_pdf_source' : 'no_blocked_pdf_source',
        matchCount: blockedRows.length,
      });
      continue;
    }
    const blockedRow = blockedRows[0];
    const bodyRows = findBodyRows(extractRows, blockedRow, contract);
    if (bodyRows.length !== 1) {
      skipped.push({
        contractNo: contract.contractNo,
        source: blockedRow.relative_path,
        reason: bodyRows.length > 1 ? 'ambiguous_body_contract_match' : 'no_body_contract_match',
        matchCount: bodyRows.length,
      });
      continue;
    }
    const bodyRow = bodyRows[0];
    contractUpdates.push({
      id: contract.id,
      contractNo: contract.contractNo,
      oldNote: contract.note || '',
      newNote: appendNote(contract.note, sourceNote(contract, blockedRow, bodyRow)),
      filenameSource: blockedRow.relative_path,
      bodySource: bodyRow.relative_path,
      bodyContractNo: bodyRow.purchase_contract_no,
    });
    for (const item of contract.items) {
      if (hasSourceEvidence(item.note)) continue;
      const itemMatches = findItemBodyRows(itemRows, bodyRow, { ...item, purchaseContract: contract });
      if (itemMatches.length !== 1) {
        skipped.push({
          contractNo: contract.contractNo,
          product: item.product.customsName,
          reason: itemMatches.length > 1 ? 'ambiguous_body_item_match' : 'no_body_item_match',
          matchCount: itemMatches.length,
        });
        continue;
      }
      itemUpdates.push({
        id: item.id,
        contractNo: contract.contractNo,
        product: item.product.customsName,
        oldNote: item.note || '',
        newNote: appendNote(item.note, itemSourceNote({ ...item, purchaseContract: contract }, blockedRow, bodyRow)),
        filenameSource: blockedRow.relative_path,
        bodySource: bodyRow.relative_path,
        bodyContractNo: bodyRow.purchase_contract_no,
      });
    }
  }

  if (options.apply) {
    await prisma.$transaction([
      ...contractUpdates.map((item) => prisma.purchaseContract.update({ where: { id: item.id }, data: { note: item.newNote } })),
      ...itemUpdates.map((item) => prisma.purchaseItem.update({ where: { id: item.id }, data: { note: item.newNote } })),
    ]);
  }

  const plan = {
    dryRun: !options.apply,
    purchaseContractUpdates: contractUpdates.length,
    purchaseItemUpdates: itemUpdates.length,
    skippedCount: skipped.length,
    contractUpdates: contractUpdates.map(({ id, ...item }) => item),
    itemUpdates: itemUpdates.map(({ id, ...item }) => item),
    skipped,
    mode: options.apply ? 'apply' : 'dry-run',
  };
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({
    dryRun: !options.apply,
    purchaseContractUpdates: contractUpdates.length,
    purchaseItemUpdates: itemUpdates.length,
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
