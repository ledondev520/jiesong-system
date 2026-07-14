#!/usr/bin/env node
/**
 * Input: 已解压财务资料目录，可选 --confirm
 * Output: 只读预检摘要，或脱敏结构化资料的幂等导入计数
 * Pos: 财务资料库本地导入 Adapter；不复制原文件、不输出工作簿行值或文件名
 */

const fs = require('fs');
const path = require('path');
const prisma = require('../src/utils/prisma');
const {
  classifyFinancialEvidenceFile,
  parseFinancialEvidenceSource,
  importFinancialEvidenceDocuments,
} = require('../src/services/financialEvidenceService');

function findWorkbookPaths(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) return findWorkbookPaths(absolutePath);
    return /\.xls(x)?$/i.test(entry.name) ? [absolutePath] : [];
  }).sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function prepareDocuments(rootDir) {
  const workbooks = findWorkbookPaths(rootDir);
  const ignored = { handledElsewhere: 0, unsupported: 0 };
  const documents = [];
  for (const absolutePath of workbooks) {
    const fileName = path.basename(absolutePath);
    const classification = classifyFinancialEvidenceFile(fileName);
    if (!classification.eligible) {
      if (classification.handledElsewhere) ignored.handledElsewhere += 1;
      else ignored.unsupported += 1;
      continue;
    }
    documents.push(parseFinancialEvidenceSource({
      buffer: fs.readFileSync(absolutePath),
      fileName,
      relativePath: path.relative(rootDir, absolutePath),
    }));
  }
  return { workbooks, documents, ignored };
}

function summarize(documents, workbookCount, ignored) {
  const categories = {};
  for (const document of documents) {
    const current = categories[document.category] || { documents: 0, sheets: 0, rows: 0, redactions: 0 };
    current.documents += 1;
    current.sheets += document.importedSheetCount;
    current.rows += document.rowCount;
    current.redactions += document.redactionCount;
    categories[document.category] = current;
  }
  return {
    workbookCount,
    eligibleDocuments: documents.length,
    ignored,
    sheets: documents.reduce((sum, item) => sum + item.importedSheetCount, 0),
    rows: documents.reduce((sum, item) => sum + item.rowCount, 0),
    numericCells: documents.reduce((sum, item) => sum + item.numericCellCount, 0),
    textCells: documents.reduce((sum, item) => sum + item.textCellCount, 0),
    redactions: documents.reduce((sum, item) => sum + item.redactionCount, 0),
    categories,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const rootArg = args.find((arg) => !arg.startsWith('--'));
  if (!rootArg) throw new Error('用法: node scripts/import-financial-evidence.js <已解压目录> [--confirm]');
  const rootDir = path.resolve(rootArg);
  if (!fs.statSync(rootDir).isDirectory()) throw new Error('输入路径不是目录');

  // 全部工作簿先完成解析和脱敏，任何一个失败都不会进入写库阶段。
  const { workbooks, documents, ignored } = prepareDocuments(rootDir);
  console.log(JSON.stringify({ mode: confirm ? 'confirm' : 'dry-run', ...summarize(documents, workbooks.length, ignored) }, null, 2));
  if (!confirm) return;
  const result = await importFinancialEvidenceDocuments(documents);
  console.log(JSON.stringify({ imported: result.imported, replaced: result.replaced, skipped: result.skipped }, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`[financial-evidence-import] ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { findWorkbookPaths, prepareDocuments, summarize };
