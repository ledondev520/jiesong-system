/**
 * Input: attachment_inventory.csv + WPS cloud metadata + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/wps_export_file_retention_audit.{json,csv,md}
 * Pos: WPS 出货/报关源文件留存只读审计；对比已保留源文件、EXP 归属和当前销售合同，不写库
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
const outJson = path.join(parsedDir, 'wps_export_file_retention_audit.json');
const outCsv = path.join(parsedDir, 'wps_export_file_retention_audit.csv');
const outMd = path.join(parsedDir, 'wps_export_file_retention_audit.md');

const HIGH_VALUE_EXPORT_CATEGORIES = new Set([
  'sales_invoice_packing_bundle',
  'sales_contract',
  'packing_list',
  'customs_declaration',
  'export_tax_refund',
  'bill_of_lading',
  'output_invoice',
  'input_invoice',
]);

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

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function splitContracts(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw.split(/[;,，、\s]+/).map((item) => item.trim()).filter(Boolean);
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

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function escapeMarkdownCell(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function fileStat(relativePath) {
  const absolutePath = path.join(sourceRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return { exists: false, size: 0 };
  const stat = fs.statSync(absolutePath);
  return { exists: true, size: stat.size };
}

function collectCloudOnly(metadata, scope) {
  const summary = metadata?.summary || {};
  return (summary.cloud_only_files || []).map((row) => ({
    scope,
    cloud_path: row.cloud_path,
    metadata_size: row.metadata_size,
    metadata_sha1: row.metadata_sha1,
  }));
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

function renderMarkdown(report) {
  const lines = [];
  lines.push('# WPS 出货源文件留存审计');
  lines.push('');
  lines.push(`状态：\`${report.status}\``);
  lines.push('');
  lines.push('## 摘要');
  for (const [key, value] of Object.entries(report.summary)) {
    lines.push(`- \`${key}\`: \`${value}\``);
  }
  lines.push('');
  lines.push('## 说明');
  lines.push('- 当前数据库已有出口合同 `SalesContractFile` 附件 Interface；装箱、报关、退税仍通过出口合同附件归档，不另建浅层 Interface。');
  lines.push('- 本审计证明 WPS 源文件是否已经在项目源目录保留、能否归属到现有 EXP 合同，以及是否已有系统附件记录。');
  lines.push('');
  lines.push('## 类别计数');
  lines.push('| 类别 | 文件数 |');
  lines.push('|---|---:|');
  for (const row of report.category_counts) {
    lines.push(`| ${row.key} | ${row.count} |`);
  }
  lines.push('');
  lines.push('## DB 出口合同留存覆盖');
  lines.push('| 合同号 | 保留文件 | 系统附件 | 高价值文件 | 类别 | 样例路径 |');
  lines.push('|---|---:|---:|---:|---|---|');
  for (const row of report.contract_coverage) {
    lines.push(`| ${row.contract_no} | ${row.retained_file_count} | ${row.db_file_count} | ${row.high_value_retained_file_count} | ${escapeMarkdownCell(row.categories || '-')} | ${escapeMarkdownCell(row.sample_paths || '-')} |`);
  }
  lines.push('');
  lines.push('## 未归属到现有 DB 出口合同的保留文件');
  lines.push('| 文件 | 类别 | 推断合同 | 原因 |');
  lines.push('|---|---|---|---|');
  for (const row of report.unmatched_retained_files.slice(0, 80)) {
    lines.push(`| ${row.relative_path} | ${row.category} | ${row.inferred_contracts || '-'} | ${row.reason} |`);
  }
  if (report.unmatched_retained_files.length > 80) {
    lines.push(`| ... | 另有 ${report.unmatched_retained_files.length - 80} 条 |  | 见 CSV/JSON |`);
  }
  lines.push('');
  lines.push('## 附件记录缺物理文件');
  lines.push('| 合同号 | 文件名 | 路径 |');
  lines.push('|---|---|---|');
  for (const row of report.db_records_missing_physical.slice(0, 80)) {
    lines.push(`| ${row.contract_no} | ${row.file_name} | ${row.file_path} |`);
  }
  if (report.db_records_missing_physical.length === 0) {
    lines.push('| - | - | - |');
  } else if (report.db_records_missing_physical.length > 80) {
    lines.push(`| ... | 另有 ${report.db_records_missing_physical.length - 80} 条 |  |`);
  }
  lines.push('');
  lines.push('## WPS 云端仍未缓存正文');
  lines.push('| 范围 | 云端路径 | 大小 | SHA1 |');
  lines.push('|---|---|---:|---|');
  for (const row of report.cloud_only_files) {
    lines.push(`| ${row.scope} | ${row.cloud_path} | ${row.metadata_size} | ${row.metadata_sha1} |`);
  }
  if (report.cloud_only_files.length === 0) {
    lines.push('| - | - | 0 | - |');
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const inventoryRows = readCsv(path.join(parsedDir, 'attachment_inventory.csv')).map((row) => {
    const stat = fileStat(row.relative_path);
    const contracts = splitContracts(row.inferred_contracts);
    return {
      ...row,
      contracts,
      source_exists: stat.exists,
      retained_size: stat.size,
      high_value_export_file: HIGH_VALUE_EXPORT_CATEGORIES.has(row.category),
    };
  });

  const [salesContracts, salesContractFiles, mainCloudMetadata, rootCloudMetadata] = await Promise.all([
    prisma.salesContract.findMany({
      select: { id: true, contractNo: true, note: true },
      orderBy: { contractNo: 'asc' },
    }),
    prisma.salesContractFile.findMany({
      select: {
        id: true,
        fileName: true,
        filePath: true,
        fileType: true,
        fileSize: true,
        salesContract: { select: { contractNo: true } },
      },
      orderBy: { uploadedAt: 'desc' },
    }),
    Promise.resolve(readJsonIfExists(path.join(parsedDir, 'wps_cloud_metadata.json'))),
    Promise.resolve(readJsonIfExists(path.join(parsedDir, 'root_shipment_cloud/wps_cloud_metadata.json'))),
  ]);
  const expSalesContracts = salesContracts.filter((row) => /^EXP/i.test(row.contractNo));
  const nonExpSalesContracts = salesContracts.filter((row) => !/^EXP/i.test(row.contractNo));

  const dbContractSet = new Set(salesContracts.map((row) => row.contractNo));
  const retainedRows = inventoryRows.filter((row) => row.source_exists);
  const exportSideRows = retainedRows.filter((row) => row.category !== 'purchase_contract');
  const linkedRows = exportSideRows.flatMap((row) => row.contracts.map((contractNo) => ({
    ...row,
    contract_no: contractNo,
    contract_exists_in_db: dbContractSet.has(contractNo),
  })));
  const linkedRowsByContract = groupBy(linkedRows, (row) => row.contract_no);
  const dbFilesByContract = groupBy(salesContractFiles, (row) => row.salesContract.contractNo);
  const dbOriginalFileKeys = new Set(salesContractFiles.map((file) => (
    `${file.salesContract.contractNo}\u0000${file.fileName}\u0000${file.fileSize}`
  )));

  const contractCoverage = expSalesContracts.map((contract) => {
    const rows = linkedRowsByContract.get(contract.contractNo) || [];
    const highValueRows = rows.filter((row) => row.high_value_export_file);
    const dbFiles = dbFilesByContract.get(contract.contractNo) || [];
    return {
      contract_no: contract.contractNo,
      sales_contract_id: contract.id,
      retained_file_count: rows.length,
      db_file_count: dbFiles.length,
      high_value_retained_file_count: highValueRows.length,
      categories: uniqueSorted(rows.map((row) => row.category)).join(';'),
      sample_paths: rows.slice(0, 3).map((row) => row.relative_path).join('; '),
      has_wps_source_note: /\[WPS_|WPS/.test(contract.note || ''),
    };
  });

  const unmatchedRetainedFiles = exportSideRows.filter((row) => {
    if (row.contracts.length === 0) return true;
    return !row.contracts.some((contractNo) => dbContractSet.has(contractNo));
  }).map((row) => ({
    relative_path: row.relative_path,
    file_name: row.file_name,
    category: row.category,
    inferred_contracts: row.contracts.join(';'),
    contract_inference: row.contract_inference,
    retained_size: row.retained_size,
    reason: row.contracts.length === 0 ? 'no_exp_contract_inferred' : 'inferred_exp_not_in_db',
  }));

  const cloudOnlyFiles = [
    ...collectCloudOnly(mainCloudMetadata, '11-报关记录'),
    ...collectCloudOnly(rootCloudMetadata, 'root_shipment_cloud'),
  ];
  const mainCloudOnlyFiles = cloudOnlyFiles.filter((row) => row.scope === '11-报关记录');
  const rootShipmentCloudOnlyFiles = cloudOnlyFiles.filter((row) => row.scope === 'root_shipment_cloud');
  const autoAttachCandidates = linkedRows.filter((row) => (
    row.contract_exists_in_db
      && !dbOriginalFileKeys.has(`${row.contract_no}\u0000${row.file_name}\u0000${row.retained_size}`)
  )).map((row) => ({
    contract_no: row.contract_no,
    source_relative_path: row.relative_path,
    file_name: row.file_name,
    file_type: fileTypeFromExt(row.file_name),
    file_size: row.retained_size,
    category: row.category,
    reason: 'missing_sales_contract_file_record',
  }));
  const dbRecordsMissingPhysical = salesContractFiles.filter((file) => {
    const absolutePath = path.isAbsolute(file.filePath)
      ? file.filePath
      : path.join(repoRoot, 'backend/uploads', file.filePath);
    return !fs.existsSync(absolutePath);
  }).map((file) => ({
    contract_no: file.salesContract.contractNo,
    file_name: file.fileName,
    file_path: file.filePath,
  }));

  const report = {
    status: 'export_file_retention_audited',
    generated_at: new Date().toISOString(),
    source_root: sourceRoot,
    no_sales_contract_file_interface: true,
    summary: {
      db_sales_contracts: salesContracts.length,
      db_exp_sales_contracts: expSalesContracts.length,
      non_exp_sales_contract_placeholders: nonExpSalesContracts.length,
      retained_inventory_files: retainedRows.length,
      retained_export_side_files: exportSideRows.length,
      db_exp_contracts_with_any_retained_export_file: contractCoverage.filter((row) => row.retained_file_count > 0).length,
      db_exp_contracts_with_high_value_retained_export_file: contractCoverage.filter((row) => row.high_value_retained_file_count > 0).length,
      db_exp_contracts_without_retained_export_file: contractCoverage.filter((row) => row.retained_file_count === 0).length,
      sales_contract_file_records: salesContractFiles.length,
      db_exp_contracts_with_sales_contract_file_records: contractCoverage.filter((row) => row.db_file_count > 0).length,
      db_exp_contracts_without_sales_contract_file_records: contractCoverage.filter((row) => row.db_file_count === 0).length,
      auto_attach_candidates: autoAttachCandidates.length,
      db_records_missing_physical: dbRecordsMissingPhysical.length,
      unmatched_retained_export_files: unmatchedRetainedFiles.length,
      cloud_only_files: cloudOnlyFiles.length,
      main_directory_cloud_only_files: mainCloudOnlyFiles.length,
      root_shipment_cloud_only_files: rootShipmentCloudOnlyFiles.length,
      sales_contract_attachment_interface: 1,
    },
    category_counts: countBy(exportSideRows, (row) => row.category),
    contract_coverage: contractCoverage,
    non_exp_sales_contract_placeholders: nonExpSalesContracts.map((row) => ({
      contract_no: row.contractNo,
      sales_contract_id: row.id,
    })),
    auto_attach_candidates: autoAttachCandidates,
    db_records_missing_physical: dbRecordsMissingPhysical,
    unmatched_retained_files: unmatchedRetainedFiles,
    cloud_only_files: cloudOnlyFiles,
  };

  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(outCsv, Papa.unparse(contractCoverage, { header: true }));
  fs.writeFileSync(outMd, renderMarkdown(report));

  console.log(JSON.stringify({
    status: report.status,
    summary: report.summary,
    out: {
      json: outJson,
      csv: outCsv,
      md: outMd,
    },
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
