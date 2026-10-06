/**
 * Input: Isolated committed-migration role fixture and ordinary sales header HTTP routes
 * Output: Header save/readback and rejected-save/explicit-retry conservation checks
 * Pos: Synthetic SALES fixture acceptance; no browser, production or payment/shipment execution
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

/**
 * 职责：启动独占迁移 SQLite 和真实 SALES 登录，提供普通 HTTP 与只读快照。
 * 思路：建立私有目录并注册清理，等待真实后端启动，再校验权限和登录身份。
 * @param t 当前 Node 测试上下文，负责退出子进程和删除独占目录
 * @returns 夹具元数据、测试令牌、普通 HTTP 调用和独立只读快照工具
 * @throws 启动、权限、认证、HTTP 或 SQLite 核对失败
 */
async function headerFixture(t) {
  // 0. 建立独占私有目录，启动真实后端并注册清理。
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-role-browser-e2e-'));
  fs.chmodSync(directory, 0o700);
  const server = spawn(process.execPath, [path.join(__dirname, 'role-browser-server.js')], {
    env: { PATH: process.env.PATH, TMPDIR: os.tmpdir(), TZ: 'UTC', NODE_ENV: 'test',
      ROLE_BROWSER_TEST_DIR: directory, ROLE_BROWSER_TEST_SCENARIO: 'sales-header' },
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
  // 1. 等待启动元数据并核对 loopback 及目录/数据库权限。
  const f = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Synthetic header fixture startup timeout')), 40000);
    server.once('message', message => { clearTimeout(timeout); resolve(message); });
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', () => { clearTimeout(timeout); reject(new Error('Synthetic header fixture exited before startup')); });
  });
  assert.match(f.baseURL, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(directory, 'synthetic.db')).mode & 0o777, 0o600);
  /**
   * 职责：调用当前隔离后端的普通 JSON 路由，不替换业务响应。
   * @param method HTTP 方法
   * @param route /api/v1 后的路由及可选查询参数
   * @param body 请求 JSON；undefined 时不发送请求体
   * @param token 可选的当前合成用户 Bearer 令牌
   * @returns HTTP 状态、真实 JSON 响应及登录限流头
   * @throws 网络请求或 JSON 解析失败
   */
  const call = async (method, route, body, token) => {
    const response = await fetch(`${f.baseURL}/api/v1${route}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json(), limit: response.headers.get('x-ratelimit-limit') };
  };
  // 2. 通过现有登录路由取得令牌，核对数据库用户身份与角色。
  const login = await call('POST', '/auth/login', {
    username: f.users.SALES.username, password: 'test-only-role-browser-password-never-production',
  });
  assert.equal(login.status, 200);
  assert.equal(login.limit, '10');
  assert.equal(login.body.data.user.role, 'SALES');
  assert.equal(login.body.data.user.id, f.users.SALES.id);
  const token = login.body.data.token;
  /**
   * 职责：通过独立只读 SQLite 连接取得完整业务行和合同头审计。
   * 参数：无；读取当前夹具的独占 synthetic.db。
   * @returns 按表名组织的业务行与审计快照
   * @throws SQLite 读取、子进程超时或 JSON 解析失败
   */
  const snapshot = () => JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=['sales_contracts','sales_items','packing_items','inventories','payments','purchase_contracts','purchase_items','customs_declarations','customs_declaration_items','forex_verifications','tax_refunds','contract_files','sales_contract_files']
result={table:[dict(row) for row in c.execute('SELECT * FROM '+table+' ORDER BY id')] for table in tables}
result['audit']=[dict(row) for row in c.execute("SELECT * FROM operation_logs WHERE entity='SalesContract' ORDER BY id")]
print(json.dumps(result))
c.close()`, path.join(directory, 'synthetic.db')], { encoding: 'utf8', timeout: 10000 }));
  return { ...f, token, snapshot, call };
}

/**
 * 职责：只允许四个现有头字段与更新时间变化，其他业务事实逐行保持。
 * @param before 保存前的独立 SQLite 快照
 * @param after 保存后的独立 SQLite 快照
 * @param data 本次明确提交的四项已有合同头字段
 * @returns 无；完成头字段及其他业务表守恒断言
 * @throws 头字段、更新时间或无关业务事实不符合预期
 */
