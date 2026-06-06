/**
 * Input: wps_purchase_file_retention_audit.json + backend/prisma/dev.db
 * Output: ContractFile records for existing backend/uploads/contracts orphan files
 * Pos: WPS 采购合同物理孤儿附件恢复脚本；默认 dry-run，只在文件名可推断现有采购合同且物理文件存在时创建附件记录，不改业务字段
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const backendPath = path.join(repoRoot, 'backend');
process.chdir(backendPath);

const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const parsedDir = path.join(repoRoot, 'tmp/wps_11_export_list_raw/parsed');
const uploadRoot = path.join(backendPath, 'uploads');

function parseArgs(argv) {
  const options = {
    auditPath: path.join(parsedDir, 'wps_purchase_file_retention_audit.json'),
    out: path.join(parsedDir, 'wps_purchase_orphan_file_recovery_plan.json'),
    apply: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--audit') {
      options.auditPath = path.resolve(argv[++index]);
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
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/recover_wps_purchase_orphan_files.js [options]

Options:
  --audit <file>  附件留存审计 JSON，默认 wps_purchase_file_retention_audit.json
  --out <file>    输出恢复计划 JSON
  --apply         创建 ContractFile；不传则只 dry-run
`);
}

function fileTypeFromExt(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === '.doc') return 'application/msword';
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === '.xls') return 'application/vnd.ms-excel';
  return 'application/octet-stream';
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const audit = JSON.parse(fs.readFileSync(options.auditPath, 'utf8'));
  const candidates = audit.recoverable_physical_orphans || [];
  const existingFiles = await prisma.contractFile.findMany({
    select: { filePath: true },
  });
  const existingByPath = new Set(existingFiles.map((file) => file.filePath));

  const creates = [];
  const skipped = [];
  for (const candidate of candidates) {
    const relativePath = candidate.relative_path;
    const absolutePath = path.join(uploadRoot, relativePath);
    if (existingByPath.has(relativePath)) {
      skipped.push({ ...candidate, reason: 'db_record_path_exists' });
      continue;
    }
    if (!fs.existsSync(absolutePath)) {
      skipped.push({ ...candidate, reason: 'physical_file_missing' });
      continue;
    }
    const stat = fs.statSync(absolutePath);
    if (stat.size !== candidate.file_size) {
      skipped.push({ ...candidate, reason: 'physical_size_changed', currentSize: stat.size });
      continue;
    }
    creates.push({
      contractNo: candidate.contract_no,
      purchaseContractId: candidate.purchase_contract_id,
      fileName: candidate.file_name,
      filePath: relativePath,
      fileType: candidate.file_type || fileTypeFromExt(candidate.file_name),
      fileSize: candidate.file_size,
      reason: candidate.reason,
    });
  }

  if (options.apply) {
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
    contractFileCreates: creates.length,
    skippedCount: skipped.length,
    creates: creates.map(({ purchaseContractId, ...item }) => item),
    skipped: skipped.map(({ purchase_contract_id: _purchaseContractId, ...item }) => item),
    mode: options.apply ? 'apply' : 'dry-run',
  };
  fs.writeFileSync(options.out, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({
    dryRun: !options.apply,
    contractFileCreates: creates.length,
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
