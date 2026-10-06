/**
 * Input: Private migrated HS fixture, real authenticated local routes and SQLite literals
 * Output: Local search/detail, existing-role manual evidence persistence and rejection checks
 * Pos: HS fixture contract tests; no browser, AI, external provider or production records
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
 * 职责：启动独占真实HS后端并提供普通HTTP、真实登录和独立只读回查。
 * @param t 当前测试上下文；负责子进程退出和独占目录清理
 * @returns 测试元数据、HTTP调用、登录和SQLite快照接口
 * @throws 子进程、权限、登录、网络或独立SQLite核对失败
 */
async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-hs-browser-e2e-'));
  fs.chmodSync(directory, 0o700);
  const server = spawn(process.execPath, [path.join(__dirname, 'hs-code-browser-server.js')], {
    env: { PATH: process.env.PATH, TMPDIR: os.tmpdir(), TZ: 'UTC', NODE_ENV: 'test', HS_BROWSER_TEST_DIR: directory },
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
    const timeout = setTimeout(() => reject(new Error('Synthetic HS fixture startup timeout')), 40000);
    server.once('message', message => { clearTimeout(timeout); resolve(message); });
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', () => { clearTimeout(timeout); reject(new Error('Synthetic HS fixture exited before startup')); });
  });
  assert.match(metadata.baseURL, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(directory, 'synthetic.db')).mode & 0o777, 0o600);
  /**
   * 职责：仅调用当前夹具的真实登录或本地字典GET/PUT路由。
   * @param method HTTP方法
   * @param route /api/v1后路径和查询；排除所有AI/外部HS端点
   * @param body 可选JSON请求体
   * @param token 当前合成登录用户令牌
   * @returns HTTP状态、真实JSON响应与当前限流上限
   * @throws 越界路径、网络或JSON解析失败
   */
  const call = async (method, route, body, token) => {
    assert.ok((method === 'POST' && route === '/auth/login')
      || (['GET', 'PUT'].includes(method) && /^\/hs-codes(?:\/?(?:\?|$)|\/search(?:\?|$)|\/\d+(?:\?|$))/.test(route)));
    const response = await fetch(`${metadata.baseURL}/api/v1${route}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json(), limit: response.headers.get('x-ratelimit-limit') };
  };
  /**
   * 职责：通过现有登录接口核对真实数据库角色与用户身份。
   * @param role 当前夹具预置的现有角色
   * @returns 当前用户测试令牌
   * @throws 非200响应、身份或角色不符
   */
  const login = async role => {
    const response = await call('POST', '/auth/login', {
      username: metadata.users[role].username, password: 'test-only-hs-browser-password-never-production',
    });
    assert.equal(response.status, 200);
    assert.equal(response.limit, '10');
    assert.equal(response.body.data.user.id, metadata.users[role].id);
    assert.equal(response.body.data.user.role, role);
    return response.body.data.token;
  };
  /**
   * 职责：独立只读SQLite连接读取HS完整行、审计及无关业务/AI使用表。
   * @returns 按表名组织的字面量快照；不读取用户凭据
   * @throws SQLite、子进程超时或JSON解析失败
   */
  const snapshot = () => JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=['hs_codes','operation_logs','products','purchase_contracts','sales_contracts','inventories','payments','customs_declarations','tax_refunds','token_usages']
print(json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM '+table+ (" WHERE entity='HsCode'" if table=='operation_logs' else '')+' ORDER BY id')] for table in tables}))
c.close()`, path.join(directory, 'synthetic.db')], { encoding: 'utf8', timeout: 10000 }));
  /**
   * 职责：在五秒内等待真实成功响应触发的审计持久化。
   * @param count 当前夹具预期的成功保存次数
   * @returns 审计已落库的 Promise<void>
   * @throws 期限内审计数不符或SQLite读取失败
   */
  const waitForAudit = async count => {
    const deadline = Date.now() + 5000;
    while (snapshot().operation_logs.length !== count && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(snapshot().operation_logs.length, count);
  };
  return { ...metadata, call, login, snapshot, waitForAudit };
}

