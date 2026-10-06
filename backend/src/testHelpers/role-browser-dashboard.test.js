/**
 * Input: Real Express/auth, committed migrations and independently seeded synthetic SQLite
 * Output: Dashboard KPI/funds, historical risk/task, trace and current-role destination evidence
 * Pos: Workbench read acceptance; no reports, browser, production or provider requests
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
 * 职责：启动已提交迁移的独占合成库与真实角色登录，提供无响应替换的 HTTP。
 * @param t 当前测试上下文，负责终止后端和删除独占临时目录
 * @returns 夹具元数据、两个真实登录令牌、HTTP 和独立只读快照
 * @throws 迁移、启动、权限、登录或快照读取失败
 */
async function dashboardFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-role-browser-e2e-'));
  fs.chmodSync(directory, 0o700);
  const server = spawn(process.execPath, [path.join(__dirname, 'role-browser-server.js')], {
    env: { PATH: process.env.PATH, TMPDIR: os.tmpdir(), TZ: 'UTC', NODE_ENV: 'test',
      ROLE_BROWSER_TEST_DIR: directory, ROLE_BROWSER_TEST_SCENARIO: 'dashboard-sources' },
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
  const f = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Synthetic dashboard fixture startup timeout')), 40000);
    server.once('message', message => { clearTimeout(timeout); resolve(message); });
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', () => { clearTimeout(timeout); reject(new Error('Synthetic dashboard fixture exited before startup')); });
  });
  assert.match(f.baseURL, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(directory, 'synthetic.db')).mode & 0o777, 0o600);
  /**
   * 职责：读取真实路由响应，只有登录发送普通测试账号数据。
   * @param route /api/v1 后的路由及查询参数
   * @param token 当前真实认证角色令牌，可省略以验证未登录拒绝
   * @param body 仅登录使用的合成 JSON 请求体
   * @returns HTTP 状态、数据及限流头
   * @throws 请求或 JSON 解析失败
   */
  const call = async (route, token, body) => {
    const response = await fetch(`${f.baseURL}/api/v1${route}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json(), limit: response.headers.get('x-ratelimit-limit') };
  };
  const tokens = {};
  for (const role of ['PURCHASE', 'BOSS']) {
    const login = await call('/auth/login', undefined, {
      username: f.users[role].username, password: 'test-only-role-browser-password-never-production',
    });
    assert.equal(login.status, 200);
    assert.equal(login.limit, '10');
    assert.equal(login.body.data.user.role, role);
    assert.equal(login.body.data.user.id, f.users[role].id);
    tokens[role] = login.body.data.token;
  }
  /**
   * 职责：从独立只读连接回读完整业务、目录、账期与业务审计，排除登录本身的元数据。
   * @returns 每张业务表的完整行快照
   * @throws SQLite 读取、子进程超时或 JSON 解析失败
   */
  const snapshot = () => JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=[row[0] for row in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_prisma_migrations','users','browser_sessions','operation_logs') ORDER BY name")]
result={table:[dict(row) for row in c.execute('SELECT * FROM "'+table+'" ORDER BY rowid')] for table in tables}
result['business_audit']=[dict(row) for row in c.execute("SELECT * FROM operation_logs WHERE entity NOT IN ('Auth','User') ORDER BY id")]
print(json.dumps(result))
c.close()`, path.join(directory, 'synthetic.db')], { encoding: 'utf8', timeout: 10000 }));
  return { ...f, call, tokens, snapshot };
}

