/**
 * Input: Existing ADMIN config HTTP route, committed migrations and private synthetic SQLite
 * Output: Company-name-only invoiceTitleInfo save, retry, failure and independent readback
 * Pos: Row 30 ordinary text acceptance; no full-form, provider, accounting or security writes
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const KEY = 'invoiceTitleInfo';
const ORIGINAL = '公司名称：合成普通设置公司';
const SAVED = '公司名称：合成文本回读公司\n合成说明：仅测试固定文本';

test('HTTP/SQLite: existing ADMIN can persist only ordinary invoice title text', async t => {
  assert.equal(fs.existsSync(path.resolve(__dirname, '../../.env')), false,
    'The acceptance checkout must not contain an environment file');
  const originalUmask = process.umask(0o077);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-ordinary-setting-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-role-browser-jwt-secret-never-production';
  process.env.TZ = 'UTC';
  // No environment-key fallback is needed for a company-name-only text field.
  for (const name of ['KIMI_API_KEY', 'DEEPSEEK_API_KEY', 'HSCIQ_API_KEY']) delete process.env[name];
  let db, server;
  let successCount = 0;
  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
    process.umask(originalUmask);
  });

  // 1. Apply only the repository's committed migration SQL to an empty private file.
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl, timeout: 10000 });
  fs.chmodSync(database, 0o600);

  /**
   * 职责：执行仅作用于本次私有合成数据库的 SQL 夹具或独立读取。
   * @param {string} script Python sqlite3 program
   * @returns {string} subprocess output; throws on SQL or timeout failure
   */
  const sqlite = script => execFileSync('python3', ['-c', script, database], {
    encoding: 'utf8', timeout: 10000,
  });
  sqlite(`import sqlite3,sys,json
c=sqlite3.connect(sys.argv[1])
c.execute('INSERT INTO users (id,username,name,password,role,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)',
 ('user-ADMIN','synthetic-overview-ADMIN','Synthetic ADMIN','test-only-unused-hash','ADMIN',0,0))
c.execute('INSERT INTO system_configs (id,key,value,note,updatedAt) VALUES (?,?,?,?,?)',
 ('ordinary-text-setting','invoiceTitleInfo',json.dumps('公司名称：合成普通设置公司'),'Synthetic fixed text',0))
c.commit()
c.close()`);

  /**
   * 职责：独立只读列出配置与其他表的全部非凭据字段，证明只改变已存在文本键。
   * @returns {object} ordinary settings and unaffected table rows, omitting unused user password
   * @throws independent SQLite read or JSON decoding failure
   */
  const snapshot = () => JSON.parse(sqlite(`import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=[r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
other={name:[{k:v for k,v in dict(r).items() if not (name=='users' and k=='password')} for r in c.execute('SELECT * FROM "'+name+'" ORDER BY rowid')] for name in tables if name not in ['system_configs','operation_logs']}
print(json.dumps({'settings':[{**dict(r),'value':json.loads(r['value'])} for r in c.execute('SELECT id,key,value,note FROM system_configs ORDER BY key')],
 'otherRows':other}))
c.close()`));
  const initial = snapshot();
  assert.equal(initial.settings.length, 1);
  assert.equal(initial.settings[0].value, ORIGINAL);

  // 2. Reuse the existing synthetic ADMIN identity and bearer convention in memory.
  // This test does not log in, create persistent credentials, or use browser storage/cookies.
  db = require('../utils/prisma');
  const token = require('jsonwebtoken').sign({ userId: 'user-ADMIN', role: 'ADMIN' },
    process.env.JWT_SECRET, { expiresIn: '1h' });
  const app = require('../app');
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1/system/configs`;
  let remaining = 100;

  /**
   * 职责：调用真实配置读取或唯一允许的文本写入端点，并检查实际限流与响应。
   * @param {string} method GET or PUT
   * @param {string|undefined} value synthetic company text for the exact existing key
   * @param {number} expected expected HTTP status
   * @returns {Promise<object>} complete HTTP JSON response
   * @throws response, active limiter, or successful audit persistence mismatch
   */
  const request = async (method, value, expected = 200) => {
    const response = await fetch(method === 'PUT' ? `${base}/${KEY}` : base, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(method === 'PUT' ? { body: JSON.stringify({ value }) } : {}),
    });
    assert.equal(response.status, expected);
    assert.equal(response.headers.get('x-ratelimit-limit'), '100');
    assert.equal(Number(response.headers.get('x-ratelimit-remaining')), --remaining);
    const result = await response.json();
    if (method === 'PUT' && expected === 200) {
      successCount++;
      // Await the existing response-finish audit before comparing the next operation.
      const deadline = Date.now() + 5000;
      while (await db.operationLog.count() < successCount) {
        assert.ok(Date.now() < deadline, 'Normal successful config audit must persist');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    return result;
  };

  /**
   * 职责：通过新 HTTP 读取及独立 SQLite 连接验证文本，无其他配置键产生。
   * @param {string} expected previously saved literal text
   * @returns {Promise<object>} independent snapshot
   * @throws HTTP/SQLite readback or unrelated-table value mismatch
   */
  const readback = async expected => {
    assert.equal((await request('GET')).data[KEY], expected);
    const stored = snapshot();
    assert.deepEqual(stored.settings, [{ ...initial.settings[0], value: expected }]);
    assert.deepEqual(stored.otherRows, initial.otherRows);
    return stored;
  };

  await t.test('save multiline ordinary text, repeat the same save, and reload the connection', async () => {
    await readback(ORIGINAL);
    const saved = await request('PUT', SAVED);
    assert.equal(saved.data.key, KEY);
    assert.equal(saved.data.value, SAVED);
    await readback(SAVED);
    await request('PUT', SAVED);
    await db.$disconnect();
    await readback(SAVED);
  });

  await t.test('a real private-database write failure preserves text and a later explicit retry works', async () => {
    const before = await readback(SAVED);
    sqlite(`import sqlite3,sys
c=sqlite3.connect(sys.argv[1])
c.execute("CREATE TRIGGER ordinary_text_failure BEFORE UPDATE ON system_configs WHEN NEW.key='invoiceTitleInfo' BEGIN SELECT RAISE(ABORT,'synthetic text write failure'); END")
c.commit()
c.close()`);
    try {
      const failed = await request('PUT', '公司名称：合成失败草稿', 500);
      // The installed Prisma SQLite engine classifies RAISE(ABORT) as P2003.
      assert.equal(failed.message, '存在关联数据，无法执行该操作');
      assert.deepEqual(await readback(SAVED), before);
      assert.equal(await db.operationLog.count(), successCount);
    } finally {
      sqlite(`import sqlite3,sys
c=sqlite3.connect(sys.argv[1])
c.execute('DROP TRIGGER ordinary_text_failure')
c.commit()
c.close()`);
    }
    await request('PUT', '公司名称：合成明确重试公司');
    await db.$disconnect();
    await readback('公司名称：合成明确重试公司');
  });

  await t.test('clear the existing optional text without deleting its setting or changing other data', async () => {
    await request('PUT', '');
    await db.$disconnect();
    await readback('');
    const audits = await db.operationLog.findMany({ select: { entity: true, action: true, userId: true } });
    assert.equal(audits.length, 4);
    assert.ok(audits.every(row => row.entity === 'SystemConfig' && row.action === 'UPDATE' && row.userId === 'user-ADMIN'));
  });
});
