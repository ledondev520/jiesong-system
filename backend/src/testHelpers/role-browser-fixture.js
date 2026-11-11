/**
 * Input: Scenario name, optional private temporary root and the role-browser-server.js child fixture
 * Output: Started synthetic role HTTP fixture (metadata, login, call, independent read-only SQLite helper)
 * Pos: Shared by role-browser-server.test.js and role-browser-documents.test.js so node --test runs them in parallel
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const password = 'test-only-role-browser-password-never-production';

/** 职责：创建私有角色夹具，提供真实登录、HTTP 和独立只读工具
 * @param t 当前测试及清理上下文
 * @param scenario 允许的合成业务场景
 * @param temporaryRoot 私有临时根，默认系统临时目录
 * @returns 夹具元数据、目录与工具；启动、权限或登录失败时抛错 */
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
    assert.equal(response.body.data.user.role, metadata.users[role].role);
    assert.equal(response.body.data.user.id, metadata.users[role].id);
    return response.body.data.token;
  };
  return { ...metadata, directory, read, call, login };
}

module.exports = { fixtureFor };
