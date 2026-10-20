/**
 * Input: Explicit test scenario, private temporary root and synthetic role/business data
 * Output: Isolated real Express/auth backend and scenario metadata for browser/HTTP tests
 * Pos: Test-only role fixture including internal records, documents, header drafts and dashboard sources
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
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
  || !['purchase', 'warehouse', 'sales', 'boss', 'receipt-pool', 'notification-state', 'tax-record-forms', 'menu-export-documents', 'sales-header', 'dashboard-sources'].includes(scenario)
  || fs.existsSync(path.resolve(__dirname, '../../.env'))) process.exit(2);
process.umask(0o077);
fs.chmodSync(directory, 0o700);
process.env.DATABASE_URL = `file:${path.join(directory, 'synthetic.db')}`;
process.env.UPLOAD_DIR = path.join(directory, 'uploads');
process.env.JWT_SECRET = 'test-only-role-browser-jwt-secret-never-production';

/**
 * 职责：初始化独占合成数据库并启动真实角色验收 HTTP 服务
 * @returns 启动完成的 Promise；经 IPC 返回夹具元数据
 * @throws 迁移、合成资料构建或服务启动失败
 */
async function start() {
  if (['tax-record-forms', 'menu-export-documents', 'sales-header', 'dashboard-sources'].includes(scenario)) {
    // These form/document/dashboard scenarios use committed migrations, never db push or
    // client generation. Prisma's executable children need normal execute bits;
    // the database is created 0600 first inside the already-private 0700 root.
    fs.closeSync(fs.openSync(path.join(directory, 'synthetic.db'), 'wx', 0o600));
    const previousUmask = process.umask(0o022);
    try {
      execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
        cwd: path.resolve(__dirname, '../..'), stdio: 'ignore', timeout: 30000,
      });
    } finally { process.umask(previousUmask); }
  } else {
    const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.resolve(__dirname, '../../prisma/schema.prisma'), '--script'], { encoding: 'utf8', timeout: 30000 });
    execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', path.join(directory, 'synthetic.db')], { input: `${ddl}\nINSERT INTO password_reset_lock (id) VALUES (1);` });
  }
  fs.chmodSync(path.join(directory, 'synthetic.db'), 0o600);
  const db = require('../utils/prisma');
  const users = {};
  const hash = await require('bcrypt').hash(password, 4);
  for (const role of ['PURCHASE', 'WAREHOUSE', 'SALES', 'BOSS', 'FINANCE']) {
    users[role] = await db.user.create({ data: { username: `synthetic-role-${role.toLowerCase()}`, name: `合成${role}`, role, password: hash } });
  }
  if (scenario === 'notification-state') {
    // Only this scenario's signed-in user's existing rows; nullable links keep
    // the panel open while the hosted test repeats the same mark-one click.
    for (let index = 0; index < 4; index += 1) {
      await db.notification.create({ data: {
        userId: users.PURCHASE.id, type: 'PURCHASE_DRAFT', title: `合成通知 ${index + 1}`,
        content: '合成普通通知', isRead: index === 3,
        createdAt: new Date(`2026-10-0${index + 1}T12:00:00.000Z`),
      } });
    }
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
  const dashboardSources = scenario === 'dashboard-sources'
    ? require('./dashboard-source-seed').seedDashboardSources(path.join(directory, 'synthetic.db'), {
        productId: product.id, supplierId: supplier.id, portId: port.id,
        purchaseId: purchase.id, purchaseItemId: purchaseItem.id,
      }) : undefined;
  let receipt, sale;
  const receipts = require('../services/purchaseReceiptService');
  if (['warehouse', 'sales', 'boss'].includes(scenario)) {
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
  let receiptPool;
  if (scenario === 'receipt-pool') {
    // Only seed form-independent starting records. Browser allocation always uses
    // the unchanged authenticated finance route and its real SQLite transaction.
    const contracts = [];
    for (const [contractNo, totalAmount] of [['EXP-SYNTHETIC-POOL-A', 800], ['EXP-SYNTHETIC-POOL-B', 1000]]) {
      contracts.push(await db.salesContract.create({ data: { contractNo, totalAmount, amountSource: 'FORMAL_DOCUMENT', exchangeRate: 7.2, status: 'SHIPPED', portId: port.id } }));
    }
    const sources = {};
    for (const [currency, amount] of [['USD', 1000], ['CNY', 500]]) {
      sources[currency] = await db.payment.create({ data: { type: 'RECEIVABLE_RECEIPT', customerName: `合成收款池${currency}客户`, amount, currency, paymentMethod: 'BANK_TRANSFER', paymentDate: new Date('2026-10-01T00:00:00.000Z'), note: '合成手工分配验收来源' } });
    }
    receiptPool = {
      usdReceiptId: sources.USD.id, cnyReceiptId: sources.CNY.id,
      contracts: contracts.map(({ id, contractNo, totalAmount }) => ({ id, contractNo, totalAmount })),
    };
  }
  let taxRecords;
  let exportDocuments;
  let salesHeader;
  if (scenario === 'sales-header') {
    // Existing header inputs only. Cargo/amount facts are starting records;
    // ordinary edits never execute payment, shipment or document transactions.
    const nextPort = await db.port.create({ data: { name: '合成合同头补充港口', code: 'HEADER-NEXT' } });
    for (const item of [port, nextPort]) {
      await db.store.create({ data: { name: `合成合同头门店${item.code}`, portId: item.id } });
    }
    sale = await db.salesContract.create({ data: {
      contractNo: 'EXP-SYNTHETIC-HEADER', status: 'PACKING', portId: port.id,
      exchangeRate: 7.2, signedAt: new Date('2026-10-01T00:00:00.000Z'),
      estimatedArrival: new Date('2026-11-01T00:00:00.000Z'),
      totalAmount: 20, receivedAmount: 5, totalBoxes: 2, grossWeight: 20, netWeight: 18, volume: 0.2,
      note: '合成合同头已保存备注',
      packingItems: { create: { productId: product.id, purchaseItemId: purchaseItem.id,
        quantity: 10, unit: '件', boxes: 2, grossWeight: 20, netWeight: 18, volume: 0.2,
        length: 500, width: 500, height: 400, specification: '合成箱', origin: '合成产地',
        purchaseCost: 113, purchaseContractNo: purchase.contractNo, unitPrice: 2, totalPrice: 20,
        note: '合成装箱资料保持不变' } },
    } });
    salesHeader = { originalPortId: port.id, nextPortId: nextPort.id };
  }
  if (scenario === 'menu-export-documents') {
    // Only starting cargo/current tariff evidence. Document previews, generation
    // and downloads use unchanged routes; no uploads, filings or provider calls.
    await db.hsCode.create({ data: { hsCode: product.hsCode, productName: product.customsName,
      taxRate: 0, vatRate: 13, refundRate: 13, effectiveDate: new Date('2026-01-01') } });
    sale = await db.salesContract.create({ data: {
      contractNo: 'EXP-SYNTHETIC-MENU-DOCS', status: 'PACKING', portId: port.id,
      exchangeRate: 7.2, totalAmount: 20, totalBoxes: 2, grossWeight: 20, netWeight: 18, volume: 0.2,
      packingItems: { create: { productId: product.id, purchaseItemId: purchaseItem.id,
        quantity: 10, unit: '件', boxes: 2, grossWeight: 20, netWeight: 18, volume: 0.2,
        specification: '合成箱', origin: '合成产地', purchaseCost: 113,
        purchaseContractNo: purchase.contractNo, unitPrice: 2, totalPrice: 20 } },
    }, include: { packingItems: true } });
    exportDocuments = { packingItemId: sale.packingItems[0].id };
  }
  if (scenario === 'tax-record-forms') {
    // Form-independent starting records only. Browser create/update requests use
    // ordinary authenticated CRUD; no filing, confirmation or settlement route.
    sale = await db.salesContract.create({ data: {
      contractNo: 'EXP-SYNTHETIC-TAX-FORM', portId: port.id, exchangeRate: 7.2, status: 'DRAFT',
    } });
    const declaration = await db.customsDeclaration.create({ data: {
      declarationNo: 'CD-SYNTHETIC-FORM-SEED', salesContractId: sale.id, status: 'DRAFT',
      declaredAt: new Date('2026-10-01T00:00:00.000Z'), exportDate: null,
      customsBroker: '合成内部报关行', currency: 'USD', exchangeRate: 7.2,
      totalAmount: 100, totalQuantity: 10, totalGrossWeight: 12, totalNetWeight: 10,
      note: '合成报关已保存备注',
      items: { create: { productId: product.id, itemNo: 1, customsName: product.customsName,
        hsCode: product.hsCode, quantity: 10, unit: '件', unitPrice: 10, totalPrice: 100,
        declarationElements: '合成已保存申报要素' } },
    } });
    const refund = await db.taxRefund.create({ data: {
      refundNo: 'TR-SYNTHETIC-FORM-SEED', salesContractId: sale.id, customsDeclarationId: declaration.id,
      status: 'DRAFT', declaredAmount: 100, refundableAmount: 13, refundedAmount: 0,
      appliedAt: new Date('2026-10-01T00:00:00.000Z'), refundedAt: null,
      note: '合成退税已保存备注',
    } });
    taxRecords = { customsId: declaration.id, customsNo: declaration.declarationNo,
      refundId: refund.id, refundNo: refund.refundNo, contractId: sale.id, contractNo: sale.contractNo };
  }
  const app = require('../app'); // Imported app never starts scheduled/provider jobs.
  const server = app.listen(0, '127.0.0.1', () => process.send({
    baseURL: `http://127.0.0.1:${server.address().port}`,
    purchaseId: purchase.id, purchaseItemId: purchaseItem.id, productId: product.id,
    receiptId: receipt?.id, receiptItemId: receipt?.items[0].id, salesId: sale?.id, salesNo: sale?.contractNo,
    receiptPool, taxRecords, exportDocuments, salesHeader, dashboardSources,
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
