#!/usr/bin/env node
/**
 * Input: 出货汇总.xlsx、backend InvoiceRecord；可选税务数字账户导出的进项发票清单
 * Output: 只读出口退税发票核验 JSON/CSV，控制台仅输出数量摘要与受限文件路径
 * Pos: 出口退税发票核验 CLI Adapter；不写数据库、不改源工作簿
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README。
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const backendPath = path.join(repoRoot, 'backend');
const XLSX = require(path.join(backendPath, 'node_modules/xlsx'));
const dotenv = require(path.join(backendPath, 'node_modules/dotenv'));
const {
  cleanText,
  normalizeInvoiceNumber,
  verifyShipmentInvoices,
} = require(path.join(backendPath, 'src/services/invoiceVerificationService'));

dotenv.config({ path: path.join(backendPath, '.env'), override: false });

const DEFAULT_SOURCE = path.join(os.homedir(), 'Downloads', '出货汇总.xlsx');
const DEFAULT_OUT_DIR = path.join(repoRoot, 'tmp', 'tax-refund-invoice-verification');
const DEFAULT_CONTRACTS = 'EXP260004-EXP260009';
const DEFAULT_SHEET = '出货总清单';
const DEFAULT_BROKER = '捷淞';

function usage() {
  return `
用法:
  node scripts/verify_tax_refund_invoices.js [参数]

参数:
  --source <xlsx>          出货汇总工作簿，默认 ~/Downloads/出货汇总.xlsx
  --sheet <name>           出货工作表，默认 出货总清单
  --contracts <selection>  合同范围/列表，默认 EXP260004-EXP260009
                           示例 EXP260004,EXP260006,EXP260009
  --broker <name>          报关公司精确筛选，默认 捷淞；传 all 不筛选
  --tax-status <blank|all> 默认 blank，仅取“是否报出口退税”为空的行
  --invoice-file <xlsx>    可重复；附加查询税务数字账户导出的进项发票清单
  --out-dir <dir>          受限报告目录，默认 tmp/tax-refund-invoice-verification
  --amount-tolerance <n>   金额容差，默认 0.02 元
  -h, --help               显示帮助

示例:
  npm --prefix backend run invoice:verify -- --source ~/Downloads/出货汇总.xlsx
  npm --prefix backend run invoice:verify -- --invoice-file ~/Downloads/2026年7账期_进项发票列表.xlsx

说明: 该命令只读，不写数据库、不修改源工作簿，也不绕过税务平台验证码。
`;
}

function resolvePath(value) {
  if (!value) throw new Error('路径参数不能为空');
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function parseArgs(argv) {
  const options = {
    source: DEFAULT_SOURCE,
    sheet: DEFAULT_SHEET,
    contracts: DEFAULT_CONTRACTS,
    broker: DEFAULT_BROKER,
    taxStatus: 'blank',
    invoiceFiles: [],
    outDir: DEFAULT_OUT_DIR,
    amountTolerance: 0.02,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value == null || value.startsWith('--')) throw new Error(`${arg} 缺少参数值`);
      index += 1;
      return value;
    };
    if (arg === '--source') options.source = resolvePath(next());
    else if (arg === '--sheet') options.sheet = next();
    else if (arg === '--contracts') options.contracts = next();
    else if (arg === '--broker') options.broker = next();
    else if (arg === '--tax-status') options.taxStatus = next();
    else if (arg === '--invoice-file') options.invoiceFiles.push(resolvePath(next()));
    else if (arg === '--out-dir') options.outDir = resolvePath(next());
    else if (arg === '--amount-tolerance') options.amountTolerance = Number(next());
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知参数: ${arg}`);
  }
  if (!['blank', 'all'].includes(options.taxStatus)) {
    throw new Error('--tax-status 只支持 blank 或 all');
  }
  if (!Number.isFinite(options.amountTolerance) || options.amountTolerance < 0) {
    throw new Error('--amount-tolerance 必须是非负数');
  }
  return options;
}

function expandContracts(selection) {
  const result = new Set();
  for (const rawPart of String(selection || '').split(',')) {
    const part = rawPart.trim().toUpperCase();
    if (!part) continue;
    const range = part.match(/^([A-Z]+)(\d+)-([A-Z]+)(\d+)$/);
    if (range) {
      const [, leftPrefix, leftDigits, rightPrefix, rightDigits] = range;
      if (leftPrefix !== rightPrefix || leftDigits.length !== rightDigits.length) {
        throw new Error(`合同范围格式不一致: ${part}`);
      }
      const start = Number(leftDigits);
      const end = Number(rightDigits);
      if (end < start || end - start > 500) throw new Error(`合同范围无效或过大: ${part}`);
      for (let value = start; value <= end; value += 1) {
        result.add(`${leftPrefix}${String(value).padStart(leftDigits.length, '0')}`);
      }
      continue;
    }
    if (!/^[A-Z]+\d+$/.test(part)) throw new Error(`无法识别合同号: ${part}`);
    result.add(part);
  }
  if (result.size === 0) throw new Error('合同范围不能为空');
  return result;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function numericCell(value) {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).replace(/[,，¥￥]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function readShipmentRows(options) {
  if (!fs.existsSync(options.source)) throw new Error(`出货汇总不存在: ${options.source}`);
  const workbook = XLSX.readFile(options.source, { cellDates: true, raw: true });
  const sheet = workbook.Sheets[options.sheet];
  if (!sheet) throw new Error(`源文件缺少工作表: ${options.sheet}`);
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const headers = (matrix[0] || []).map(cleanText);
  const indexes = new Map(headers.map((header, index) => [header, index]).filter(([header]) => header));
  const required = ['报关名', '厂家', '合同号', '报关公司', '采购金额', '发票号码', '是否报出口退税'];
  for (const header of required) {
    if (!indexes.has(header)) throw new Error(`出货汇总缺少必需列: ${header}`);
  }
  const contracts = expandContracts(options.contracts);
  const value = (row, header) => row[indexes.get(header)];
  const rows = [];
  for (let index = 1; index < matrix.length; index += 1) {
    const row = matrix[index];
    const contractNo = String(cleanText(value(row, '合同号')) || '').toUpperCase();
    if (!contracts.has(contractNo)) continue;
    const broker = cleanText(value(row, '报关公司'));
    if (options.broker !== 'all' && broker !== options.broker) continue;
    const taxStatus = cleanText(value(row, '是否报出口退税'));
    if (options.taxStatus === 'blank' && taxStatus) continue;
    rows.push({
      sourceRow: index + 1,
      contractNo,
      invoiceNo: normalizeInvoiceNumber(value(row, '发票号码')) || null,
      expectedSeller: cleanText(value(row, '厂家')),
      itemName: cleanText(value(row, '报关名')),
      supplement: cleanText(value(row, '商品补充信息')),
      expectedTotal: numericCell(value(row, '采购金额')),
      store: cleanText(value(row, '门店')),
      purchaseContractNo: cleanText(value(row, '购销合同号')),
      broker,
      taxStatus,
    });
  }
  if (rows.length === 0) throw new Error('按当前合同、报关公司和退税状态筛选后没有候选行');
  return { rows, sourceSha256: sha256(options.source) };
}

async function loadDatabaseRecords(invoiceNumbers) {
  // 财务核验 CLI 不输出 SQL 形状；只保留 Prisma 错误日志。
  if (process.env.NODE_ENV === 'development') process.env.NODE_ENV = 'invoice-verification';
  const { findByExactNumbers } = require(path.join(backendPath, 'src/services/invoiceRecordService'));
  const records = await findByExactNumbers(invoiceNumbers);
  return records.map((record) => ({
    ...record,
    lookupSource: 'database',
    lookupDetail: record.batch?.fileName || null,
  }));
}

function loadInvoiceFileRecords(invoiceFiles) {
  if (invoiceFiles.length === 0) return { records: [], files: [] };
  const { parseInvoices } = require(path.join(backendPath, 'src/services/financeImportService'));
  const records = [];
  const files = [];
  for (const filePath of invoiceFiles) {
    if (!fs.existsSync(filePath)) throw new Error(`发票清单不存在: ${filePath}`);
    const parsed = parseInvoices(fs.readFileSync(filePath), 'input');
    if (parsed.records.length === 0) {
      throw new Error(`发票清单未解析出进项发票: ${filePath}`);
    }
    const detail = path.basename(filePath);
    records.push(...parsed.records.map((record) => ({
      ...record,
      lookupSource: 'invoice_file',
      lookupDetail: detail,
    })));
    files.push({
      path: filePath,
      sha256: sha256(filePath),
      parsedRecords: parsed.records.length,
      parseErrors: parsed.errors.length,
    });
  }
  return { records, files };
}

function toCsvValue(value) {
  if (value == null) return '';
  const text = Array.isArray(value) ? value.join('；') : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function reportRows(results) {
  return results.map((result) => ({
    核验结论: result.status,
    源表行号: result.sourceRows.join('、'),
    合同号: result.contracts.join('、'),
    发票号码: result.invoiceNo,
    号码格式: result.invoiceNumberValid ? '正常' : '异常',
    预期销方: result.expectedSellers.join('；'),
    实际销方: result.actualSeller,
    销方税号: result.actualSellerTaxId,
    预期品名: result.expectedItems.join('；'),
    实际品名: result.actualItems,
    商品补充信息: result.expectedSupplements.join('；'),
    实际规格: result.actualSpec,
    预期价税合计: result.expectedTotal,
    实际价税合计: result.actualTotal,
    不含税金额: result.actualAmountExTax,
    税额: result.actualTax,
    开票日期: result.actualDate,
    发票状态: result.actualStatus,
    是否正数: result.actualIsPositive,
    销方一致: result.checks.seller == null ? null : (result.checks.seller ? '是' : '否'),
    金额一致: result.checks.total == null ? null : (result.checks.total ? '是' : '否'),
    品名一致: result.checks.item == null ? null : (result.checks.item ? '是' : '否'),
    查询来源: result.lookupSources.join('；'),
    问题: result.issues.join('；'),
  }));
}

function writeRestrictedReports(options, report) {
  fs.mkdirSync(options.outDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(options.outDir, 0o700);
  const rows = reportRows(report.results);
  const headers = Object.keys(rows[0] || {});
  const csv = [
    headers.map(toCsvValue).join(','),
    ...rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(',')),
  ].join('\n');
  const jsonPath = path.join(options.outDir, '出口退税发票核验.json');
  const csvPath = path.join(options.outDir, '出口退税发票核验.csv');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(csvPath, `\uFEFF${csv}\n`, { mode: 0o600 });
  fs.chmodSync(jsonPath, 0o600);
  fs.chmodSync(csvPath, 0o600);
  return { jsonPath, csvPath };
}

async function disconnectPrisma() {
  try {
    const prisma = require(path.join(backendPath, 'src/utils/prisma'));
    await prisma.$disconnect();
  } catch (_) {
    // 未加载数据库时无需断开。
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const shipment = readShipmentRows(options);
  const invoiceNumbers = [...new Set(shipment.rows.map((row) => row.invoiceNo).filter(Boolean))];
  const [databaseRecords, invoiceFiles] = await Promise.all([
    loadDatabaseRecords(invoiceNumbers),
    Promise.resolve(loadInvoiceFileRecords(options.invoiceFiles)),
  ]);
  const verified = verifyShipmentInvoices({
    shipmentRows: shipment.rows,
    invoiceRecords: [...databaseRecords, ...invoiceFiles.records],
    amountTolerance: options.amountTolerance,
  });
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    criteria: {
      contracts: [...expandContracts(options.contracts)],
      broker: options.broker,
      taxStatus: options.taxStatus,
      amountTolerance: options.amountTolerance,
    },
    sources: {
      shipmentWorkbook: { path: options.source, sha256: shipment.sourceSha256, sheet: options.sheet },
      database: { matchedRows: databaseRecords.length },
      invoiceFiles: invoiceFiles.files,
    },
    summary: verified.summary,
    results: verified.results,
  };
  const outputs = writeRestrictedReports(options, report);
  console.log(JSON.stringify({ mode: report.mode, summary: report.summary, outputs }, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`核验失败: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(disconnectPrisma);
}

module.exports = {
  expandContracts,
  parseArgs,
  readShipmentRows,
  reportRows,
};
