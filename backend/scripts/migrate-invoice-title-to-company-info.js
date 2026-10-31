#!/usr/bin/env node
/**
 * Input: --database <abs path> [--dry-run | --confirm --backup-dir <dir> --receipt <file>]
 * Output: one JSON line — which canonical company fields would be / were filled from the legacy invoiceTitleInfo text (field names and counts only,
 *         never values: the text may contain bank lines, which are Restricted).
 * Pos: optional one-off for J35 (single seller identity). Not required: the app already reads the legacy value as a fallback alias.
 *      Only EMPTY canonical keys are filled (companyName/companyTaxId/companyAddress/companyPhone/companyBankInfo); the legacy row is kept;
 *      values go through the same validation as the settings page. Dry-run is the default and writes nothing. Never reads .env.
 */
const fs = require('node:fs');
const path = require('node:path');
const { configuredDatabase, targetIdentity, backupDatabase, reservePrivateFile, writeJson } = require('./financial-sqlite-safety');

const VALUE_OPTIONS = ['database', 'backup-dir', 'receipt'];

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
  if (!options.database || !path.isAbsolute(options.database) || options.database.includes('?')
    || (confirm && options['dry-run'])
    || (confirm && (!options['backup-dir'] || !options.receipt))
    || (!confirm && (options['backup-dir'] || options.receipt))) throw new Error('参数不完整');
  return { database: options.database, confirm, backupDir: options['backup-dir'], receipt: options.receipt };
}

// Plan against a db/tx handle: returns [{field, key, value}] for canonical keys that are empty and have a valid legacy value.
async function plan(tx) {
  const { FIELD_KEYS, parseLegacyInvoiceTitle } = require('../src/utils/legacyInvoiceTitle');
  const { validateCompanyConfigValue } = require('../src/utils/companyConfig');
  // 这些键不是密钥，库里存的是 JSON 字符串；这里不引入 secretCrypto/config，保证脚本不读 .env。
  const normalizeConfigValueForResponse = (_key, raw) => { try { const v = JSON.parse(raw); return typeof v === 'string' ? v : raw; } catch { return raw; } };
  const legacyRow = await tx.systemConfig.findUnique({ where: { key: 'invoiceTitleInfo' } });
  if (!legacyRow) return { fills: [], skipped: [] };
  const parsed = parseLegacyInvoiceTitle(normalizeConfigValueForResponse('invoiceTitleInfo', legacyRow.value));
  const existing = await tx.systemConfig.findMany({ where: { key: { in: Object.values(FIELD_KEYS) } } });
  const filled = new Set(existing.filter((row) => String(normalizeConfigValueForResponse(row.key, row.value) ?? '').trim()).map((row) => row.key));
  const fills = [], skipped = [];
  for (const [field, key] of Object.entries(FIELD_KEYS)) {
    if (!parsed[field] || filled.has(key)) continue;
    try { fills.push({ field, key, value: validateCompanyConfigValue(key, parsed[field]) }); } catch { skipped.push(field); }
  }
  return { fills, skipped };
}

async function main(args = process.argv.slice(2)) {
  process.umask(0o077);
  const options = parseArguments(args);
  process.env.DATABASE_URL = `file:${options.database}`;
  const configured = configuredDatabase();
  const db = require('../src/utils/prisma');
  let receiptFd, committed = false;
  try {
    const target = await targetIdentity(db, configured);
    if (!options.confirm) {
      const { fills, skipped } = await plan(db);
      console.log(JSON.stringify({ mode: 'dry-run', fill: fills.map((f) => f.field), skipped, backupPath: null, targetFingerprint: target.fingerprint }));
      return;
    }
    receiptFd = reservePrivateFile(options.receipt);
    const backupPath = await backupDatabase(target, options.backupDir);
    if ((await targetIdentity(db, configured)).fingerprint !== target.fingerprint) throw new Error('目标已改变');
    const result = await db.$transaction(async (tx) => {
      const { fills, skipped } = await plan(tx);
      for (const { key, value } of fills) {
        await tx.systemConfig.upsert({
          where: { key }, update: { value: JSON.stringify(value), note: '由旧开票抬头信息迁入（J35）' },
          create: { key, value: JSON.stringify(value), note: '由旧开票抬头信息迁入（J35）' },
        });
      }
      return { fill: fills.map((f) => f.field), skipped };
    });
    committed = true;
    const summary = { mode: 'confirm', ...result, backupPath, targetFingerprint: target.fingerprint, completedAt: new Date().toISOString() };
    writeJson(receiptFd, { format: 'jiesong-invoice-title-migration-receipt-v1', ...summary });
    console.log(JSON.stringify(summary));
  } catch (error) {
    if (committed) { const wrapped = new Error('数据库事务已提交，但回执保存失败；须先只读核验。'); wrapped.code = 'MIGRATION_RECEIPT_FAILED'; throw wrapped; }
    throw error;
  } finally {
    if (receiptFd !== undefined) fs.closeSync(receiptFd);
    await db.$disconnect();
  }
}

if (require.main === module) main().catch(error => {
  console.error(error.code === 'MIGRATION_RECEIPT_FAILED' ? error.message
    : '开票抬头迁移失败：请核对参数、私有权限及现有数据库；本次未写入。');
  process.exitCode = 1;
});
module.exports = { main, parseArguments, plan };
