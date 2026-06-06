/**
 * Input: parsed/contracts.csv + purchase_evidence_import_plan.json + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/contract_source_note_backfill_plan.json; optional note-only Prisma writes when --apply is passed
 * Pos: WPS 合同头来源 note 回填脚本；只补出口/采购合同头的文件来源标记，不改业务字段
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
  options.out = options.out || path.join(options.parsedDir, 'contract_source_note_backfill_plan.json');
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/backfill_wps_contract_source_notes.js [options]

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

function parseSourceList(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text.replace(/'/g, '"'));
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // Fall through to separator parsing.
    }
  }
  return text.split(/[;|]/).map((item) => item.trim()).filter(Boolean);
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

function buildSalesSourceByContract(parsedDir) {
  const rows = readCsv(path.join(parsedDir, 'contracts.csv'));
  const byContract = new Map();
  for (const row of rows) {
    const contractNo = row.contract_no;
    const sources = parseSourceList(row.source_files);
    if (!contractNo || sources.length === 0) continue;
    byContract.set(contractNo, sources);
  }
  return byContract;
}

function buildPurchaseSourceByContract(parsedDir) {
  const planPath = path.join(parsedDir, 'purchase_evidence_import_plan.json');
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const byContract = new Map();
  for (const item of plan.skipped || []) {
    if (item.readiness !== 'already_in_db') continue;
    if (!item.contractNo || !item.source) continue;
    if (!byContract.has(item.contractNo)) byContract.set(item.contractNo, new Set());
    byContract.get(item.contractNo).add(item.source);
  }
  return new Map([...byContract.entries()].map(([contractNo, sources]) => [contractNo, [...sources].sort()]));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const salesSourceByContract = buildSalesSourceByContract(options.parsedDir);
  const purchaseSourceByContract = buildPurchaseSourceByContract(options.parsedDir);

  const [salesContracts, purchaseContracts] = await Promise.all([
    prisma.salesContract.findMany({ select: { id: true, contractNo: true, note: true }, orderBy: { contractNo: 'asc' } }),
    prisma.purchaseContract.findMany({ select: { id: true, contractNo: true, note: true }, orderBy: { contractNo: 'asc' } }),
  ]);

  const salesUpdates = [];
  for (const contract of salesContracts) {
    const sources = salesSourceByContract.get(contract.contractNo);
    if (!sources || sources.length === 0) continue;
    if (hasSourceEvidence(contract.note)) continue;
    const addition = `[WPS_CONTRACT_SOURCE] ${sources.join('; ')}`;
    salesUpdates.push({
      id: contract.id,
      contractNo: contract.contractNo,
      oldNote: contract.note || '',
      newNote: appendNote(contract.note, addition),
      sources,
    });
  }

  const purchaseUpdates = [];
  for (const contract of purchaseContracts) {
    const sources = purchaseSourceByContract.get(contract.contractNo);
    if (!sources || sources.length === 0) continue;
    if (hasSourceEvidence(contract.note)) continue;
    const addition = `[WPS_PURCHASE_EVIDENCE] ${sources.join('; ')}`;
    purchaseUpdates.push({
      id: contract.id,
      contractNo: contract.contractNo,
      oldNote: contract.note || '',
      newNote: appendNote(contract.note, addition),
      sources,
    });
  }

  if (options.apply) {
    await prisma.$transaction([
      ...salesUpdates.map((item) => prisma.salesContract.update({ where: { id: item.id }, data: { note: item.newNote } })),
      ...purchaseUpdates.map((item) => prisma.purchaseContract.update({ where: { id: item.id }, data: { note: item.newNote } })),
    ]);
  }

  const plan = {
    dryRun: !options.apply,
    salesContractUpdates: salesUpdates.length,
    purchaseContractUpdates: purchaseUpdates.length,
    salesUpdates: salesUpdates.map(({ id, ...item }) => item),
    purchaseUpdates: purchaseUpdates.map(({ id, ...item }) => item),
    mode: options.apply ? 'apply' : 'dry-run',
  };

  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({
    dryRun: !options.apply,
    salesContractUpdates: salesUpdates.length,
    purchaseContractUpdates: purchaseUpdates.length,
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
