/**
 * Input: Real role fixture, committed migrations, ordinary HTTP routes and synthetic XLSX
 * Output: Role/business, internal form and six menu-document fixture contract checks
 * Pos: Backend HTTP/SQLite acceptance; no browser execution or production/provider access
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const password = 'test-only-role-browser-password-never-production';

/**
 * 职责：创建私有角色夹具并提供真实登录、HTTP 和独立只读工具
 * @param t 注册清理的当前测试上下文
 * @param scenario 明确允许的合成业务场景
 * @param temporaryRoot 隔离临时根目录，默认系统临时目录
 * @returns 夹具元数据、私有目录及读取/请求/登录工具
 * @throws 启动超时、权限或真实登录断言失败
 */
async function fixtureFor(t, scenario, temporaryRoot = os.tmpdir()) {
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'jiesong-role-browser-e2e-'));
  fs.chmodSync(directory, 0o700);
  const server = spawn(process.execPath, [path.join(__dirname, 'role-browser-server.js')], {
    // Keep os.tmpdir() consistent without inheriting provider or database credentials.
    env: { PATH: process.env.PATH, TMPDIR: temporaryRoot, TZ: 'UTC', NODE_ENV: 'test', ROLE_BROWSER_TEST_DIR: directory, ROLE_BROWSER_TEST_SCENARIO: scenario },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      await new Promise(resolve => {
        const timeout = setTimeout(() => server.kill('SIGKILL'), 5000);
        server.once('exit', () => { clearTimeout(timeout); resolve(); });
        server.kill('SIGTERM');
      });
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const metadata = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Synthetic role fixture startup timeout')), 40000);
    server.once('message', message => { clearTimeout(timeout); resolve(message); });
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', () => { clearTimeout(timeout); reject(new Error('Synthetic role fixture exited before startup')); });
  });
  assert.match(metadata.baseURL, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(directory, 'synthetic.db')).mode & 0o777, 0o600);
  const read = (sql) => JSON.parse(execFileSync('python3', ['-c', 'import sqlite3,sys,json; c=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); c.row_factory=sqlite3.Row; print(json.dumps([dict(row) for row in c.execute(sys.argv[2])])); c.close()', path.join(directory, 'synthetic.db'), sql], { encoding: 'utf8' }));
  const call = async (method, route, data, token) => {
    const response = await fetch(`${metadata.baseURL}/api/v1${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    return { status: response.status, body: await response.json(), limit: response.headers.get('x-ratelimit-limit') };
  };
  const login = async role => {
    const response = await call('POST', '/auth/login', { username: metadata.users[role].username, password });
    assert.equal(response.status, 200);
    assert.equal(response.limit, '10'); // Existing login limiter is active, without a test bypass.
    assert.equal(response.body.data.user.role, role);
    assert.equal(response.body.data.user.id, metadata.users[role].id);
    return response.body.data.token;
  };
  return { ...metadata, directory, read, call, login };
}

test('role browser fixture: custom temporary root starts with private SQLite and real login', { timeout: 60000 }, async t => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-role-fixture-root-'));
  fs.chmodSync(temporaryRoot, 0o700);
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  // The nested fixture closes before its parent temporary root is removed.
  await t.test('child preserves the selected temporary root', async child => {
    const f = await fixtureFor(child, 'purchase', temporaryRoot);
    await f.login('PURCHASE');
    assert.deepEqual(f.read('SELECT COUNT(*) count FROM users'), [{ count: 5 }]);
  });
});

test('role browser fixture: own notification mark-one persists once under repeated HTTP completion', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'notification-state');
  const token = await f.login('PURCHASE');
  const before = f.read('SELECT * FROM notifications ORDER BY id');
  assert.equal(before.length, 4);
  assert.ok(before.every(row => row.userId === f.users.PURCHASE.id));
  assert.equal(before.filter(row => !row.isRead).length, 3);
  const notification = before.find(row => row.title === '合成通知 1');
  const results = await Promise.all([
    f.call('POST', `/notifications/${notification.id}/read`, undefined, token),
    f.call('POST', `/notifications/${notification.id}/read`, undefined, token),
  ]);
  results.forEach(response => assert.equal(response.status, 200));
  assert.deepEqual(f.read('SELECT * FROM notifications ORDER BY id'), before.map(row => row.id === notification.id ? { ...row, isRead: 1 } : row));
  const count = await f.call('GET', '/notifications/unread-count', undefined, token);
  assert.equal(count.status, 200);
  assert.equal(count.body.data.count, 2);
});

test('role browser fixture: PURCHASE authenticates and arrival is persisted without eligible stock', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'purchase');
  const token = await f.login('PURCHASE');
  const response = await f.call('POST', `/purchases/${f.purchaseId}/receipts`, {
    requestId: 'synthetic-local-arrival', arrivedAt: '2026-10-01', note: '合成到货',
    items: [{ purchaseItemId: f.purchaseItemId, arrivedQuantity: 40 }],
  }, token);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data.summary.totals, { orderedQuantity: 100, arrivedQuantity: 40, acceptedQuantity: 0, pendingQuantity: 40, reinspectionQuantity: 0 });
  assert.deepEqual(f.read('SELECT createdById FROM purchase_receipts'), [{ createdById: f.users.PURCHASE.id }]);
  assert.deepEqual(f.read('SELECT quantity FROM inventories'), []);
});

test('role browser fixture: WAREHOUSE inspection persists operator, held quantity and sourced inventory', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'warehouse');
  const token = await f.login('WAREHOUSE');
  const response = await f.call('POST', `/purchases/${f.purchaseId}/receipts/${f.receiptId}/inspection`, {
    requestId: 'synthetic-local-inspection', note: '合成部分合格',
    items: [{ receiptItemId: f.receiptItemId, acceptedQuantity: 30, reinspectionQuantity: 10 }],
  }, token);
  assert.equal(response.status, 200);
  assert.deepEqual(f.read('SELECT inspectedById,acceptedIncrement,pendingQuantity,reinspectionQuantity FROM purchase_receipt_inspections'), [{ inspectedById: f.users.WAREHOUSE.id, acceptedIncrement: 30, pendingQuantity: 0, reinspectionQuantity: 10 }]);
  const rows = f.read('SELECT quantity,status,purchaseItemId,receiptInspectionId FROM inventories');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 30);
  assert.equal(rows[0].status, 'INBOUND');
  assert.equal(rows[0].purchaseItemId, f.purchaseItemId);
  assert.ok(rows[0].receiptInspectionId);
  assert.equal((await f.call('GET', '/inventory', undefined, token)).status, 200);
});

test('role browser fixture: SALES guard rolls back, warehouse releases stock and shipping is idempotent', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'sales');
  const sales = await f.login('SALES');
  assert.equal((await f.call('POST', `/purchases/${f.purchaseId}/receipts`, {}, sales)).status, 403);
  const rejected = await f.call('PUT', `/sales/${f.salesId}/status`, { status: 'SHIPPED' }, sales);
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.message, /库存不足/);
  assert.deepEqual(f.read('SELECT status,shippedAt FROM sales_contracts'), [{ status: 'PACKING', shippedAt: null }]);
  assert.deepEqual(f.read('SELECT quantity,status FROM inventories'), [{ quantity: 30, status: 'INBOUND' }]);
  const warehouse = await f.login('WAREHOUSE');
  const inspected = await f.call('POST', `/purchases/${f.purchaseId}/receipts/${f.receiptId}/inspection`, {
    requestId: 'synthetic-local-release', note: '合成复验合格60件',
    items: [{ receiptItemId: f.receiptItemId, acceptedQuantity: 60, reinspectionQuantity: 40 }],
  }, warehouse);
  assert.equal(inspected.status, 200);
  assert.equal((await f.call('PUT', `/sales/${f.salesId}/status`, { status: 'SHIPPED' }, sales)).status, 200);
  const rows = f.read('SELECT status,SUM(quantity) quantity FROM inventories GROUP BY status ORDER BY status');
  assert.deepEqual(rows, [{ status: 'INBOUND', quantity: 10 }, { status: 'OUTBOUND', quantity: 50 }]);
  const sources = f.read('SELECT i.receiptInspectionId,p.id inspectionId FROM inventories i LEFT JOIN purchase_receipt_inspections p ON p.id=i.receiptInspectionId');
  assert.ok(sources.every(row => row.receiptInspectionId && row.receiptInspectionId === row.inspectionId));
  assert.equal((await f.call('PUT', `/sales/${f.salesId}/status`, { status: 'SHIPPED' }, sales)).status, 200);
  assert.deepEqual(f.read('SELECT status,SUM(quantity) quantity FROM inventories GROUP BY status ORDER BY status'), rows);
});

test('role browser fixture: BOSS permitted reads succeed and attempted mutation preserves DB', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'boss');
  const boss = await f.login('BOSS');
  for (const route of [`/purchases/${f.purchaseId}`, `/purchases/${f.purchaseId}/receipts`, `/sales/${f.salesId}`, `/contracts/${f.salesId}/files?contractType=SALES`]) {
    assert.equal((await f.call('GET', route, undefined, boss)).status, 200);
  }
  const before = f.read('SELECT status,shippedAt FROM sales_contracts');
  const denied = await f.call('PUT', `/sales/${f.salesId}/status`, { status: 'SHIPPED' }, boss);
  assert.equal(denied.status, 403);
  assert.match(denied.body.message, /老板角色仅可查看业务/);
  assert.deepEqual(f.read('SELECT status,shippedAt FROM sales_contracts'), before);
});

const readPool = f => ({
  payments: f.read('SELECT id,type,sourcePaymentId,salesContractId,amount,currency,customerName,paymentMethod,paymentDate,note FROM payments ORDER BY id'),
  contracts: f.read('SELECT id,contractNo,totalAmount,receivedAmount FROM sales_contracts ORDER BY contractNo'),
});

test('role browser fixture: FINANCE partial split preserves source and readback consumes only remainder', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'receipt-pool');
  const finance = await f.login('FINANCE');
  const { usdReceiptId, cnyReceiptId, contracts: [first, second] } = f.receiptPool;
  const original = readPool(f).payments.find(row => row.id === usdReceiptId);
  const split = await f.call('POST', `/finance/payments/${usdReceiptId}/allocate`, {
    allocations: [{ salesContractId: first.id, amount: 300 }, { salesContractId: second.id, amount: 200 }],
  }, finance);
  assert.equal(split.status, 200);
  const partial = readPool(f);
  assert.deepEqual(partial.payments.find(row => row.id === usdReceiptId), original);
  const allocations = partial.payments.filter(row => row.sourcePaymentId === usdReceiptId);
  assert.equal(allocations.length, 2);
  assert.deepEqual(allocations.map(row => [row.salesContractId, row.amount]).sort(), [[first.id, 300], [second.id, 200]].sort());
  assert.ok(allocations.every(row => row.type === 'RECEIVABLE_COLLECTION' && row.currency === 'USD'));
  assert.deepEqual(partial.contracts.map(row => row.receivedAmount), [300, 200]);
  const pool = await f.call('GET', '/finance/unallocated-payments', undefined, finance);
  assert.equal(pool.status, 200);
  assert.equal(pool.body.data.find(row => row.id === usdReceiptId).remainingAmount, 500);
  const contract = await f.call('GET', `/sales/${first.id}`, undefined, finance);
  assert.equal(contract.status, 200);
  assert.equal(contract.body.data.receivedAmount, 300);
  const receivables = await f.call('GET', '/finance/receivables?page=1&pageSize=100&outstandingOnly=true', undefined, finance);
  assert.equal(receivables.status, 200);
  assert.deepEqual(receivables.body.data.items.map(row => [row.contractNo, row.receivedAmount, row.unreceiveAmount]).sort(), [[first.contractNo, 300, 500], [second.contractNo, 200, 800]].sort());
  const remainder = await f.call('POST', `/finance/payments/${usdReceiptId}/allocate`, {
    allocations: [{ salesContractId: second.id, amount: 500 }],
  }, finance);
  assert.equal(remainder.status, 200);
  const full = readPool(f);
  assert.deepEqual(full.payments.find(row => row.id === usdReceiptId), { ...original, type: 'RECEIVABLE_RECEIPT_ALLOCATED' });
  assert.equal(full.payments.filter(row => row.sourcePaymentId === usdReceiptId).length, 3);
  assert.equal(full.payments.filter(row => row.sourcePaymentId === usdReceiptId).reduce((sum, row) => sum + row.amount, 0), original.amount);
  assert.deepEqual(full.contracts.map(row => row.receivedAmount), [300, 700]);
  const remainingPool = await f.call('GET', '/finance/unallocated-payments', undefined, finance);
  assert.equal(remainingPool.status, 200);
  assert.deepEqual(remainingPool.body.data.map(row => [row.id, row.remainingAmount]), [[cnyReceiptId, 500]]);
});

test('role browser fixture: FINANCE rejected CNY retries preserve both source and contracts', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'receipt-pool');
  const finance = await f.login('FINANCE');
  const { cnyReceiptId, contracts: [contract] } = f.receiptPool;
  const before = readPool(f);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rejected = await f.call('POST', `/finance/payments/${cnyReceiptId}/allocate`, {
      allocations: [{ salesContractId: contract.id, amount: 125 }],
    }, finance);
    assert.equal(rejected.status, 400);
    assert.match(rejected.body.message, /只支持 USD/);
    assert.deepEqual(readPool(f), before);
  }
});

test('role browser fixture: BOSS reads receipt balances but allocation and automatch are forbidden', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'receipt-pool');
  const boss = await f.login('BOSS');
  const { usdReceiptId, contracts: [contract] } = f.receiptPool;
  const before = readPool(f);
  for (const route of ['/finance/unallocated-payments', '/finance/receivables', `/sales/${contract.id}`]) {
    assert.equal((await f.call('GET', route, undefined, boss)).status, 200);
  }
  for (const [route, data] of [
    [`/finance/payments/${usdReceiptId}/allocate`, { allocations: [{ salesContractId: contract.id, amount: 100 }] }],
    ['/finance/payments/auto-match', {}],
  ]) {
    const denied = await f.call('POST', route, data, boss);
    assert.equal(denied.status, 403);
    assert.match(denied.body.message, /老板角色仅可查看业务/);
    assert.deepEqual(readPool(f), before);
  }
});

for (const kind of ['customs', 'refunds']) {
  test(`role browser fixture: FINANCE internal ${kind} forms use migrated SQLite, reject duplicate then create/edit/read back`, { timeout: 60000 }, async t => {
    const f = await fixtureFor(t, 'tax-record-forms');
    const token = await f.login('FINANCE');
    const seed = f.taxRecords;
    const route = kind === 'customs' ? '/customs-declarations' : '/tax-refunds';
    const table = kind === 'customs' ? 'customs_declarations' : 'tax_refunds';
    const numberField = kind === 'customs' ? 'declarationNo' : 'refundNo';
    const payload = kind === 'customs' ? {
      declarationNo: seed.customsNo, salesContractId: seed.contractId, status: 'DRAFT',
      declaredAt: '2026-10-02', exportDate: '2026-10-03', customsBroker: '合成内部报关行', currency: 'USD', exchangeRate: 7.2,
      totalAmount: 200, totalQuantity: 20, totalGrossWeight: 24, totalNetWeight: 20, note: '合成新建记录',
      items: [{ productId: f.productId, itemNo: 1, customsName: '合成内部表单商品', hsCode: '9999999999', quantity: 20, unit: '件', unitPrice: 10, totalPrice: 200, declarationElements: '合成申报要素' }],
    } : {
      refundNo: seed.refundNo, salesContractId: seed.contractId, customsDeclarationId: seed.customsId, forexVerificationId: null, status: 'DRAFT',
      declaredAmount: 200, refundableAmount: 26, refundedAmount: 0, appliedAt: '2026-10-02', refundedAt: null, note: '合成新建记录',
    };
    const snapshot = () => ({
      customs: f.read('SELECT * FROM customs_declarations ORDER BY id'),
      items: f.read('SELECT * FROM customs_declaration_items ORDER BY id'),
      refunds: f.read('SELECT * FROM tax_refunds ORDER BY id'),
      audit: f.read("SELECT * FROM operation_logs WHERE entity IN ('CustomsDeclaration','TaxRefund') ORDER BY id"),
    });
    const before = snapshot();
    assert.ok(f.read('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL').length > 10);
    assert.equal((await f.call('POST', route, payload, token)).status, 500);
    assert.deepEqual(snapshot(), before);
    payload[numberField] = `${kind === 'customs' ? 'CD' : 'TR'}-SYNTHETIC-HTTP-NEW`;
    const created = await f.call('POST', route, payload, token);
    assert.equal(created.status, 201);
    const id = created.body.data.id;
    const waitAudit = async count => {
      const deadline = Date.now() + 5000;
      while (snapshot().audit.length !== count && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(snapshot().audit.length, count);
    };
    await waitAudit(1);
    const saved = snapshot();
    assert.equal(f.read(`SELECT * FROM ${table}`).length, 2);
    assert.equal(saved.audit[0].userId, f.users.FINANCE.id);
    assert.equal(saved.audit[0].entityId, id);
    const readback = await f.call('GET', `${route}/${id}`, undefined, token);
    assert.equal(readback.status, 200);
    const dateField = kind === 'customs' ? 'declaredAt' : 'appliedAt';
    assert.equal(readback.body.data[dateField], '2026-10-02T00:00:00.000Z');
    const editedPayload = { ...payload, note: '合成内部记录编辑后备注' };
    if (kind === 'customs') editedPayload.items = readback.body.data.items.map(({ id: itemId }) => ({ ...payload.items[0], id: itemId }));
    const updated = await f.call('PUT', `${route}/${id}`, editedPayload, token);
    assert.equal(updated.status, 200);
    await waitAudit(2);
    const edited = snapshot();
    const record = f.read(`SELECT * FROM ${table}`).find(row => row.id === id);
    const original = (kind === 'customs' ? saved.customs : saved.refunds).find(row => row.id === id);
    assert.deepEqual({ ...record, updatedAt: original.updatedAt }, { ...original, note: editedPayload.note });
    if (kind === 'customs') {
      const item = edited.items.find(row => row.customsDeclarationId === id);
      const prior = saved.items.find(row => row.customsDeclarationId === id);
      assert.deepEqual({ ...item, updatedAt: prior.updatedAt }, prior);
    }
    assert.equal(edited.audit[1].action, 'UPDATE');
    assert.equal(edited.audit[1].userId, f.users.FINANCE.id);
    const reloaded = await f.call('GET', `${route}/${id}`, undefined, token);
    assert.equal(reloaded.status, 200);
    assert.equal(reloaded.body.data.note, editedPayload.note);
    assert.equal(reloaded.body.data[dateField], '2026-10-02T00:00:00.000Z');
    assert.equal(reloaded.body.data.status, 'DRAFT');
    if (kind === 'refunds') assert.equal(reloaded.body.data.refundedAmount, 0);
    assert.deepEqual(snapshot(), edited);
  });
}

// Bounded mirror of the six hosted menu/document cases. All requests use the
// production Express routes, actual role login and committed-migration SQLite.
/**
 * 职责：从独立只读连接核对生成文档相关的全部业务行
 * @param f 当前合成角色 HTTP 夹具
 * @returns 按表名组织的单据、装箱和归档快照
 * @throws SQLite 读取或 JSON 解析失败
 */
const documentSnapshot = f => Object.fromEntries([
  'sales_contracts', 'packing_items', 'customs_declarations',
  'customs_declaration_items', 'forex_verifications', 'tax_refunds', 'contract_files', 'sales_contract_files',
].map(table => [table, f.read(`SELECT * FROM ${table} ORDER BY id`)]));
/**
 * 职责：构造全部三张内部单据的确定性生成输入
 * @param f 带合成合同、商品和装箱行 ID 的夹具
 * @returns 沿用档案 HS 来源及全部三表选择的请求数据
 * @throws 夹具缺少预置文档元数据
 */
const formsInput = f => ({ salesContractId: f.salesId,
  items: [{ packingItemId: f.exportDocuments.packingItemId, productId: f.productId,
    hsCode: '9999999999', hsSource: 'stored' }],
  generateCustoms: true, generateForex: true, generateTaxRefund: true });
const packetInput = { spotRate: 7.2, sellerName: '合成卖方', buyerName: '合成买方',
  packageKind: 'CARTON', tradeTerm: 'FOB', documentDate: '2026-10-01' };
/**
 * 职责：经真实角色 HTTP 生成全部内部单据并核对成功响应
 * @param f 当前合成角色 HTTP 夹具
 * @param token 当前合成 SALES 用户的登录令牌
 * @returns 真正生成的记录 ID 与警示数据
 * @throws 请求失败或状态断言不通过
 */
const generated = async (f, token) => {
  const response = await f.call('POST', '/three-forms/generate', formsInput(f), token);
  assert.equal(response.status, 200, response.body.message);
  return response.body.data;
};
/**
 * 职责：限定导出参数为此次明确生成的三条记录 ID
 * @param ids 一次真实生成响应中的单据 ID
 * @returns 精确指定报关、核销与退税记录的查询参数
 * @throws 参数构造失败
 */
const formsQuery = ids => new URLSearchParams({ customsDeclarationId: ids.customsDeclarationId, forexId: ids.forexId, taxRefundId: ids.taxRefundId });
/**
 * 职责：认证下载真实工作簿并解析其完整字节
 * @param f 当前合成角色 HTTP 夹具
 * @param token 当前合成 SALES 用户的登录令牌
 * @param route 不含 API 前缀的受保护下载路径
 * @returns 下载字节、解析的 ExcelJS 工作簿及文件名响应头
 * @throws 请求、格式断言或 XLSX 解析失败
 */
const binary = async (f, token, route) => {
  const response = await fetch(`${f.baseURL}/api/v1${route}`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /spreadsheetml/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  const workbook = new (require('exceljs').Workbook)();
  await workbook.xlsx.load(bytes);
  return { bytes, workbook, disposition: response.headers.get('content-disposition') };
};

test('menu documents HTTP: prerequisites and discarded previews leave migrated records unchanged', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'menu-export-documents');
  const token = await f.login('SALES');
  assert.ok(f.read('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL').length > 10);
  const before = documentSnapshot(f);
  const input = formsInput(f);
  input.items[0].hsSource = 'manual';
  input.items[0].hsCode = '9999999998';
  const blocked = await f.call('POST', '/three-forms/preview', input, token);
  assert.equal(blocked.status, 200);
  assert.equal(blocked.body.data.customsReady, false);
  assert.equal(blocked.body.data.taxRefundReady, false);
  assert.ok(blocked.body.data.issues.some(issue => issue.code === 'HS_CURRENT_EVIDENCE_MISSING'));
  assert.equal((await f.call('POST', '/three-forms/generate', input, token)).status, 400);
  const ready = await f.call('POST', '/three-forms/preview', formsInput(f), token);
  assert.equal(ready.status, 200);
  assert.equal(ready.body.data.customsReady, true);
  assert.equal(ready.body.data.taxRefundReady, true);
  assert.deepEqual(documentSnapshot(f), before);
});

test('menu documents HTTP: three forms generate linked drafts, read back and retain XLSX title/header/content', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'menu-export-documents');
  const token = await f.login('SALES');
  const ids = await generated(f, token);
  const rows = documentSnapshot(f);
  assert.equal(rows.customs_declarations.length, 1);
  assert.equal(rows.forex_verifications.length, 1);
  assert.equal(rows.tax_refunds.length, 1);
  assert.equal(rows.customs_declarations[0].status, 'DRAFT');
  assert.equal(rows.forex_verifications[0].status, 'PENDING');
  assert.equal(rows.tax_refunds[0].status, 'DRAFT');
  assert.equal(rows.tax_refunds[0].refundedAmount, 0);
  assert.equal(rows.tax_refunds[0].declaredAmount, 100);
  assert.equal(rows.tax_refunds[0].refundableAmount, 13);
  assert.equal(rows.customs_declarations[0].totalAmount, 20);
  assert.equal(rows.customs_declaration_items[0].packingItemId, f.exportDocuments.packingItemId);
  assert.equal(rows.forex_verifications[0].customsDeclarationId, ids.customsDeclarationId);
  assert.equal(rows.tax_refunds[0].customsDeclarationId, ids.customsDeclarationId);
  assert.equal(rows.tax_refunds[0].forexVerificationId, ids.forexId);
  for (const [route, id] of [['customs-declarations', ids.customsDeclarationId], ['forex-verifications', ids.forexId], ['tax-refunds', ids.taxRefundId]]) {
    const result = await f.call('GET', `/${route}/${id}`, undefined, token);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.salesContractId, f.salesId);
  }
  const query = formsQuery(ids);
  const { workbook, disposition } = await binary(f, token, `/three-forms/export/${f.salesId}?${query}`);
  assert.match(decodeURIComponent(disposition), new RegExp(f.salesNo));
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['报关单', '外汇核销单', '出口退税申报表']);
  const customs = workbook.getWorksheet('报关单');
  assert.equal(customs.getCell('A1').value, `出口货物报关单 — ${f.salesNo}`);
  assert.equal(customs.getCell('B2').value, rows.customs_declarations[0].declarationNo);
  assert.equal(customs.getRow(1).height, 36);
  assert.equal(customs.getRow(4).height, 28);
  assert.equal(customs.getCell('A4').font.bold, true);
  assert.equal(customs.getCell('A4').fill.fgColor.argb, 'FF1E40AF');
  assert.deepEqual(customs.getRow(4).values.slice(1), ['序号', '商品名称', 'HS 编码', '数量', '单位', '单价 (USD)', '总价 (USD)', '申报要素']);
  assert.deepEqual(customs.getRow(5).values.slice(1), [1, '合成角色验收商品', '9999999999', 10, '件', 2, 20, '合成测试要素']);
  assert.equal(workbook.getWorksheet('外汇核销单').getCell('B6').value, '20.00');
  assert.equal(workbook.getWorksheet('出口退税申报表').getCell('B4').value, '100.00');
  assert.equal(workbook.getWorksheet('出口退税申报表').getCell('B5').value, '13.00');
  assert.deepEqual(documentSnapshot(f), rows, 'export/readback are read-only');
});

test('menu documents HTTP: explicit repeated generation preserves existing append-version contract and exact export IDs', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'menu-export-documents');
  const token = await f.login('SALES');
  const first = await generated(f, token);
  const second = await generated(f, token);
  assert.notEqual(second.customsDeclarationId, first.customsDeclarationId);
  const rows = documentSnapshot(f);
  assert.deepEqual(rows.customs_declarations.map(row => row.declarationNo).sort(), ['BGP-SYNTHETIC-MENU-DOCS', 'BGP-SYNTHETIC-MENU-DOCS-2']);
  for (const ids of [first, second]) {
    const declaration = rows.customs_declarations.find(row => row.id === ids.customsDeclarationId);
    const forex = rows.forex_verifications.find(row => row.id === ids.forexId);
    const refund = rows.tax_refunds.find(row => row.id === ids.taxRefundId);
    assert.equal(forex.customsDeclarationId, declaration.id);
    assert.equal(refund.customsDeclarationId, declaration.id);
    assert.equal(refund.forexVerificationId, forex.id);
    const { workbook } = await binary(f, token, `/three-forms/export/${f.salesId}?${formsQuery(ids)}`);
    assert.equal(workbook.getWorksheet('报关单').getCell('B2').value, declaration.declarationNo);
    assert.equal(workbook.getWorksheet('外汇核销单').getCell('B2').value, forex.verificationNo);
    assert.equal(workbook.getWorksheet('出口退税申报表').getCell('B2').value, refund.refundNo);
  }
  assert.deepEqual(documentSnapshot(f), rows);
});

test('menu documents HTTP: commercial preview validates metadata and cancel-equivalent remains read-only', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'menu-export-documents');
  const token = await f.login('SALES');
  const before = documentSnapshot(f);
  const route = `/sales/${f.salesId}/export-packet/preview`;
  assert.equal((await f.call('POST', route, { ...packetInput, buyerName: '' }, token)).status, 400);
  const preview = await f.call('POST', route, packetInput, token);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.data.ready, true);
  assert.equal(preview.body.data.lines[0].productName, '合成角色验收商品');
  assert.equal(preview.body.data.summary.purchaseCostCny, 113);
  assert.equal(preview.body.data.summary.totalUsd, 20);
  assert.deepEqual(documentSnapshot(f), before);
});

test('menu documents HTTP: commercial generation archives private workbook and repeated download preserves bytes', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'menu-export-documents');
  const token = await f.login('SALES');
  const result = await f.call('POST', `/sales/${f.salesId}/export-packet/generate`, packetInput, token);
  assert.equal(result.status, 201);
  const { file, packet } = result.body.data;
  const saved = documentSnapshot(f);
  assert.equal(saved.sales_contract_files.length, 1);
  assert.equal(saved.sales_contract_files[0].id, file.id);
  const physical = path.resolve(f.directory, 'uploads', saved.sales_contract_files[0].filePath);
  assert.equal(fs.statSync(path.dirname(physical)).mode & 0o777, 0o700);
  assert.equal(fs.statSync(physical).mode & 0o777, 0o600);
  const first = await binary(f, token, `/files/${file.id}/download`);
  const repeated = await binary(f, token, `/files/${file.id}/download`);
  assert.deepEqual(first.bytes, repeated.bytes);
  assert.deepEqual(first.bytes, fs.readFileSync(physical));
  assert.equal(first.bytes.length, file.fileSize);
  assert.deepEqual(first.workbook.worksheets.map(sheet => sheet.name), ['外销合同', '商业发票', '装箱单']);
  for (const name of ['外销合同', '商业发票']) {
    const sheet = first.workbook.getWorksheet(name);
    assert.equal(sheet.getCell('B4').value, packetInput.sellerName);
    assert.equal(sheet.getCell('B5').value, packetInput.buyerName);
    assert.equal(sheet.getCell('G5').value, packetInput.documentDate);
    assert.equal(sheet.getCell('B10').value, '合成角色验收商品');
    assert.equal(sheet.getCell('H10').value, packet.summary.totalUsd);
  }
  assert.equal(first.workbook.getWorksheet('装箱单').getCell('F10').value, 2);
  assert.equal(first.workbook.getWorksheet('装箱单').getCell('G10').value, 20);
  assert.equal(saved.packing_items[0].unitPrice, packet.lines[0].unitPriceUsd);
  assert.deepEqual(documentSnapshot(f), saved);
});

test('menu documents HTTP: changed prerequisite causes genuine generation failure, explicit repair retries once', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'menu-export-documents');
  const token = await f.login('SALES');
  assert.equal((await f.call('POST', '/three-forms/preview', formsInput(f), token)).body.data.customsReady, true);
  const route = `/sales/${f.salesId}/packing-items/${f.exportDocuments.packingItemId}`;
  assert.equal((await f.call('PUT', route, { unitPrice: 0 }, token)).status, 200);
  const changed = documentSnapshot(f);
  const failed = await f.call('POST', '/three-forms/generate', formsInput(f), token);
  assert.equal(failed.status, 400);
  assert.match(failed.body.message, /缺少出口单价/);
  assert.deepEqual(documentSnapshot(f), changed);
  assert.equal((await f.call('PUT', route, { unitPrice: 2 }, token)).status, 200);
  await generated(f, token);
  const saved = documentSnapshot(f);
  assert.equal(saved.customs_declarations.length, 1);
  assert.equal(saved.forex_verifications.length, 1);
  assert.equal(saved.tax_refunds.length, 1);
});
