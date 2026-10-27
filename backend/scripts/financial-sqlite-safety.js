/** Shared private-file, existing SQLite identity and online-backup controls for local financial CLIs.
 * Paths come from explicit configuration; literal percent sequences are never URI-decoded.
 * Operators must keep database and backup directories under trusted local control.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
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
  if (configuredDatabase() !== configured) reject();
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
if os.path.realpath(a.execute('PRAGMA database_list').fetchone()[2])!=src: raise ValueError('database identity mismatch')
b=sqlite3.connect(dst)
a.backup(b)
if b.execute('PRAGMA integrity_check').fetchall()!=[('ok',)]: raise ValueError('backup integrity failed')
b.close();a.close()
if os.stat(dst).st_mode&0o777!=0o600: raise ValueError('backup permissions failed')
`;
  await run('python3', ['-c', code, target.file, destination], { timeout: 60000, maxBuffer: 1024 * 1024 });
  return destination;
}

module.exports = { reject, privateDirectory, readPrivateJson, reservePrivateFile, writeJson,
  savePrivateJson, configuredDatabase, targetIdentity, backupDatabase };