test('HS local HTTP: authenticated name/code search, detail and repeated read are read-only', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  const before = f.snapshot();
  assert.equal((await f.call('GET', '/hs-codes')).status, 401);
  for (const role of Object.keys(f.users)) {
    const token = await f.login(role);
    const listing = await f.call('GET', '/hs-codes?code=999901&fuzzy=true&page=1&pageSize=20', undefined, token);
    assert.equal(listing.status, 200);
    assert.deepEqual(listing.body.data.items.map(row => row.hsCode).sort(), ['9999010001', '9999010002']);
    const detail = await f.call('GET', `/hs-codes/${f.hsCode}`, undefined, token);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.productName, '合成本地编码甲');
    assert.equal(detail.body.data.taxRate, 17);
    assert.equal(detail.body.data.refundRate, 3.5);
    assert.equal(detail.body.data.declarationElements, '品牌类型|用途');
  }
  const token = await f.login('PURCHASE');
  const byName = await f.call('GET', '/hs-codes/search?keyword=' + encodeURIComponent('合成本地编码甲'), undefined, token);
  assert.equal(byName.status, 200);
  assert.deepEqual(byName.body.data.map(row => row.hsCode), ['9999010001']);
  for (const query of ['/hs-codes?keyword=999901&fuzzy=true', '/hs-codes?code=9999010999&fuzzy=true', '/hs-codes?keyword=9999010999&fuzzy=true']) {
    const numeric = await f.call('GET', query, undefined, token);
    assert.equal(numeric.status, 200);
    assert.deepEqual(numeric.body.data.items.map(row => row.hsCode).sort(), ['9999010001', '9999010002']);
  }
  const fuzzyName = await f.call('GET', '/hs-codes?keyword=' + encodeURIComponent('本地编甲') + '&fuzzy=true', undefined, token);
  assert.deepEqual(fuzzyName.body.data.items.map(row => row.hsCode), ['9999010001', '9999010002']);
  assert.ok(fuzzyName.body.data.items[0].similarity > fuzzyName.body.data.items[1].similarity);
  const literalName = await f.call('GET', '/hs-codes?keyword=' + encodeURIComponent('本地编甲'), undefined, token);
  assert.deepEqual(literalName.body.data.items, []);
  const empty = await f.call('GET', '/hs-codes?code=7777&fuzzy=true', undefined, token);
  assert.equal(empty.body.data.pagination.total, 0);
  assert.deepEqual(empty.body.data.items, []);
  assert.equal((await f.call('GET', '/hs-codes/7777777777', undefined, token)).status, 404);
  assert.deepEqual(f.snapshot(), before);
});

test('HS local HTTP: combined name and numeric prefix narrow the current search', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  const token = await f.login('PURCHASE');
  const query = '/hs-codes?code=999901&keyword=' + encodeURIComponent('编码甲');
  const before = f.snapshot();
  for (const suffix of ['', '&fuzzy=true']) {
    const result = await f.call('GET', query + suffix, undefined, token);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.data.items.map(row => row.hsCode), ['9999010001']);
    assert.equal(result.body.data.pagination.total, 1);
  }
  assert.deepEqual(f.snapshot(), before);
});

test('HS manual HTTP: existing ADMIN/PURCHASE/FINANCE saves persist exact evidence and refresh cached reads', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  let count = 0;
  for (const role of ['ADMIN', 'PURCHASE', 'FINANCE']) {
    const token = await f.login(role);
    const before = f.snapshot();
    const query = '/hs-codes?code=999901&page=1&pageSize=20';
    assert.equal((await f.call('GET', query, undefined, token)).status, 200);
    const draft = {
      refundRate: 0, exportTaxRate: 4.25, vatRate: 9,
      effectiveDate: '2026-10-03', sourceUrl: 'https://example.invalid/hs/synthetic-reviewed',
      declarationElements: ' 合成复核用途|合成复核材质 ', note: ` 合成${role}已复核 `,
    };
    const saved = await f.call('PUT', `/hs-codes/${f.hsCode}`, draft, token);
    assert.equal(saved.status, 200);
    await f.waitForAudit(++count);
    const after = f.snapshot();
    const row = after.hs_codes.find(record => record.hsCode === f.hsCode);
    const original = before.hs_codes.find(record => record.hsCode === f.hsCode);
    assert.deepEqual(row, { ...original, refundRate: 0, exportTaxRate: 4.25, vatRate: 9,
      effectiveDate: 1790985600000, sourceUrl: 'https://example.invalid/hs/synthetic-reviewed',
      declarationElements: '合成复核用途|合成复核材质', note: `合成${role}已复核`, fetchedAt: row.fetchedAt });
    assert.ok(Number.isFinite(row.fetchedAt));
    assert.equal(row.taxRate, 17);
    assert.equal(row.unit, '件');
    assert.deepEqual(after.hs_codes.filter(record => record.hsCode !== f.hsCode), before.hs_codes.filter(record => record.hsCode !== f.hsCode));
    for (const table of Object.keys(before).filter(table => !['hs_codes', 'operation_logs'].includes(table))) assert.deepEqual(after[table], before[table], table);
    const audit = after.operation_logs.find(log => log.userId === f.users[role].id);
    assert.equal(audit.entity, 'HsCode');
    assert.equal(audit.entityId, f.hsCode);
    assert.equal(audit.action, 'UPDATE');
    for (const route of [query, `/hs-codes/${f.hsCode}`, query]) {
      const readback = await f.call('GET', route, undefined, token);
      assert.equal(readback.status, 200);
      const current = route === query ? readback.body.data.items.find(record => record.hsCode === f.hsCode) : readback.body.data;
      assert.equal(current.refundRate, 0);
      assert.equal(current.note, `合成${role}已复核`);
      assert.equal(current.effectiveDate, '2026-10-03T00:00:00.000Z');
    }
    assert.deepEqual(f.snapshot(), after);
  }
});

