#!/usr/bin/env node
/**
 * Input: export 的显式ID清单；preview/import 的私有结构化包，import 另须目标预检计划和 --confirm
 * Output: 0700/0600 文件、实际目标SQLite在线备份及新增回执；终端仅输出聚合计数
 * Pos: 本地跨机资料迁移CLI，无SSH/上传/发布功能；默认预检不写数据库
 * Prerequisite: 本机/目标机Node及现有后端依赖，确认导入另需Python3标准库sqlite3。
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const service = require('../src/services/financialEvidenceTransferService');
const run = promisify(execFile);
const MAX_BYTES = 64 * 1024 * 1024;

function reject() { throw new Error('私有文件或参数检查失败'); }
function privateDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) reject();
}
function privateFileDescriptor(file) {
  privateDirectory(path.dirname(path.resolve(file)));
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 || stat.size > MAX_BYTES) reject();
    return fd;
  } catch (error) { fs.closeSync(fd); throw error; }
}
function readPrivateJson(file) {
  const fd = privateFileDescriptor(file);
  try { return JSON.parse(fs.readFileSync(fd, 'utf8')); } finally { fs.closeSync(fd); }
}
function reservePrivateFile(file) {
  privateDirectory(path.dirname(path.resolve(file)));
  return fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
}
function writeJson(fd, value) {
  fs.writeFileSync(fd, JSON.stringify(value, null, 2));
  fs.fsyncSync(fd);
}
function savePrivateJson(file, value) {
  const fd = reservePrivateFile(file);
  try { writeJson(fd, value); } finally { fs.closeSync(fd); }
}
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

// Resolve Prisma's SQLite URL before connection so a typo cannot create a new empty target.
function configuredDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith('file:')) reject();
  const configured = url.slice(5).split('?')[0];
  if (!configured || configured === ':memory:') reject();
  const file = path.isAbsolute(configured) ? configured : path.resolve(__dirname, '../prisma', configured);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) reject();
  return fs.realpathSync(file);
}
async function targetIdentity(db, configured) {
  const list = await db.$queryRawUnsafe('PRAGMA database_list');
  const actual = list.find(item => item.name === 'main')?.file;
  if (!actual || fs.realpathSync(actual) !== configured) reject();
  const stat = fs.statSync(configured);
  if ((stat.mode & 0o077) !== 0) reject();
  return { file: configured, fingerprint: crypto.createHash('sha256')
    .update(JSON.stringify([os.hostname(), configured, String(stat.dev), String(stat.ino)])).digest('hex') };
}

async function backupDatabase(target, directory) {
  privateDirectory(directory);
  const destination = path.join(path.resolve(directory), `before-financial-transfer-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
  // SQLite backup API includes committed WAL contents; never copy an active .db with fs.copyFile.
  const code = `import os,sqlite3,sys
from pathlib import Path
os.umask(0o077)
src,dst=sys.argv[1:]
fd=os.open(dst,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
a=sqlite3.connect(Path(src).as_uri()+'?mode=ro',uri=True,timeout=15)
assert os.path.realpath(a.execute('PRAGMA database_list').fetchone()[2])==src
b=sqlite3.connect(dst)
a.backup(b)
assert b.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
b.close();a.close()
assert os.stat(dst).st_mode&0o777==0o600
`;
  await run('python3', ['-c', code, target.file, destination], { timeout: 60000, maxBuffer: 1024 * 1024 });
  return destination;
}

async function main(args = process.argv.slice(2)) {
  process.umask(0o077);
  const { command, options } = parseArguments(args);
  // 强制先验证环境文件权限，且不覆盖任何生产配置。
  process.env.SECURITY_STRICT_CONFIG_PERMS = 'true';
  require('../src/config');
  const configured = configuredDatabase();
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
    if (command === 'preview') {
      savePrivateJson(options.plan, current);
      console.log(JSON.stringify({ mode: 'preview', ...service.summarize(bundle, current) }));
      return;
    }
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
