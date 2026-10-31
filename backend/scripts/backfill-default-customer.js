#!/usr/bin/env node
/**
 * Input: --database <abs path> --customer-name <name> [--dry-run | --confirm --backup-dir <dir> --receipt <file>].
 * Output: one JSON line of counts and ids (no names, contacts or amounts).
 * Pos: one-off backfill after migration A (docs/redesign/DATA-MODEL-2026.md §2.3). Dry-run is the default and writes nothing.
 * Prerequisite: existing private SQLite (migration A applied), private backup directory, Python3 for the online backup.
 * Never reads .env: DATABASE_URL comes only from --database. Idempotent: only rows with customerId IS NULL are touched.
 */
const fs = require('node:fs');
const path = require('node:path');
const { configuredDatabase, targetIdentity, backupDatabase, reservePrivateFile, writeJson } = require('./financial-sqlite-safety');

const VALUE_OPTIONS = ['database', 'customer-name', 'backup-dir', 'receipt'];

function parseArguments(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) throw new Error('参数无效');
    const key = arg.slice(2);
    if (Object.hasOwn(options, key)) throw new Error('参数无效');
    if (key === 'confirm' || key === 'dry-run') options[key] = true;
    else if (VALUE_OPTIONS.includes(key)) {
      if (args[i + 1] === undefined || args[i + 1].startsWith('--')) throw new Error('参数缺值');
      options[key] = args[++i];
    } else throw new Error('参数无效');
  }
  const confirm = Boolean(options.confirm);
  const name = (options['customer-name'] ?? '').trim();
  if (!options.database || !path.isAbsolute(options.database) || options.database.includes('?')
    || !name || name.length > 100
    || (confirm && options['dry-run'])
    || (confirm && (!options['backup-dir'] || !options.receipt))
    || (!confirm && (options['backup-dir'] || options.receipt))) throw new Error('参数不完整');
  return { database: options.database, customerName: name, confirm,
    backupDir: options['backup-dir'], receipt: options.receipt };
}

// Counts what a confirm run would change; shared by dry-run and the real write transaction.
async function plan(tx, customerName) {
  const customer = await tx.customer.findUnique({ where: { name: customerName } });
  if (customer && !customer.isActive) throw new Error('客户已归档');
  return { customer,
    storesLinked: await tx.store.count({ where: { customerId: null } }),
    salesContractsLinked: await tx.salesContract.count({ where: { customerId: null } }) };
}

async function main(args = process.argv.slice(2)) {
  process.umask(0o077);
  const options = parseArguments(args);
  // Set before the Prisma client is created; no config module is loaded, so no .env is read.
  process.env.DATABASE_URL = `file:${options.database}`;
  const configured = configuredDatabase();
  const db = require('../src/utils/prisma');
  let receiptFd, committed = false;
  try {
    const target = await targetIdentity(db, configured);
    if (!options.confirm) {
      const found = await plan(db, options.customerName);
      console.log(JSON.stringify({ mode: 'dry-run', customerCreated: !found.customer,
        customerId: found.customer?.id ?? null, storesLinked: found.storesLinked,
        salesContractsLinked: found.salesContractsLinked, backupPath: null,
        targetFingerprint: target.fingerprint, completedAt: null }));
      return;
    }
    receiptFd = reservePrivateFile(options.receipt);
    const backupPath = await backupDatabase(target, options.backupDir);
    if ((await targetIdentity(db, configured)).fingerprint !== target.fingerprint) throw new Error('目标已改变');
    const result = await db.$transaction(async (tx) => {
      const found = await plan(tx, options.customerName);
      // Customer defaults (USD / FOB) come from the schema; nothing else is invented here.
      const customer = found.customer ?? await tx.customer.create({ data: { name: options.customerName } });
      const stores = await tx.store.updateMany({ where: { customerId: null }, data: { customerId: customer.id } });
      const sales = await tx.salesContract.updateMany({ where: { customerId: null }, data: { customerId: customer.id } });
      return { customerCreated: !found.customer, customerId: customer.id,
        storesLinked: stores.count, salesContractsLinked: sales.count };
    });
    committed = true;
    const summary = { mode: 'confirm', ...result, backupPath, targetFingerprint: target.fingerprint,
      completedAt: new Date().toISOString() };
    writeJson(receiptFd, { format: 'jiesong-default-customer-backfill-receipt-v1', ...summary });
    console.log(JSON.stringify(summary));
  } catch (error) {
    if (committed) { const wrapped = new Error('数据库事务已提交，但回执保存失败；须先只读核验。'); wrapped.code = 'BACKFILL_RECEIPT_FAILED'; throw wrapped; }
    throw error;
  } finally {
    if (receiptFd !== undefined) fs.closeSync(receiptFd);
    await db.$disconnect();
  }
}

if (require.main === module) main().catch(error => {
  console.error(error.code === 'BACKFILL_RECEIPT_FAILED' ? error.message
    : '默认客户回填失败：请核对参数、私有权限、迁移A是否已应用及现有数据库；本次未写入。');
  process.exitCode = 1;
});
module.exports = { main, parseArguments };