function assertHeaderChange(before, after, data) {
  const { updatedAt: beforeUpdatedAt, ...beforeHeader } = before.sales_contracts[0];
  const { updatedAt: afterUpdatedAt, ...afterHeader } = after.sales_contracts[0];
  assert.deepEqual(afterHeader, { ...beforeHeader, ...data,
    signedAt: Date.parse(data.signedAt), estimatedArrival: Date.parse(data.estimatedArrival) });
  assert.ok(Number.isFinite(beforeUpdatedAt) && Number.isFinite(afterUpdatedAt));
  for (const table of Object.keys(before)) {
    if (!['sales_contracts', 'audit'].includes(table)) assert.deepEqual(after[table], before[table], table);
  }
}
/**
 * 职责：为当前夹具构造全部四项已有合同头的普通补充草稿。
 * @param f 当前独占合同头夹具，包含已预置的下一目的港 ID
 * @returns 合成汇率、签订日期、预计到达和目的港字段
 */
const draftFor = f => ({ exchangeRate: 7.4, signedAt: '2026-10-03', estimatedArrival: '2026-11-03', portId: f.salesHeader.nextPortId });
/**
 * 职责：在固定五秒期限内等待真实成功保存产生一条合同头审计。
 * @param f 提供独立 SQLite 快照的当前合同头夹具
 * @returns 完成唯一审计断言的 Promise<void>
 * @throws 期限内审计数量不为一或快照读取失败
 */
const waitForAudit = async f => {
  const deadline = Date.now() + 5000;
  while (f.snapshot().audit.length !== 1 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(f.snapshot().audit.length, 1);
};

test('sales header HTTP: ordinary supplement preserves cargo/amount facts and independent authenticated readback', { timeout: 60000 }, async t => {
  const f = await headerFixture(t);
  const route = `/sales/${f.salesId}`;
  const before = f.snapshot();
  // The real editor requires the existing full store DTO's port relation.
  const stores = await f.call('GET', '/stores?pageSize=100', undefined, f.token);
  assert.equal(stores.status, 200);
  assert.deepEqual(stores.body.data.items.map(store => store.port.id).sort(), [f.salesHeader.originalPortId, f.salesHeader.nextPortId].sort());
  const liteStores = await f.call('GET', '/stores?pageSize=100&lite=true', undefined, f.token);
  assert.ok(liteStores.body.data.items.every(store => store.port === undefined));
  assert.equal(before.sales_contracts[0].totalAmount, 20);
  assert.equal(before.sales_contracts[0].receivedAmount, 5);
  assert.equal(before.packing_items.length, 1);
  assert.equal((await f.call('GET', route, undefined, f.token)).status, 200);
  assert.deepEqual(f.snapshot(), before); // Opening and cancel-equivalent reads never write.
  const draft = draftFor(f);
  const saved = await f.call('PUT', route, draft, f.token);
  assert.equal(saved.status, 200);
  await waitForAudit(f);
  const after = f.snapshot();
  assertHeaderChange(before, after, draft);
  assert.equal(after.audit[0].entityId, f.salesId);
  assert.equal(after.audit[0].userId, f.users.SALES.id);
  assert.equal(after.audit[0].action, 'UPDATE');
  for (let read = 0; read < 2; read += 1) {
    const response = await f.call('GET', route, undefined, f.token);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.exchangeRate, 7.4);
    assert.equal(response.body.data.port.id, f.salesHeader.nextPortId);
    assert.equal(response.body.data.signedAt, '2026-10-03T00:00:00.000Z');
    assert.equal(response.body.data.estimatedArrival, '2026-11-03T00:00:00.000Z');
    assert.equal(response.body.data.packingItems[0].id, before.packing_items[0].id);
    assert.equal(response.body.data.totalAmount, 20);
    assert.equal(response.body.data.receivedAmount, 5);
    assert.deepEqual(f.snapshot(), after);
  }
});

test('sales header HTTP: genuine rejected save is atomic and only corrected explicit retry persists', { timeout: 60000 }, async t => {
  const f = await headerFixture(t);
  const route = `/sales/${f.salesId}`;
  const before = f.snapshot();
  const draft = draftFor(f);
  const rejected = await f.call('PUT', route, { ...draft, exchangeRate: 0 }, f.token);
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.message, /汇率必须为正数/);
  assert.deepEqual(f.snapshot(), before);
  assert.equal((await f.call('GET', route, undefined, f.token)).body.data.port.id, f.salesHeader.originalPortId);
  assert.deepEqual(f.snapshot(), before);
  const retried = await f.call('PUT', route, draft, f.token);
  assert.equal(retried.status, 200);
  await waitForAudit(f);
  assertHeaderChange(before, f.snapshot(), draft);
  assert.equal(f.snapshot().audit[0].userId, f.users.SALES.id);
});
