/**
 * Input: Committed Prisma migrations/schema and an exclusive private destination path
 * Output: A 0600 SQLite copy of a once-built migrated (kind "deploy") or schema-DDL (kind "diff") template
 * Pos: Test-only; replaces one Prisma CLI run per fixture with one per migration+schema+builder+Prisma-version hash
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const backendRoot = path.resolve(__dirname, '../..');
const prismaCli = () => require.resolve('prisma/build/index.js');

/** 职责：迁移内容+schema+本构建器+Prisma 版本的摘要，任一变化都使旧模板作废 */
function contentKey() {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(__filename)).update(require('prisma/package.json').version);
  const migrations = path.join(backendRoot, 'prisma/migrations');
  for (const name of fs.readdirSync(migrations).sort()) {
    const file = path.join(migrations, name, 'migration.sql');
    if (fs.existsSync(file)) hash.update(name).update(fs.readFileSync(file));
  }
  return hash.update(fs.readFileSync(path.join(backendRoot, 'prisma/schema.prisma'))).digest('hex').slice(0, 16);
}

/** 职责：在当前用户独占的 0700 缓存目录内构建模板；owner/mode 不符则拒绝（/tmp 共享） */
function cacheDirectory() {
  const dir = path.join(os.tmpdir(), `jiesong-sqlite-template-${process.getuid()}-${contentKey()}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) throw new Error('Unsafe SQLite template cache');
  return dir;
}

/** 职责：构建一次模板；并发构建者各自写私有临时文件后原子 rename，内容相同故谁赢都正确 */
function build(kind, target) {
  const scratch = fs.mkdtempSync(path.join(path.dirname(target), 'build-'));
  try {
    const database = path.join(scratch, 'template.db');
    if (kind === 'deploy') {
      fs.closeSync(fs.openSync(database, 'wx', 0o600));
      // Prisma's executable children need normal execute bits; the file/root stay private.
      const previousUmask = process.umask(0o022);
      try {
        execFileSync(process.execPath, [prismaCli(), 'migrate', 'deploy'], {
          cwd: backendRoot, stdio: 'ignore', timeout: 60000, env: { ...process.env, DATABASE_URL: `file:${database}` },
        });
      } finally { process.umask(previousUmask); }
    } else {
      // 'diff' = role-fixture schema + lock row; 'schema' = bare schema DDL for tests that seed their own rows.
      const ddl = execFileSync(process.execPath, [prismaCli(), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(backendRoot, 'prisma/schema.prisma'), '--script'], { encoding: 'utf8', timeout: 60000 });
      execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: kind === 'diff' ? `${ddl}\nINSERT INTO password_reset_lock (id) VALUES (1);` : ddl });
    }
    fs.chmodSync(database, 0o600);
    fs.renameSync(database, target);
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}

/**
 * 职责：把模板复制为独占新库（已存在则失败），权限 0600
 * @param kind 'deploy'=已提交迁移结果；'diff'=schema DDL + password_reset_lock 行；'schema'=仅 schema DDL
 * @param destination 尚不存在的数据库路径
 * @throws 缓存不安全、构建失败或目标已存在
 */
function copyTemplate(kind, destination) {
  const template = path.join(cacheDirectory(), `${kind}.db`);
  if (!fs.existsSync(template)) build(kind, template);
  fs.copyFileSync(template, destination, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(destination, 0o600);
}

module.exports = { copyTemplate };
