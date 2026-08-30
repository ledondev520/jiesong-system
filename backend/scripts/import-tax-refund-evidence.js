#!/usr/bin/env node
/**
 * Input: 电子税务局下载目录，可选 --confirm
 * Output: 出口/进货明细与受理通知书的交叉校验摘要，或脱敏结构化证据的幂等入库计数
 * Pos: 出口退税历史申报证据导入 Adapter；不复制原文件、不输出逐行财务数据
 */

const fs = require('fs');
const path = require('path');
const prisma = require('../src/utils/prisma');
const {
  classifyFinancialEvidenceFile,
  parseFinancialEvidenceSource,
  parseFinancialEvidencePdfSource,
  importFinancialEvidenceDocuments,
} = require('../src/services/financialEvidenceService');

const EVIDENCE_CATEGORIES = new Set([
  'TAX_REFUND_EXPORT_DETAIL',
  'TAX_REFUND_PURCHASE_DETAIL',
  'TAX_REFUND_ACCEPTANCE_NOTICE',
]);

function findEvidencePaths(rootDir, includeNames = null) {
  const entries = includeNames
    ? includeNames.map((name) => ({ name: path.basename(name), isFile: () => true }))
    : fs.readdirSync(rootDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(rootDir, entry.name))
    .filter((filePath) => {
      const fileName = path.basename(filePath);
      if (!fs.existsSync(filePath)) throw new Error('清单中的来源文件不存在');
      const classification = classifyFinancialEvidenceFile(fileName);
      return EVIDENCE_CATEGORIES.has(classification.category);
    })
    .sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

async function prepareDocuments(rootDir, includeNames = null) {
  const files = findEvidencePaths(rootDir, includeNames);
  const documents = [];
  for (const absolutePath of files) {
    const fileName = path.basename(absolutePath);
    const buffer = fs.readFileSync(absolutePath);
    const relativePath = path.relative(rootDir, absolutePath);
    documents.push(fileName.toLowerCase().endsWith('.pdf')
      ? await parseFinancialEvidencePdfSource({ buffer, fileName, relativePath })
      : parseFinancialEvidenceSource({ buffer, fileName, relativePath }));
  }
  return { files, documents };
}

function parseDocumentTable(document) {
  const rows = document.sheets.flatMap((sheet) => sheet.rows)
    .sort((left, right) => left.sourceRow - right.sourceRow)
    .map((row) => JSON.parse(row.valuesJson));
  if (rows.length < 2) throw new Error(`${document.category}: 没有明细数据行`);
  const headers = rows[0].map((value) => String(value || '').trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]])));
}

function cents(value) {
  const number = Number(String(value ?? '').replace(/,/g, ''));
  if (!Number.isFinite(number)) throw new Error('退税明细存在非数值金额');
  return Math.round(number * 100);
}

function detailKey(row) {
  return [row['申报年月'], row['申报批次'], row['关联号']].map((value) => String(value || '').trim()).join('|');
}

function batchKey(row) {
  return [row['申报年月'], row['申报批次']].map((value) => String(value || '').trim()).join('|');
}

function parseNotice(document) {
  const text = document.sheets
    .flatMap((sheet) => sheet.rows)
    .flatMap((row) => JSON.parse(row.valuesJson))
    .join(' ');
  const month = text.match(/申报\s*年月\s*[:：]?\s*(20\d{4})/)?.[1];
  const batch = text.match(/申报\s*批次\s*[:：]?\s*(\d{3})/)?.[1];
  const amount = text.match(/申报\s*退税额\s*[:：]?\s*([\d,.]+)/)?.[1];
  if (!month || !batch || !amount) throw new Error('受理通知书缺少申报年月、批次或退税额');
  return { batchKey: `${month}|${batch}`, amountCents: cents(amount) };
}

