#!/usr/bin/env node
/**
 * Input: --database <abs path> [--apply --backup-dir <dir> --receipt <file>] [--report <file>].
 * Output: one JSON summary line; --report writes the per-invoice change list (contract numbers, invoice numbers; Confidential) as a 0600 file.
 * Pos: INVMATCH-4 one-off re-run of invoice auto-matching under the cap / tax-ID / early-date rules (financeMatchService.rematchAutoInvoiceLinks).
 * Prerequisite: private SQLite, and for --apply a private backup directory + Python3 online backup. Dry-run (default) changes no business rows (Prisma still opens the SQLite file read-write, so -wal/-shm may be touched).
 * If the summary shows skipped > 0 (rows changed concurrently), run the dry run again: the plan assumed those rows moved, so kept rows may sit over the cap until then.
 * Capacity is counted at planning time, so a row lost at write still used its share this run (safe: under-links; the next run corrects it).
 * Never reads .env: DATABASE_URL comes only from --database. Only matchSource=AUTO links are re-matched (MANUAL and unset sources are never touched); running twice gives the same result.
 */
const fs = require('node:fs');
const path = require('node:path');
const { configuredDatabase, targetIdentity, backupDatabase, reservePrivateFile, writeJson } = require('./financial-sqlite-safety');

const VALUE_OPTIONS = ['database', 'backup-dir', 'receipt', 'report'];

function parseArguments(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) throw new Error('参数无效');
    const key = arg.slice(2);
    if (Object.hasOwn(options, key)) throw new Error('参数无效');
    if (key === 'apply') options[key] = true;
    else if (VALUE_OPTIONS.includes(key)) {
      if (args[i + 1] === undefined || args[i + 1].startsWith('--')) throw new Error('参数缺值');
      options[key] = args[++i];
    } else throw new Error('参数无效');
  }
  const apply = Boolean(options.apply);
  if (!options.database || !path.isAbsolute(options.database) || options.database.includes('?')
    || (apply && (!options['backup-dir'] || !options.receipt))
    || (!apply && (options['backup-dir'] || options.receipt))
    || (options.report && !path.isAbsolute(options.report))) throw new Error('参数不完整');
  return { database: options.database, apply, backupDir: options['backup-dir'], receipt: options.receipt, report: options.report };
}

async function main(args = process.argv.slice(2)) {
  process.umask(0o077);
  const options = parseArguments(args);
  // Set before the Prisma client is created; no config module is loaded, so no .env is read.
  process.env.DATABASE_URL = `file:${options.database}`;
  const configured = configuredDatabase();
  const db = require('../src/utils/prisma');
  const { rematchAutoInvoiceLinks } = require('../src/services/financeMatchService');
  let receiptFd, reportFd, committed = false;
  try {
    const target = await targetIdentity(db, configured);
    let backupPath = null;
    // Reserve every output file before the transaction: an existing path must fail while nothing has been changed.
    if (options.report) reportFd = reservePrivateFile(options.report);
    if (options.apply) {
      receiptFd = reservePrivateFile(options.receipt);
      backupPath = await backupDatabase(target, options.backupDir);
      if ((await targetIdentity(db, configured)).fingerprint !== target.fingerprint) throw new Error('目标已改变');
    }
    const result = await rematchAutoInvoiceLinks({ apply: options.apply });
    committed = options.apply;
    const { changes, ...counts } = result;
    const summary = { ...counts, changed: changes.length, moved: changes.filter(c => c.action === 'MOVE').length,
      unlinked: changes.filter(c => c.action === 'UNLINK').length, backupPath,
      targetFingerprint: target.fingerprint, completedAt: options.apply ? new Date().toISOString() : null };
    if (reportFd !== undefined) writeJson(reportFd, { format: 'jiesong-invoice-rematch-report-v1', ...summary, changes });
    // Receipt is self-sufficient for undo: original contract/score and new state per invoice (no amounts or contract numbers).
    if (options.apply) writeJson(receiptFd, { format: 'jiesong-invoice-rematch-receipt-v2', ...summary,
      changes: changes.map(({ id, action, fromContractId, fromScore, toContractId, toScore }) => ({ id, action, fromContractId, fromScore, toContractId, toScore })) });
    console.log(JSON.stringify(summary));
  } catch (error) {
    if (committed) { const wrapped = new Error('数据库事务已提交，但回执保存失败；须先只读核验。'); wrapped.code = 'REMATCH_RECEIPT_FAILED'; throw wrapped; }
    throw error;
  } finally {
    if (receiptFd !== undefined) fs.closeSync(receiptFd);
    if (reportFd !== undefined) fs.closeSync(reportFd);
    await db.$disconnect();
  }
}

if (require.main === module) main().catch(error => {
  console.error(error.code === 'REMATCH_RECEIPT_FAILED' ? error.message
    : '发票自动关联重配失败：请核对参数、私有权限及现有数据库；本次未写入。');
  process.exitCode = 1;
});
module.exports = { main, parseArguments };