test('HS manual HTTP: invalid evidence and existing reader-role saves leave complete rows unchanged', { timeout: 60000 }, async t => {
  const f = await fixture(t);
  const token = await f.login('PURCHASE');
  const route = `/hs-codes/${f.hsCode}`;
  const before = f.snapshot();
  for (const draft of [
    {}, { refundRate: 0 }, { refundRate: 0, effectiveDate: '2026-10-03' },
    { refundRate: 101, effectiveDate: '2026-10-03', sourceUrl: 'https://example.invalid/hs/synthetic' },
    { vatRate: -1, effectiveDate: '2026-10-03', sourceUrl: 'https://example.invalid/hs/synthetic' },
    { refundRate: 0, effectiveDate: 'invalid', sourceUrl: 'https://example.invalid/hs/synthetic' },
    { refundRate: 0, effectiveDate: '2026-10-03', sourceUrl: 'invalid-source' },
    { refundRate: 0, effectiveDate: '2026-10-03', sourceUrl: 'file:///synthetic' },
  ]) {
    assert.equal((await f.call('PUT', route, draft, token)).status, 400);
    assert.deepEqual(f.snapshot(), before);
  }
  assert.equal((await f.call('PUT', '/hs-codes/7777777777', { note: '合成不存在编辑' }, token)).status, 404);
  assert.equal((await f.call('PUT', route, { note: '合成匿名编辑' })).status, 401);
  for (const role of ['SALES', 'WAREHOUSE', 'BOSS']) {
    const reader = await f.login(role);
    assert.equal((await f.call('PUT', route, { note: '合成不允许编辑' }, reader)).status, 403);
    assert.deepEqual(f.snapshot(), before);
  }
  const corrected = await f.call('PUT', route, {
    refundRate: 0, effectiveDate: '2026-10-03', sourceUrl: 'https://example.invalid/hs/synthetic-retry',
  }, token);
  assert.equal(corrected.status, 200);
  await f.waitForAudit(1);
  assert.equal(f.snapshot().hs_codes.find(row => row.hsCode === f.hsCode).refundRate, 0);
});

test('HS fixture contract: non-test, unsafe directory and missing IPC exit before database creation', { timeout: 10000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-hs-browser-e2e-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const options of [
    { mode: 'production', directory, ipc: true },
    { mode: 'test', directory: os.tmpdir(), ipc: true },
    { mode: 'test', directory, ipc: false },
  ]) {
    const child = spawn(process.execPath, [path.join(__dirname, 'hs-code-browser-server.js')], {
      env: { PATH: process.env.PATH, TMPDIR: os.tmpdir(), NODE_ENV: options.mode, HS_BROWSER_TEST_DIR: options.directory },
      stdio: options.ipc ? ['ignore', 'ignore', 'ignore', 'ipc'] : 'ignore',
    });
    const code = await new Promise((resolve, reject) => {
      child.once('exit', resolve);
      child.once('error', reject);
    });
    assert.equal(code, 2);
    assert.deepEqual(fs.readdirSync(directory), []);
  }
});