test('dashboard HTTP/SQLite: actual workbench sources preserve current definitions and current-role destinations', { timeout: 60000 }, async t => {
  const f = await dashboardFixture(t);
  const before = f.snapshot();
  /**
   * 职责：以指定当前角色读取成功业务响应。
   * @param route 只读业务路由
   * @param role 当前 PURCHASE 或 BOSS 用户
   * @returns 真实 API data
   * @throws 身份、HTTP 或业务响应失败
   */
  const read = async (route, role = 'PURCHASE') => {
    const response = await f.call(route, f.tokens[role]);
    assert.equal(response.status, 200, `${role} ${route}: ${response.body.message}`);
    assert.equal(response.limit, '100');
    return response.body.data;
  };

  await t.test('KPI and funds use draft-only, all inventory records and formal/derived ownership sources', async () => {
    // Independent SQL source literals establish the worked example, never an API echo.
    assert.deepEqual(before.purchase_contracts.map(row => [row.status, row.totalAmount, row.paidAmount]).sort(),
      [['DRAFT', 1130, 130], ['DRAFT', 200, 50], ['PENDING', 300, 100], ['CANCELLED', 900, 100], ['COMPLETED', 100, 100]].sort());
    assert.deepEqual(before.inventories.map(row => [row.status, row.quantity]).sort(),
      [['IN_STOCK', 8], ['OUT_STOCK', 4], ['PRODUCING', 20]].sort());
    assert.equal(before.sales_contracts.find(row => row.id === 'dashboard-old-risk').amountSource, 'DERIVED');
    assert.equal(before.sales_contracts.find(row => row.id === 'dashboard-packing-only').amountSource, 'FORMAL_DOCUMENT');
    for (const role of ['PURCHASE', 'BOSS']) {
      const data = await read('/dashboard/analytics', role);
      // The overloaded draft has complete positive header inputs; only the empty confirmed contract needs inputs.
      assert.deepEqual(data.alerts, { draftPurchases: 2, exportPendingParams: 1 });
      assert.equal(data.inventory.recordCount, 3);
      assert.equal(data.inventory.totalQuantity, 32);
      // Derived: owned 700, proportional received 175 => 525. Formal: 400-100 => 300.
      assert.equal(data.contracts.sales.receivable, 825);
      // Non-cancelled purchases: 1000 + 150 + 200 CNY; pending is not a draft KPI.
      assert.equal(data.contracts.purchase.unpaidAmount, 1350);
      const periods = await read('/finance/statements', role);
      // The API lists periods ascending; the mounted workbench must choose max year/month, not its first row.
      assert.deepEqual(periods.map(row => [row.year, row.month, row.periodLabel]),
        [[2025, 12, '合成2025年12账期'], [2026, 9, '合成2026年9账期']]);
    }
    assert.deepEqual(f.snapshot(), before);
  });

  await t.test('full risk and blocked scopes retain older source records beyond the recent six', async () => {
    const recent = await read('/dashboard/trade-workflows?limit=6&scope=recent');
    assert.deepEqual(recent.map(row => row.id), [7, 6, 5, 4, 3, 2].map(number => `dashboard-recent-${number}`));
    const blocked = await read('/dashboard/trade-workflows?limit=6&scope=blocked');
    assert.deepEqual(blocked.map(row => row.id), ['dashboard-missing-params', 'dashboard-old-risk']);
    const risk = await read('/dashboard/trade-workflows?limit=6&scope=risk');
    assert.equal(risk[0].id, 'dashboard-old-risk');
    assert.deepEqual(risk[0].stages.map(row => row.key),
      ['procurement', 'payment', 'production', 'loading', 'documents', 'invoice', 'tax-refund', 'finance']);
    assert.equal(risk[0].stages[0].reason, '找不到购销合同 CG-SYNTHETIC-MISSING');
    assert.equal(risk[0].stages[3].reason, '毛重超过 22 吨安全上限');
    assert.deepEqual(risk[0].issues, ['货柜超过 40HQ 安全上限']);
    assert.equal(risk[0].nextAction.href, '/dashboard/sales/dashboard-old-risk');
    const pending = await read('/dashboard/trade-workflows?limit=100&scope=pending');
    assert.equal(pending.length, 10);
    assert.ok(pending.every(row => !['dashboard-cancelled-sale', 'dashboard-completed-sale'].includes(row.id)));
    const all = await read('/dashboard/trade-workflows?limit=100&scope=recent');
    const completed = all.find(row => row.id === 'dashboard-completed-sale');
    assert.equal(completed.completedStageCount, 8);
    assert.equal(completed.stageCount, 8);
    assert.ok(completed.stages.every(row => row.status === 'completed'));
    assert.deepEqual(f.snapshot(), before);
  });

  await t.test('trace merges real sales/packing relations with sales precedence, store filtering and missing-store fallback', async () => {
    assert.equal(before.sales_items[0].quantity, 11);
    assert.equal(before.packing_items.find(row => row.id === 'dashboard-dual-owned').quantity, 12);
    const trace = await read('/dashboard/track-product?product=' + encodeURIComponent('角色验收'));
    const facts = trace.map(row => [row.salesContractId, row.storeName, row.quantity]).sort();
    assert.deepEqual(facts, [
      ['dashboard-old-risk', '合成追踪门店甲', 11],
      ['dashboard-packing-only', '合成追踪门店乙', 17],
      ['dashboard-packing-only', '未知门店', 19],
    ].sort());
    assert.ok(trace.every(row => row.productName === '合成角色验收商品' && row.portName === '合成角色验收港口'));
    assert.deepEqual(trace.map(row => row.contractNo),
      ['EXP-SYNTHETIC-PACKING-ONLY', 'EXP-SYNTHETIC-PACKING-ONLY', 'EXP-SYNTHETIC-OLD-RISK']);
    for (const [store, expected] of [['门店甲', [['dashboard-old-risk', 11]]], ['门店乙', [['dashboard-packing-only', 17]]], ['不存在门店', []]]) {
      const filtered = await read('/dashboard/track-product?product=' + encodeURIComponent('角色验收') + '&store=' + encodeURIComponent(store));
      assert.deepEqual(filtered.map(row => [row.salesContractId, row.quantity]), expected);
    }
    assert.deepEqual(await read('/dashboard/track-product'), []);
    assert.deepEqual(await read('/dashboard/track-product?product=' + encodeURIComponent('不存在商品')), []);
    assert.deepEqual(f.snapshot(), before);
  });

  await t.test('authentication and real current roles permit task detail reads without changing sources', async () => {
    for (const route of ['/dashboard/analytics', '/dashboard/trade-workflows', '/dashboard/track-product?product=synthetic']) {
      assert.equal((await f.call(route)).status, 401);
    }
    assert.equal((await f.call('/dashboard/trade-workflows?scope=unknown', f.tokens.PURCHASE)).status, 400);
    for (const role of ['PURCHASE', 'BOSS']) {
      const current = await read('/auth/me', role);
      assert.equal(current.id, f.users[role].id);
      assert.equal(current.role, role);
      const recent = await read('/dashboard/trade-workflows?limit=6&scope=recent', role);
      const action = recent[0].nextAction;
      assert.equal(action.href, `/dashboard/purchase/${f.purchaseId}`);
      const purchase = await read(`/purchases/${f.purchaseId}`, role);
      assert.equal(purchase.id, f.purchaseId);
      assert.equal(purchase.contractNo, f.dashboardSources.purchaseNo);
      const riskSale = await read(`/sales/${f.dashboardSources.riskId}`, role);
      assert.equal(riskSale.contractNo, f.dashboardSources.riskNo);
    }
    assert.deepEqual(f.snapshot(), before);
  });
});
