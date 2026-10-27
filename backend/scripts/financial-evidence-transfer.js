#!/usr/bin/env node
/**
 * Input: export 的显式ID清单；preview/import 的私有结构化包，import 另须目标预检计划和 --confirm
 * Output: 0700/0600 文件、实际目标SQLite在线备份及新增回执；终端仅输出聚合计数
 * Pos: 本地跨机资料迁移CLI，无SSH/上传/发布功能；默认预检不写数据库
 * Prerequisite: 本机/目标机Node及现有后端依赖，确认导入另需Python3标准库sqlite3。
 */
const fs = require('node:fs');
const service = require('../src/services/financialEvidenceTransferService');
const { reject, readPrivateJson, savePrivateJson, configuredDatabase, targetIdentity,
  reservePrivateFile, backupDatabase, writeJson } = require('./financial-sqlite-safety');

function parseArguments(args) {
  const [command, ...rest] = args;
  const specs = {
    export: ['ids-file', 'output'], preview: ['bundle', 'plan'],
    import: ['bundle', 'plan', 'backup-dir', 'receipt'],
  };
  if (!specs[command]) reject();
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].replace(/^--/, '');
    if (!rest[i].startsWith('--') || Object.hasOwn(options, key)) reject();
    if (key === 'confirm' && command === 'import') options[key] = true;
    else {
      if (!specs[command].includes(key) || !rest[i + 1] || rest[i + 1].startsWith('--')) reject();
      options[key] = rest[++i];
    }
  }
  if (!specs[command].every(key => options[key])) reject();
  if (command === 'import' && !options.confirm) reject();
  return { command, options };
}

async function main(args = process.argv.slice(2)) {
  process.umask(0o077);
  const { command, options } = parseArguments(args);
  // 强制先验证环境文件权限，且不覆盖任何生产配置。
  process.env.SECURITY_STRICT_CONFIG_PERMS = 'true';
  require('../src/config');
  const configured = configuredDatabase();
  if (command === 'preview') {
    const bundle = service.validateBundle(readPrivateJson(options.bundle));
    const { readSnapshot, planFromSnapshot } = require('./financial-evidence-readonly');
    const plan = await planFromSnapshot(bundle, readSnapshot(bundle, configured));
    savePrivateJson(options.plan, plan);
    console.log(JSON.stringify({ mode: 'preview', ...service.summarize(bundle, plan), readOnlyConnection: true }));
    return;
  }
  const db = require('../src/utils/prisma');
  let receiptFd, committed = false;
  try {
    const target = await targetIdentity(db, configured);
    if (command === 'export') {
      const bundle = await service.exportBundle(readPrivateJson(options['ids-file']), db);
      savePrivateJson(options.output, bundle);
      console.log(JSON.stringify({ mode: 'export', ...service.summarize(bundle) }));
      return;
    }
    const bundle = service.validateBundle(readPrivateJson(options.bundle));
    const current = await service.previewBundle(bundle, db, target.fingerprint);
    const approved = readPrivateJson(options.plan);
    service.validatePlan(approved);
    if (approved.planSha256 !== current.planSha256) {
      const error = new Error('预检计划已过期或目标数据库不符，请重新预检');
      error.code = 'FINANCE_TRANSFER_VALIDATION'; throw error;
    }
    // 回执文件先独占预留，避免路径碰撞导致已入库却覆盖旧回执。
    receiptFd = reservePrivateFile(options.receipt);
    const backup = current.actions.some(action => action.action === 'CREATE')
      ? await backupDatabase(target, options['backup-dir']) : null;
    const afterBackup = await targetIdentity(db, configured);
    if (afterBackup.fingerprint !== target.fingerprint) reject();
    const result = await service.importBundle(bundle, approved, db, target.fingerprint);
    committed = true;
    writeJson(receiptFd, { format: 'jiesong-financial-evidence-transfer-receipt-v1',
      completedAt: new Date().toISOString(), bundleSha256: bundle.payloadSha256,
      targetFingerprint: target.fingerprint, backup, ...result });
    console.log(JSON.stringify({ mode: 'import', imported: result.imported, skipped: result.skipped,
      replaced: 0, readbackVerified: true, backupCreated: backup !== null }));
  } catch (error) {
    if (committed) { const wrapped = new Error('数据库事务已提交，但回执保存失败；须先只读核验。'); wrapped.code = 'FINANCE_TRANSFER_VALIDATION'; throw wrapped; }
    throw error;
  } finally {
    if (receiptFd !== undefined) fs.closeSync(receiptFd);
    await db.$disconnect();
  }
}

if (require.main === module) main().catch(error => {
  console.error(error.code === 'FINANCE_TRANSFER_VALIDATION' ? error.message
    : '财务迁移操作未完成：请核对参数、私有文件权限、Python备份及目标数据库配置。');
  process.exitCode = 1;
});

module.exports = { main, readPrivateJson, savePrivateJson };
