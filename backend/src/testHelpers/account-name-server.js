/**
 * Input: Private test directory, committed migrations and synthetic ordinary users
 * Output: Loopback Express API plus safe-field identities for name-only lifecycle QA
 * Pos: Test-only account-name fixture; no login/password or Agent operations
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const directory = process.env.ACCOUNT_NAME_TEST_DIR;
if (process.env.NODE_ENV !== 'test' || !process.send
  || !directory?.startsWith(path.join(os.tmpdir(), 'jiesong-account-name-'))
  || fs.realpathSync(directory) !== directory
  || fs.existsSync(path.resolve(__dirname, '../../.env'))) process.exit(2);
process.umask(0o077);
fs.chmodSync(directory, 0o700);
const database = path.join(directory, 'synthetic.db');
process.env.DATABASE_URL = `file:${database}`;
process.env.UPLOAD_DIR = path.join(directory, 'uploads');
process.env.JWT_SECRET = 'test-only-account-name-fixture-never-production';

/**
 * 职责：仅预置不可登录的合成身份，启动真实 ADMIN 用户 API 供名称编辑验收
 * @returns 启动完成的 Promise；IPC 只返回合成令牌与安全字段
 * @throws 私有目录、已提交迁移、预置身份或 HTTP 服务启动失败
 */
async function start() {
  fs.closeSync(fs.openSync(database, 'wx', 0o600));
  // Prisma child executables need normal execute bits; the database/root stay private.
  const previousUmask = process.umask(0o022);
  try {
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: path.resolve(__dirname, '../..'), stdio: 'ignore', timeout: 30000,
    });
  } finally { process.umask(previousUmask); }
  fs.chmodSync(database, 0o600);
  const db = require('../utils/prisma');
  const select = { id: true, username: true, name: true, role: true, isActive: true };
  // Deliberately unusable placeholders, never bcrypt credentials or real access.
  /**
   * 职责：只预置当前私有夹具的合成身份，并仅返回安全字段
   * @param username 合成唯一用户名
   * @param name 合成显示姓名
   * @param role 夹具已有 ADMIN 或 SALES 角色
   * @param createdAt 独立分页位置所需日期
   * @returns 安全身份字段
   */
  const seed = (username, name, role, createdAt) => db.user.create({
    data: { username, name, role, createdAt: new Date(createdAt), password: 'test-only-unusable-placeholder' },
    select,
  });
  const admin = await seed('synthetic-name-admin', '合成名称管理员', 'ADMIN', '2026-10-05T00:00:00Z');
  const first = await seed('synthetic-name-first', '合成首页普通用户', 'SALES', '2026-10-04T00:00:00Z');
  const later = await seed('synthetic-name-later', '合成后页普通用户', 'SALES', '2020-01-01T00:00:00Z');
  for (let index = 0; index < 100; index += 1) {
    await seed(`synthetic-name-filler-${index}`, `合成目录占位 ${index}`, 'SALES',
      new Date(Date.UTC(2026, 9, 3, 0, 0, index)).toISOString());
  }
  const token = require('jsonwebtoken').sign({ userId: admin.id }, process.env.JWT_SECRET);
  const server = require('../app').listen(0, '127.0.0.1', () => {
    process.send({ baseURL: `http://127.0.0.1:${server.address().port}`, token, first, later });
  });
  let closing = false;
  /** 职责：终止当前夹具服务与连接；@returns 停止完成的 Promise。 */
  const close = async () => {
    if (closing) return;
    closing = true;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await db.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', close);
  process.on('disconnect', close);
}
start().catch(() => process.exit(1));