function validateTaxRefundEvidence(documents) {
  const categoryCounts = documents.reduce((counts, document) => {
    counts[document.category] = (counts[document.category] || 0) + 1;
    return counts;
  }, {});
  for (const category of ['TAX_REFUND_EXPORT_DETAIL', 'TAX_REFUND_PURCHASE_DETAIL']) {
    if (!categoryCounts[category]) throw new Error(`${category}: 缺少申报明细来源`);
  }

  const exportRows = documents
    .filter((document) => document.category === 'TAX_REFUND_EXPORT_DETAIL')
    .flatMap(parseDocumentTable);
  const purchaseRows = documents
    .filter((document) => document.category === 'TAX_REFUND_PURCHASE_DETAIL')
    .flatMap(parseDocumentTable);
  const exportByKey = new Map(exportRows.map((row) => [detailKey(row), row]));
  const purchaseByKey = new Map(purchaseRows.map((row) => [detailKey(row), row]));
  if (exportByKey.size !== exportRows.length || purchaseByKey.size !== purchaseRows.length) {
    throw new Error('出口或进货明细存在重复关联号');
  }
  if (exportByKey.size !== purchaseByKey.size) throw new Error('出口明细与进货明细行数不一致');

  for (const [key, exportRow] of exportByKey) {
    const purchaseRow = purchaseByKey.get(key);
    if (!purchaseRow) throw new Error('出口明细存在无法匹配的进货关联号');
    if (String(exportRow['关联号'] || '') !== String(purchaseRow['关联号'] || '')) {
      throw new Error('出口明细与进货明细关联号不一致');
    }
    if (cents(exportRow['退税额']) !== cents(purchaseRow['可退税额'])) {
      throw new Error('出口退税额与进货可退税额不一致');
    }
  }

  const batchAmounts = new Map();
  for (const row of exportRows) {
    const key = batchKey(row);
    batchAmounts.set(key, (batchAmounts.get(key) || 0) + cents(row['退税额']));
  }
  const notices = documents
    .filter((document) => document.category === 'TAX_REFUND_ACCEPTANCE_NOTICE')
    .map(parseNotice);
  const noticeByBatch = new Map(notices.map((notice) => [notice.batchKey, notice]));
  if (noticeByBatch.size !== notices.length) throw new Error('受理通知书存在重复申报年月和批次');
  for (const [key, notice] of noticeByBatch) {
    if (!batchAmounts.has(key)) throw new Error('受理通知书存在无对应申报明细的批次');
    if (batchAmounts.get(key) !== notice.amountCents) {
      throw new Error('受理通知书退税额与申报明细批次合计不一致');
    }
  }
  const missingNoticeBatches = [...batchAmounts]
    .filter(([key]) => !noticeByBatch.has(key));

  const periods = [...new Set(exportRows.map((row) => String(row['申报年月'])))].sort();
  return {
    documentCount: documents.length,
    categoryCounts,
    exportRows: exportRows.length,
    purchaseRows: purchaseRows.length,
    declarationBatches: batchAmounts.size,
    acceptanceNotices: notices.length,
    missingAcceptanceNotices: missingNoticeBatches.length,
    missingNoticeRefundAmount: missingNoticeBatches.reduce((sum, [, value]) => sum + value, 0) / 100,
    totalRefundAmount: [...batchAmounts.values()].reduce((sum, value) => sum + value, 0) / 100,
    firstDeclarationMonth: periods[0],
    lastDeclarationMonth: periods.at(-1),
    redactions: documents.reduce((sum, document) => sum + document.redactionCount, 0),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const rootArg = args[0];
  const manifestIndex = args.indexOf('--manifest');
  if (!rootArg || rootArg.startsWith('--')) {
    throw new Error('用法: node scripts/import-tax-refund-evidence.js <下载目录> [--manifest <文件清单>] [--confirm]');
  }
  const rootDir = path.resolve(rootArg);
  if (!fs.statSync(rootDir).isDirectory()) throw new Error('输入路径不是目录');
  let includeNames = null;
  if (manifestIndex >= 0) {
    const manifestPath = args[manifestIndex + 1];
    if (!manifestPath || manifestPath.startsWith('--')) throw new Error('--manifest 缺少文件路径');
    includeNames = fs.readFileSync(path.resolve(manifestPath), 'utf8')
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  const { documents } = await prepareDocuments(rootDir, includeNames);
  const validation = validateTaxRefundEvidence(documents);
  console.log(JSON.stringify({ mode: confirm ? 'confirm' : 'dry-run', ...validation }, null, 2));
  if (!confirm) return;
  const result = await importFinancialEvidenceDocuments(documents);
  console.log(JSON.stringify({ imported: result.imported, replaced: result.replaced, skipped: result.skipped }, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`[tax-refund-evidence-import] ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

module.exports = {
  EVIDENCE_CATEGORIES,
  findEvidencePaths,
  prepareDocuments,
  parseDocumentTable,
  parseNotice,
  validateTaxRefundEvidence,
};
