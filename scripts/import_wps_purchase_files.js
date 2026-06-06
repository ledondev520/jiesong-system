/**
 * Input: wps_purchase_file_retention_audit.json + backend/prisma/dev.db
 * Output: optional deterministic file copies under backend/uploads/contracts + ContractFile records
 * Pos: WPS 采购合同附件导入脚本；默认 dry-run，显式 --apply 后才复制文件并创建附件记录，不改采购业务字段
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

const prisma = new PrismaClient();
const parsedDir = path.join(repoRoot, 'tmp/wps_11_export_list_raw/parsed');
const uploadRoot = path.join(backendPath, 'uploads');
const uploadContractsDir = path.join(uploadRoot, 'contracts');

function parseArgs(argv) {
  const options = {
    auditPath: path.join(parsedDir, 'wps_purchase_file_retention_audit.json'),
    out: path.join(parsedDir, 'wps_purchase_file_import_plan.json'),
    apply: false,
    onlyNoFileContracts: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--audit') {
      options.auditPath = path.resolve(argv[++index]);
    } else if (arg === '--out') {
      options.out = path.resolve(argv[++index]);
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--only-no-file-contracts') {
      options.onlyNoFileContracts = true;
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
  node scripts/import_wps_purchase_files.js [options]

Options:
  --audit <file>                 附件留存审计 JSON，默认 wps_purchase_file_retention_audit.json
  --out <file>                   输出导入计划 JSON
  --only-no-file-contracts       只处理完全没有附件记录的合同
  --apply                        复制文件并创建 ContractFile；不传则只 dry-run
`);
}

function sha1OfFile(filePath) {
  return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
}

function destinationFor(candidate) {
  const ext = path.extname(candidate.file_name);
  const hash = sha1OfFile(candidate.source_absolute_path).slice(0, 12);
  const safeContractNo = candidate.contract_no.replace(/[^A-Z0-9_-]/gi, '_');
  return {
    relativePath: path.join('contracts', `WPS-${safeContractNo}-${hash}${ext}`),
    absolutePath: path.join(uploadRoot, 'contracts', `WPS-${safeContractNo}-${hash}${ext}`),
    sha1: hash,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const audit = JSON.parse(fs.readFileSync(options.auditPath, 'utf8'));
  const candidates = audit.candidates.filter((candidate) => (
    !options.onlyNoFileContracts || candidate.reason === 'contract_has_no_file_record'
  ));
  const existingFiles = await prisma.contractFile.findMany({
    select: {
      fileName: true,
      filePath: true,
      fileSize: true,
      purchaseContractId: true,
      purchaseContract: { select: { contractNo: true } },
    },
  });
  const existingByPath = new Set(existingFiles.map((file) => file.filePath));
  const existingByContractOriginal = new Set(existingFiles.map((file) => (
    `${file.purchaseContract.contractNo}\u0000${file.fileName}\u0000${file.fileSize}`
  )));

  const creates = [];
  const skipped = [];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.source_absolute_path)) {
      skipped.push({ ...candidate, reason: 'source_file_missing' });
      continue;
    }
    const stat = fs.statSync(candidate.source_absolute_path);
    if (stat.size !== candidate.file_size) {
      skipped.push({ ...candidate, reason: 'source_size_changed', currentSize: stat.size });
      continue;
    }
    const originalKey = `${candidate.contract_no}\u0000${candidate.file_name}\u0000${candidate.file_size}`;
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
      contractNo: candidate.contract_no,
      purchaseContractId: candidate.purchase_contract_id,
      fileName: candidate.file_name,
      filePath: dest.relativePath,
      fileType: candidate.file_type,
      fileSize: candidate.file_size,
      sourceAbsolutePath: candidate.source_absolute_path,
      sourceRelativePath: candidate.source_relative_path,
      destinationAbsolutePath: dest.absolutePath,
      contentSha1Prefix: dest.sha1,
      reason: candidate.reason,
    });
  }

  if (options.apply) {
    fs.mkdirSync(uploadContractsDir, { recursive: true });
    for (const item of creates) {
      if (!fs.existsSync(item.destinationAbsolutePath)) {
        fs.copyFileSync(item.sourceAbsolutePath, item.destinationAbsolutePath);
      }
      const copiedSize = fs.statSync(item.destinationAbsolutePath).size;
      if (copiedSize !== item.fileSize) {
        throw new Error(`复制后文件大小不一致: ${item.filePath}`);
      }
    }
    await prisma.$transaction(creates.map((item) => prisma.contractFile.create({
      data: {
        purchaseContractId: item.purchaseContractId,
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
    onlyNoFileContracts: options.onlyNoFileContracts,
    contractFileCreates: creates.length,
    skippedCount: skipped.length,
    totalBytesToCopy: creates.reduce((sum, item) => sum + item.fileSize, 0),
    creates: creates.map(({ purchaseContractId, sourceAbsolutePath, destinationAbsolutePath, ...item }) => item),
    skipped: skipped.map(({ purchase_contract_id: _purchaseContractId, source_absolute_path: _sourceAbsolutePath, ...item }) => item),
    mode: options.apply ? 'apply' : 'dry-run',
  };
  fs.writeFileSync(options.out, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({
    dryRun: !options.apply,
    contractFileCreates: creates.length,
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
