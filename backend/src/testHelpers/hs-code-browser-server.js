/**
 * Input: Explicit test-only private directory and committed Prisma migrations
 * Output: Real Express/login backend with synthetic local HS records and existing roles
 * Pos: Isolated HS catalogue browser/HTTP fixture; no provider or production access
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const directory = process.env.HS_BROWSER_TEST_DIR;
if (process.env.NODE_ENV !== 'test' || !process.send
  || !directory?.startsWith(path.join(os.tmpdir(), 'jiesong-hs-browser-e2e-'))
  || fs.realpathSync(directory) !== directory
  || fs.existsSync(path.resolve(__dirname, '../../.env'))) process.exit(2);
process.umask(0o077);
fs.chmodSync(directory, 0o700);
const database = path.join(directory, 'synthetic.db');
process.env.DATABASE_URL = `file:${database}`;
process.env.UPLOAD_DIR = path.join(directory, 'uploads');
process.env.JWT_SECRET = 'test-only-hs-browser-jwt-never-production';

/**
 * 职责：迁移独占私有库，预置合成字典与现有角色，并启动真实应用。
 * 思路：先以0600建库，再应用已提交迁移；字典由独立SQLite连接写入字面量。
 * @returns 启动与IPC元数据交付完成的 Promise<void>
 * @throws 迁移、合成用户写入或应用启动失败
 */
async function start() {
  // 0. 初始化已提交的迁移；不运行 db push、diff 或 client generate。
  fs.closeSync(fs.openSync(database, 'wx', 0o600));
  const previousUmask = process.umask(0o022);
  try {
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: path.resolve(__dirname, '../..'), stdio: 'ignore', timeout: 30000,
    });
  } finally { process.umask(previousUmask); }
  fs.chmodSync(database, 0o600);
  // 1. 字典记录仅用于检索/人工维护，不代表实际税则或归类建议。
  execFileSync('python3', ['-c', `import sqlite3,sys
c=sqlite3.connect(sys.argv[1])
rows=[
('synthetic-hs-a','9999010001','合成本地编码甲',17,3.5,0,13,'件','合成已保存备注','品牌类型|用途','A:合成监管甲','M:合成检验甲'),
('synthetic-hs-b','9999010002','合成本地编码乙',9,0,2,9,'千克','合成相邻编码备注','材质|规格',None,None),
('synthetic-hs-numeric-name','8888010001','合成999901名称',7,1,None,7,'米','合成名称包含数字','用途',None,None)]
c.executemany('INSERT INTO hs_codes (id,hsCode,productName,taxRate,refundRate,exportTaxRate,vatRate,unit,note,declarationElements,supervisionConditions,inspectionQuarantine,effectiveDate,sourceUrl,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[row+(1767225600000,'https://example.invalid/hs/synthetic-original',1767225600000) for row in rows])
c.commit()
c.close()`, database], { timeout: 10000, stdio: 'ignore' });
  // 2. 使用现有数据库角色与真实密码登录，不伪造认证响应或授予新权限。
  const db = require('../utils/prisma');
  const hash = await require('bcrypt').hash('test-only-hs-browser-password-never-production', 4);
  const users = {};
  for (const role of ['ADMIN', 'PURCHASE', 'FINANCE', 'SALES', 'WAREHOUSE', 'BOSS']) {
    const user = await db.user.create({ data: {
      username: `synthetic-hs-${role.toLowerCase()}`, name: `合成HS${role}`, role, password: hash,
    } });
    users[role] = { id: user.id, username: user.username };
  }
  const app = require('../app'); // Import does not start scheduled/provider jobs.
  const server = app.listen(0, '127.0.0.1', () => process.send({
    baseURL: `http://127.0.0.1:${server.address().port}`, users,
    hsCode: '9999010001', productName: '合成本地编码甲',
  }));
  let closing = false;
  /**
   * 职责：停止当前HTTP子进程并关闭私有数据库连接。
   * @returns 清理和退出完成的 Promise<void>
   * @throws 服务关闭或数据库断开失败
   */
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
start().catch(() => { console.error('Synthetic HS browser fixture failed'); process.exit(1); });
