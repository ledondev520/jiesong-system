/** Test-only role browser backend: real Express/auth/services and private synthetic SQLite. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const directory = process.env.ROLE_BROWSER_TEST_DIR;
const scenario = process.env.ROLE_BROWSER_TEST_SCENARIO;
// Fixed, deliberately unusable production credentials; no environment file or provider access.
const password = 'test-only-role-browser-password-never-production';
if (process.env.NODE_ENV !== 'test' || !process.send
  || !directory?.startsWith(path.join(os.tmpdir(), 'jiesong-role-browser-e2e-'))
  || fs.realpathSync(directory) !== directory
  || !['purchase', 'warehouse', 'sales', 'boss'].includes(scenario)
  || fs.existsSync(path.resolve(__dirname, '../../.env'))) process.exit(2);
process.umask(0o077);
fs.chmodSync(directory, 0o700);
process.env.DATABASE_URL = `file:${path.join(directory, 'synthetic.db')}`;
process.env.UPLOAD_DIR = path.join(directory, 'uploads');
process.env.JWT_SECRET = 'test-only-role-browser-jwt-secret-never-production';

async function start() {
  const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.resolve(__dirname, '../../prisma/schema.prisma'), '--script'], { encoding: 'utf8', timeout: 30000 });
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', path.join(directory, 'synthetic.db')], { input: `${ddl}\nINSERT INTO password_reset_lock (id) VALUES (1);` });
  fs.chmodSync(path.join(directory, 'synthetic.db'), 0o600);
  const db = require('../utils/prisma');
  const users = {};
  const hash = await require('bcrypt').hash(password, 4);
  for (const role of ['PURCHASE', 'WAREHOUSE', 'SALES', 'BOSS']) {
    users[role] = await db.user.create({ data: { username: `synthetic-role-${role.toLowerCase()}`, name: `合成${role}`, role, password: hash } });
  }
  const product = await db.product.create({ data: { customsName: '合成角色验收商品', unit: '件', hsCode: '9999999999', declaration: '合成测试要素' } });
  const supplier = await db.supplier.create({ data: { name: '合成角色验收供应商' } });
  const port = await db.port.create({ data: { name: '合成角色验收港口', code: 'ROLE-QA' } });
  // Skip boilerplate creation forms only. Receipt/inspection seeds use unchanged business transactions.
  const purchase = await db.purchaseContract.create({ data: {
    contractNo: 'CG-SYNTHETIC-ROLE', supplierId: supplier.id, status: 'SHIPPED', totalAmount: 1130,
    productionCompletedAt: new Date('2026-10-01'),
    items: { create: { productId: product.id, quantity: 100, unit: '件', unitPrice: 10, totalPrice: 1000,
      specification: '合成箱', boxes: 10, grossWeight: 40000, netWeight: 38000, volume: 10, length: 1000, width: 1000, height: 1000 } },
  }, include: { items: true } });
  const purchaseItem = purchase.items[0];
  let receipt, sale;
  const receipts = require('../services/purchaseReceiptService');
  if (scenario !== 'purchase') {
    const arrival = await receipts.createPurchaseReceipt(purchase.id, {
      requestId: 'synthetic-seed-arrival', arrivedAt: '2026-10-01',
      items: [{ purchaseItemId: purchaseItem.id, arrivedQuantity: scenario === 'warehouse' ? 40 : 100 }],
    }, users.PURCHASE.id);
    receipt = arrival.receipt;
  }
  if (scenario === 'sales' || scenario === 'boss') {
    await receipts.inspectPurchaseReceipt(purchase.id, receipt.id, {
      requestId: 'synthetic-seed-inspection', note: '合成夹具：其余数量等待复验',
      items: [{ receiptItemId: receipt.items[0].id, acceptedQuantity: 30, reinspectionQuantity: 70 }],
    }, users.WAREHOUSE.id);
    const sales = require('../services/salesService');
    sale = await db.salesContract.create({ data: { contractNo: 'EXP-SYNTHETIC-ROLE', portId: port.id, exchangeRate: 7.2 } });
    await sales.importPurchasePackingItems(sale.id, [{ purchaseItemId: purchaseItem.id, boxes: 5 }]);
    await sales.updateSalesStatus(sale.id, 'CONFIRMED');
  }
  const app = require('../app'); // Imported app never starts scheduled/provider jobs.
  const server = app.listen(0, '127.0.0.1', () => process.send({
    baseURL: `http://127.0.0.1:${server.address().port}`,
    purchaseId: purchase.id, purchaseItemId: purchaseItem.id, productId: product.id,
    receiptId: receipt?.id, receiptItemId: receipt?.items[0].id, salesId: sale?.id, salesNo: sale?.contractNo,
    users: Object.fromEntries(Object.entries(users).map(([role, user]) => [role, { id: user.id, username: user.username }])),
  }));
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
}
start().catch(() => { console.error('Synthetic role browser fixture failed'); process.exit(1); });
