/**
 * Input: purchase_evidence_preferred.csv + backend/prisma/dev.db + backend/uploads/contracts
 * Output: tmp/wps_11_export_list_raw/parsed/wps_purchase_file_retention_audit.{json,csv,md}
 * Pos: WPS 采购合同文件留存只读审计；对比 WPS 已保留凭证、系统附件表和物理上传文件，不写库
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
const parsedDir = path.join(repoRoot, 'tmp/wps_11_export_list_raw/parsed');
const sourceRoot = path.join(repoRoot, 'tmp/wps_11_export_list_raw/11-报关记录');
const uploadRoot = path.join(backendPath, 'uploads');
const uploadContractsDir = path.join(uploadRoot, 'contracts');
const outJson = path.join(parsedDir, 'wps_purchase_file_retention_audit.json');
const outCsv = path.join(parsedDir, 'wps_purchase_file_retention_audit.csv');
const outMd = path.join(parsedDir, 'wps_purchase_file_retention_audit.md');

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

function fileTypeFromExt(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === '.doc') return 'application/msword';
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === '.xls') return 'application/vnd.ms-excel';
  return 'application/octet-stream';
}

function extractContractNo(value) {
  const match = String(value || '').match(/CG\d{7,8}/i);
  return match ? match[0].toUpperCase().replace(/^CG0+(\d{6,})$/, 'CG$1') : '';
}

function zeroDeletionCandidates(contractNo) {
  const match = String(contractNo || '').match(/^CG(\d+)$/);
  if (!match) return [];
  const digits = match[1];
  const out = new Set();
  for (let index = 0; index < digits.length; index += 1) {
    if (digits[index] === '0') {
      out.add(`CG${digits.slice(0, index)}${digits.slice(index + 1)}`);
    }
  }
  return [...out];
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  }
  return out.sort((left, right) => left.localeCompare(right));
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row) || '(empty)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function countBy(rows, keyFn) {
  return [...groupBy(rows, keyFn).entries()]
    .map(([key, values]) => ({ key, count: values.length }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# WPS 采购合同文件留存审计');
  lines.push('');
  lines.push(`状态：\`${report.status}\``);
  lines.push('');
  lines.push('## 摘要');
  for (const [key, value] of Object.entries(report.summary)) {
    lines.push(`- \`${key}\`: \`${value}\``);
  }
  lines.push('');
  lines.push('## 可自动补附件记录候选');
  lines.push('| 合同号 | WPS 文件 | 大小 | 类型 | 原因 |');
  lines.push('|---|---|---:|---|---|');
  for (const row of report.candidates.slice(0, 80)) {
    lines.push(`| ${row.contract_no} | ${row.file_name} | ${row.file_size} | ${row.file_type} | ${row.reason} |`);
  }
  if (report.candidates.length > 80) lines.push(`| ... | 另有 ${report.candidates.length - 80} 条 |  |  | 见 CSV/JSON |`);
  lines.push('');
  lines.push('## 物理孤儿文件');
  lines.push('| 文件 | 推断合同号 | 大小 |');
  lines.push('|---|---|---:|');
  for (const row of report.physical_orphans.slice(0, 80)) {
    lines.push(`| ${row.relative_path} | ${row.inferred_contract_no || '-'} | ${row.file_size} |`);
  }
  if (report.physical_orphans.length > 80) lines.push(`| ... | 另有 ${report.physical_orphans.length - 80} 条 |  |`);
  lines.push('');
  lines.push('## 附件记录缺物理文件');
  lines.push('| 合同号 | 文件名 | 路径 |');
  lines.push('|---|---|---|');
  for (const row of report.db_records_missing_physical.slice(0, 80)) {
    lines.push(`| ${row.contract_no} | ${row.file_name} | ${row.file_path} |`);
  }
  if (report.db_records_missing_physical.length > 80) lines.push(`| ... | 另有 ${report.db_records_missing_physical.length - 80} 条 |  |`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const preferredRows = readCsv(path.join(parsedDir, 'purchase_evidence_preferred.csv'))
    .filter((row) => row.purchase_contract_no && row.db_contract_exists === '1');
  const [purchaseContracts, contractFiles] = await Promise.all([
    prisma.purchaseContract.findMany({
      select: { id: true, contractNo: true },
      orderBy: { contractNo: 'asc' },
    }),
    prisma.contractFile.findMany({
      select: {
        id: true,
        fileName: true,
        filePath: true,
        fileType: true,
        fileSize: true,
        purchaseContract: { select: { contractNo: true } },
      },
      orderBy: { uploadedAt: 'desc' },
    }),
  ]);

  const contractByNo = new Map(purchaseContracts.map((row) => [row.contractNo, row]));
  const dbFilesByContract = groupBy(contractFiles, (row) => row.purchaseContract.contractNo);
  const dbFilePathSet = new Set(contractFiles.map((row) => row.filePath));
  const physicalFiles = walkFiles(uploadContractsDir).map((filePath) => {
    const stat = fs.statSync(filePath);
    const relativeToUpload = path.relative(uploadRoot, filePath);
    const relativeToContracts = path.relative(uploadContractsDir, filePath);
    return {
      absolute_path: filePath,
      relative_path: relativeToUpload,
      contracts_relative_path: relativeToContracts,
      file_name: path.basename(filePath),
      inferred_contract_no: extractContractNo(path.basename(filePath)),
      file_size: stat.size,
      file_type: fileTypeFromExt(filePath),
    };
  });

  const candidates = [];
  const preferredDetails = [];
  for (const row of preferredRows) {
    const contractNo = row.purchase_contract_no;
    const sourcePath = path.join(sourceRoot, row.relative_path);
    const sourceExists = fs.existsSync(sourcePath);
    const stat = sourceExists ? fs.statSync(sourcePath) : null;
    const fileName = path.basename(row.relative_path);
    const existingFiles = dbFilesByContract.get(contractNo) || [];
    const hasSameOriginalName = existingFiles.some((file) => file.fileName === fileName);
    const hasAnyFile = existingFiles.length > 0;
    const detail = {
      contract_no: contractNo,
      source_relative_path: row.relative_path,
      file_name: fileName,
      suffix: row.suffix,
      readiness: row.readiness,
      source_exists: sourceExists,
      source_size: stat?.size || 0,
      db_file_count: existingFiles.length,
      has_same_original_name: hasSameOriginalName,
      has_any_contract_file: hasAnyFile,
    };
    preferredDetails.push(detail);
    if (sourceExists && !hasSameOriginalName && contractByNo.has(contractNo)) {
      candidates.push({
        contract_no: contractNo,
        purchase_contract_id: contractByNo.get(contractNo).id,
        source_relative_path: row.relative_path,
        source_absolute_path: sourcePath,
        file_name: fileName,
        file_type: fileTypeFromExt(fileName),
        file_size: stat.size,
        existing_contract_file_count: existingFiles.length,
        reason: hasAnyFile ? 'contract_has_files_but_not_this_wps_source' : 'contract_has_no_file_record',
      });
    }
  }

  const physicalOrphans = physicalFiles.filter((file) => !dbFilePathSet.has(file.relative_path));
  const preferredSourceByContract = groupBy(preferredDetails, (row) => row.contract_no);
  const directRecoverablePhysicalOrphans = physicalOrphans.filter((file) => (
    file.inferred_contract_no && contractByNo.has(file.inferred_contract_no)
  )).map((file) => ({
    ...file,
    contract_no: file.inferred_contract_no,
    purchase_contract_id: contractByNo.get(file.inferred_contract_no).id,
    reason: 'physical_upload_file_missing_contract_file_record',
  }));
  const typoRecoverablePhysicalOrphans = physicalOrphans.filter((file) => (
    file.inferred_contract_no && !contractByNo.has(file.inferred_contract_no)
  )).map((file) => {
    const matches = zeroDeletionCandidates(file.inferred_contract_no)
      .filter((contractNo) => contractByNo.has(contractNo) && preferredSourceByContract.has(contractNo));
    if (matches.length !== 1) return null;
    const contractNo = matches[0];
    return {
      ...file,
      contract_no: contractNo,
      original_inferred_contract_no: file.inferred_contract_no,
      purchase_contract_id: contractByNo.get(contractNo).id,
      reason: 'filename_extra_zero_matches_existing_contract',
      matched_preferred_sources: preferredSourceByContract.get(contractNo).map((row) => row.source_relative_path),
    };
  }).filter(Boolean);
  const recoverablePhysicalOrphans = [
    ...directRecoverablePhysicalOrphans,
    ...typoRecoverablePhysicalOrphans,
  ];
  const unrecoverablePhysicalOrphans = physicalOrphans.filter((file) => (
    !recoverablePhysicalOrphans.some((recoverable) => recoverable.relative_path === file.relative_path)
  )).map((file) => ({
    ...file,
    reason: file.inferred_contract_no ? 'inferred_contract_not_in_db' : 'cannot_infer_contract_no',
  }));
  const dbRecordsMissingPhysical = contractFiles.filter((file) => {
    const absolutePath = path.isAbsolute(file.filePath)
      ? file.filePath
      : path.join(uploadRoot, file.filePath);
    return !fs.existsSync(absolutePath);
  }).map((file) => ({
    contract_no: file.purchaseContract.contractNo,
    file_name: file.fileName,
    file_path: file.filePath,
    file_type: file.fileType,
    file_size: file.fileSize,
  }));

  const report = {
    status: 'purchase_file_retention_audited',
    summary: {
      purchase_contracts_in_db: purchaseContracts.filter((row) => row.contractNo.startsWith('CG')).length,
      preferred_wps_purchase_sources: preferredRows.length,
      preferred_wps_sources_existing_on_disk: preferredDetails.filter((row) => row.source_exists).length,
      contract_file_records: contractFiles.length,
      contracts_with_file_records: dbFilesByContract.size,
      physical_upload_files: physicalFiles.length,
      physical_upload_orphans: physicalOrphans.length,
      recoverable_physical_orphans: recoverablePhysicalOrphans.length,
      direct_recoverable_physical_orphans: directRecoverablePhysicalOrphans.length,
      typo_recoverable_physical_orphans: typoRecoverablePhysicalOrphans.length,
      unrecoverable_physical_orphans: unrecoverablePhysicalOrphans.length,
      db_records_missing_physical: dbRecordsMissingPhysical.length,
      auto_attach_candidates: candidates.length,
      candidates_for_contracts_without_any_file: candidates.filter((row) => row.reason === 'contract_has_no_file_record').length,
      candidates_for_contracts_missing_this_wps_source: candidates.filter((row) => row.reason === 'contract_has_files_but_not_this_wps_source').length,
    },
    candidates_by_reason: countBy(candidates, (row) => row.reason),
    preferred_details: preferredDetails,
    candidates,
    physical_orphans: physicalOrphans,
    recoverable_physical_orphans: recoverablePhysicalOrphans,
    unrecoverable_physical_orphans: unrecoverablePhysicalOrphans,
    db_records_missing_physical: dbRecordsMissingPhysical,
  };

  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(outCsv, Papa.unparse(candidates, { newline: '\n' }));
  fs.writeFileSync(outMd, renderMarkdown(report));
  console.log(JSON.stringify({
    status: report.status,
    summary: report.summary,
    out: { json: outJson, csv: outCsv, md: outMd },
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
