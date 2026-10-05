/** 第二个隔离采购 HTTP 进程，验证多个 SQLite 客户端；拒绝非测试或非临时合成数据库。 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = process.env.PURCHASE_EXCEPTION_TEST_DIR;
if (process.env.NODE_ENV !== 'test' || !directory?.startsWith(path.join(os.tmpdir(), 'jiesong-purchase-exceptions-')) || !process.send || process.env.DATABASE_URL !== `file:${path.join(directory, 'synthetic.db')}` || !fs.existsSync(path.join(directory, 'synthetic.db'))) process.exit(2);
const db = require('../utils/prisma');
const app = require('../app');
const server = app.listen(0, '127.0.0.1', () => process.send({ baseURL: `http://127.0.0.1:${server.address().port}/api/v1` }));
let closing = false;
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
