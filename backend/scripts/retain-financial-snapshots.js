#!/usr/bin/env node
/**
 * Input: explicit snapshot files; --confirm requires --backup-dir and --receipt.
 * Output: aggregate counts; confirmed batches have a private online backup and exclusive receipt.
 * Pos: append-only local adapter. Preview parses files without connecting to SQLite.
 * Prerequisite: existing private SQLite, private output directories and Python3 for confirmation.
 */
const fs = require('node:fs');
const path = require('node:path');
const { configuredDatabase, targetIdentity, backupDatabase, reservePrivateFile, writeJson } = require('./financial-sqlite-safety');

function parseArguments(args) {
  const options = {}, files = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) { files.push(arg); continue; }
    const key = arg.slice(2);
    if (!['confirm', 'backup-dir', 'receipt'].includes(key) || Object.hasOwn(options, key)) throw new Error('参数无效');
    if (key === 'confirm') options[key] = true;
    else {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('参数缺值');
      options[key] = args[++i];
    }
  }
  if (!files.length || (options.confirm && (!options['backup-dir'] || !options.receipt))
    || (!options.confirm && (options['backup-dir'] || options.receipt))) throw new Error('参数不完整');
  return { options, files };
}

async function main(args = process.argv.slice(2)) {
  process.umask(0o077);
  const { options, files } = parseArguments(args);
  // Reject missing targets before importing any Prisma-backed service or emitting mode output.
  process.env.SECURITY_STRICT_CONFIG_PERMS = 'true';
  require('../src/config');
  const configured = configuredDatabase();
  const service = require('../src/services/financialEvidenceService');
  const documents = files.map(file => service.parseFinancialEvidenceSnapshot({
    buffer: fs.readFileSync(file), fileName: path.basename(file),
  }));
  if (!options.confirm) {
    console.log(JSON.stringify({ mode: 'preview', documents: documents.map(doc => ({
      category: doc.category, period: doc.categoryLabel, year: doc.periodYear, month: doc.periodMonth,
      sheets: doc.importedSheetCount, rows: doc.rowCount, redactions: doc.redactionCount,
    })) }));
    return;
  }
  const db = require('../src/utils/prisma');
  let receiptFd, committed = false;
  try {
    const target = await targetIdentity(db, configured);
    receiptFd = reservePrivateFile(options.receipt);
    const backup = await backupDatabase(target, options['backup-dir']);
    if ((await targetIdentity(db, configured)).fingerprint !== target.fingerprint) throw new Error('目标已改变');
    const result = await service.appendFinancialEvidenceSnapshots(documents, db);
    committed = true;
    writeJson(receiptFd, { format: 'jiesong-financial-snapshot-receipt-v1',
      completedAt: new Date().toISOString(), backup, targetFingerprint: target.fingerprint,
      ...result, documents: result.documents.map((item, index) => ({ ...item, sourceKey: documents[index].sourceKey })) });
    console.log(JSON.stringify({ mode: 'confirm', imported: result.imported, skipped: result.skipped, replaced: 0 }));
  } catch (error) {
    if (committed) { const wrapped = new Error('数据库事务已提交，但回执保存失败；须先只读核验。'); wrapped.code = 'FINANCE_RECEIPT_FAILED'; throw wrapped; }
    throw error;
  } finally {
    if (receiptFd !== undefined) fs.closeSync(receiptFd);
    await db.$disconnect();
  }
}

if (require.main === module) main().catch(error => {
  console.error(error.code === 'FINANCE_RECEIPT_FAILED' ? error.message
    : '财务快照留存失败：请核对参数、私有权限、格式、Python备份及现有数据库；本批未覆盖已有资料。');
  process.exitCode = 1;
});
module.exports = { main, parseArguments };
