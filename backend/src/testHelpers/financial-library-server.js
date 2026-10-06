/**
 * Input: Explicit private test directory, generated sources and committed migrations
 * Output: Existing CLI-ingested library served by real Express/auth on IPv4 loopback
 * Pos: Test-only financial library backend; no test HTTP endpoints or production configuration
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSources, applyMigrations, runImport } = require('./financial-library-data');
const directory = process.env.FINANCIAL_LIBRARY_TEST_DIR;
const password = 'test-only-financial-library-password-never-production';
if (process.env.NODE_ENV !== 'test' || !process.send
  || !directory?.startsWith(path.join(os.tmpdir(), 'jiesong-financial-library-'))
  || fs.realpathSync(directory) !== directory
  || fs.existsSync(path.resolve(__dirname, '../../.env'))) process.exit(2);
process.umask(0o077);
fs.chmodSync(directory, 0o700);
process.env.DATABASE_URL = `file:${path.join(directory, 'synthetic.db')}`;
process.env.UPLOAD_DIR = path.join(directory, 'uploads');
process.env.JWT_SECRET = 'test-only-financial-library-never-production';

/**
 * 职责：迁移私有数据库、创建真实测试角色、通过原有CLI入库并启动现有HTTP应用。
 * @returns {Promise<void>} 经IPC通知父进程元数据
 * @throws 初始化或导入失败
 */
async function start() {
  applyMigrations(path.join(directory, 'synthetic.db'));
  const db = require('../utils/prisma');
  const hash = await require('bcrypt').hash(password, 4);
  const users = {};
  for (const role of ['ADMIN', 'FINANCE', 'BOSS', 'PURCHASE', 'SALES', 'WAREHOUSE', 'INACTIVE']) {
    const user = await db.user.create({ data: { username: `synthetic-library-${role.toLowerCase()}`, name: `合成${role}`, password: hash, role: role === 'INACTIVE' ? 'FINANCE' : role, isActive: role !== 'INACTIVE' } });
    users[role] = { id: user.id, username: user.username };
  }
  await db.financialPeriod.create({ data: { year: 2026, month: 10, periodLabel: '合成2026-10', reportDate: new Date('2026-10-31T00:00:00Z') } });
  createSources(directory);
  runImport(directory, true);
  const documents = await db.financialEvidenceDocument.findMany({ select: { id: true, category: true } });
  const app = require('../app');
  const server = app.listen(0, '127.0.0.1', () => process.send({
    baseURL: `http://127.0.0.1:${server.address().port}`, users,
    documents: Object.fromEntries(documents.map(document => [document.category, document.id])),
  }));
  let closing = false;
  /**
   * 职责：父进程结束时关闭连接并断开私有数据库，不访问其他资源。
   * @returns {Promise<void>}
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
start().catch(() => { console.error('Synthetic financial library fixture failed'); process.exit(1); });
