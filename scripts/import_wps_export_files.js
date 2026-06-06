/**
 * Input: attachment_inventory.csv + backend/prisma/dev.db
 * Output: optional deterministic file copies under backend/uploads/sales-contracts + SalesContractFile records
 * Pos: WPS 出货源文件附件导入脚本；默认 dry-run，显式 --apply 后才复制文件并创建附件记录，不改出口业务字段
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const backendPath = path.join(repoRoot, 'backend');
process.chdir(backendPath);

const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));
const Papa = require(path.join(backendPath, 'node_modules/papaparse'));

const prisma = new PrismaClient();
const parsedDir = path.join(repoRoot, 'tmp/wps_11_export_list_raw/parsed');
const sourceRoot = path.join(repoRoot, 'tmp/wps_11_export_list_raw/11-报关记录');
const uploadRoot = path.join(backendPath, 'uploads');
const uploadSalesDir = path.join(uploadRoot, 'sales-contracts');

const EXCLUDED_CATEGORIES = new Set(['purchase_contract']);

function parseArgs(argv) {
  const options = {
    inventoryPath: path.join(parsedDir, 'attachment_inventory.csv'),
    out: path.join(parsedDir, 'wps_export_file_import_plan.json'),
    apply: false,
    highValueOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--inventory') {
      options.inventoryPath = path.resolve(argv[++index]);
    } else if (arg === '--out') {
      options.out = path.resolve(argv[++index]);
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--high-value-only') {
      options.highValueOnly = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/import_wps_export_files.js [options]

Options:
  --inventory <file>       WPS 附件盘点 CSV，默认 attachment_inventory.csv
  --out <file>             输出导入计划 JSON
  --high-value-only        只导入高价值出口文件类别
  --apply                  复制文件并创建 SalesContractFile；不传则只 dry-run
`);
}

function readCsv(filePath) {
  const parsed = Papa.parse(fs.readFileSync(filePath, 'utf8'), {
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

function splitContracts(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw.split(/[;,，、\s]+/).map((item) => item.trim()).filter(Boolean);
}

function fileTypeFromExt(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === '.doc') return 'application/msword';
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === '.xls') return 'application/vnd.ms-excel';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  return 'application/octet-stream';
}

function sha1OfFile(filePath) {
  return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
}

function destinationFor(candidate) {
  const ext = path.extname(candidate.fileName);
  const hash = sha1OfFile(candidate.sourceAbsolutePath).slice(0, 12);
  const safeContractNo = candidate.contractNo.replace(/[^A-Z0-9_-]/gi, '_');
  return {
    relativePath: path.join('sales-contracts', `WPS-${safeContractNo}-${hash}${ext}`),
    absolutePath: path.join(uploadRoot, 'sales-contracts', `WPS-${safeContractNo}-${hash}${ext}`),
    sha1: hash,
  };
}

function isHighValueCategory(category) {
  return new Set([
    'bill_of_lading',
    'customs_declaration',
    'export_tax_refund',
    'input_invoice',
    'output_invoice',
    'packing_list',
    'sales_contract',
    'sales_invoice_packing_bundle',
  ]).has(category);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const salesContracts = await prisma.salesContract.findMany({
    select: { id: true, contractNo: true },
    orderBy: { contractNo: 'asc' },
  });
  const contractByNo = new Map(
    salesContracts.filter((row) => /^EXP/i.test(row.contractNo)).map((row) => [row.contractNo, row])
  );
  const existingFiles = await prisma.salesContractFile.findMany({
    select: {
      fileName: true,
      filePath: true,
      fileSize: true,
      salesContract: { select: { contractNo: true } },
    },
  });
  const existingByPath = new Set(existingFiles.map((file) => file.filePath));
  const existingByContractOriginal = new Set(existingFiles.map((file) => (
    `${file.salesContract.contractNo}\u0000${file.fileName}\u0000${file.fileSize}`
  )));

  const sourceRows = readCsv(options.inventoryPath);
  const candidates = [];
  const skipped = [];
  for (const row of sourceRows) {
    if (EXCLUDED_CATEGORIES.has(row.category)) continue;
    if (options.highValueOnly && !isHighValueCategory(row.category)) continue;

    const sourceAbsolutePath = path.join(sourceRoot, row.relative_path);
    const contracts = splitContracts(row.inferred_contracts).filter((contractNo) => contractByNo.has(contractNo));
    if (contracts.length === 0) {
      skipped.push({ relativePath: row.relative_path, category: row.category, reason: 'no_existing_exp_contract' });
      continue;
    }
    if (!fs.existsSync(sourceAbsolutePath)) {
      skipped.push({ relativePath: row.relative_path, category: row.category, reason: 'source_file_missing' });
      continue;
    }

    const stat = fs.statSync(sourceAbsolutePath);
    for (const contractNo of contracts) {
      candidates.push({
        contractNo,
        salesContractId: contractByNo.get(contractNo).id,
        sourceRelativePath: row.relative_path,
        sourceAbsolutePath,
        fileName: row.file_name,
        fileType: fileTypeFromExt(row.file_name),
        fileSize: stat.size,
        category: row.category,
        contractInference: row.contract_inference,
      });
    }
  }

  const creates = [];
  for (const candidate of candidates) {
    const originalKey = `${candidate.contractNo}\u0000${candidate.fileName}\u0000${candidate.fileSize}`;
    if (existingByContractOriginal.has(originalKey)) {
      skipped.push({ ...candidate, reason: 'db_record_same_contract_original_name_size_exists' });
      continue;
    }
    const dest = destinationFor(candidate);
    if (existingByPath.has(dest.relativePath)) {
      skipped.push({ ...candidate, reason: 'db_record_destination_path_exists', destination: dest.relativePath });
      continue;
    }
    creates.push({
      ...candidate,
      filePath: dest.relativePath,
      destinationAbsolutePath: dest.absolutePath,
      contentSha1Prefix: dest.sha1,
    });
  }

  if (options.apply) {
    fs.mkdirSync(uploadSalesDir, { recursive: true });
    for (const item of creates) {
      if (!fs.existsSync(item.destinationAbsolutePath)) {
        fs.copyFileSync(item.sourceAbsolutePath, item.destinationAbsolutePath);
      }
      const copiedSize = fs.statSync(item.destinationAbsolutePath).size;
      if (copiedSize !== item.fileSize) {
        throw new Error(`复制后文件大小不一致: ${item.filePath}`);
      }
    }
    await prisma.$transaction(creates.map((item) => prisma.salesContractFile.create({
      data: {
        salesContractId: item.salesContractId,
        fileName: item.fileName,
        filePath: item.filePath,
        fileType: item.fileType,
        fileSize: item.fileSize,
      },
    })));
  }

  const plan = {
    dryRun: !options.apply,
    apply: options.apply,
    highValueOnly: options.highValueOnly,
    salesContractFileCreates: creates.length,
    skippedCount: skipped.length,
    totalBytesToCopy: creates.reduce((sum, item) => sum + item.fileSize, 0),
    creates: creates.map(({ salesContractId, sourceAbsolutePath, destinationAbsolutePath, ...item }) => item),
    skipped: skipped.map(({ salesContractId: _salesContractId, sourceAbsolutePath: _sourceAbsolutePath, destinationAbsolutePath: _destinationAbsolutePath, ...item }) => item),
    mode: options.apply ? 'apply' : 'dry-run',
  };
  fs.writeFileSync(options.out, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({
    dryRun: !options.apply,
    salesContractFileCreates: creates.length,
    skippedCount: skipped.length,
    totalBytesToCopy: plan.totalBytesToCopy,
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
