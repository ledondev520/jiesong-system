/**
 * Input: actual notification HTTP routes, authentication and private migrated SQLite
 * Output: current synthetic user's mark-one/reload and mark-all/retry readback
 * Pos: ordinary notification lifecycle; no production or other-user requests
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: own notification read states and counts survive reload and retries', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-notification-state-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  process.env.TZ = 'UTC';
  const originalUmask = process.umask(0o022);
  let db, server;
  let sequence = 0;
  const auditRequests = new Set();
  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    // The system mark-one route writes its normal response-finish audit asynchronously.
    if (db && auditRequests.size) {
      const deadline = Date.now() + 5000;
      while (true) {
        const saved = await db.operationLog.findMany({
          where: { requestId: { in: [...auditRequests] } }, select: { requestId: true },
        });
        const persisted = new Set(saved.map(row => row.requestId));
        if ([...auditRequests].every(id => persisted.has(id))) break;
        assert.ok(Date.now() < deadline, 'notification fixture audit writes did not settle');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
    process.umask(originalUmask);
  });
  // Replay only committed migrations; never db push or generate a shared Prisma client.
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c',
    'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()',
    database], { input: ddl });
  fs.chmodSync(database, 0o600);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(database).mode & 0o777, 0o600);
  db = require('../utils/prisma');
  // One current user only, created inside the disposable fixture with no account changes.
  const user = await db.user.create({ data: {
    username: 'synthetic-notification-user', name: 'Synthetic notification user',
    password: randomBytes(32).toString('hex'), role: 'PURCHASE',
  } });
  const rows = [];
  for (let index = 0; index < 4; index += 1) {
    rows.push(await db.notification.create({ data: {
      userId: user.id, type: 'PURCHASE_DRAFT', title: `Synthetic notification ${index + 1}`,
      content: 'Synthetic ordinary reminder', isRead: index === 3,
      createdAt: new Date(`2026-10-0${index + 1}T12:00:00.000Z`),
    } }));
  }
  const token = require('jsonwebtoken').sign({ userId: user.id }, process.env.JWT_SECRET);
  const app = require('../app'); // Includes the real global limiter and real route middleware.
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const good = async (method, route) => {
    const requestId = `synthetic-notification-${++sequence}`;
    const response = await fetch(base + route, { method, headers: {
      authorization: `Bearer ${token}`, 'x-request-id': requestId,
    } });
    const payload = await response.json();
    if (method === 'PUT' && response.ok) auditRequests.add(requestId);
    assert.equal(response.status, 200, `${method} ${route}: ${payload.message}`);
    return payload.data;
  };
  // Independent read-only connection proves persisted values rather than a returned object.
  const snapshot = () => JSON.parse(execFileSync('python3', ['-c',
    "import sqlite3,sys,json; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); c.row_factory=sqlite3.Row; print(json.dumps([dict(row) for row in c.execute('SELECT * FROM notifications ORDER BY id')])); c.close()",
    database], { encoding: 'utf8', timeout: 10000 }));
  const assertReadback = async (unreadIds) => {
    const list = await good('GET', '/notifications?page=1&pageSize=50');
    const all = await good('GET', '/system/notifications?page=1&pageSize=20');
    const unread = await good('GET', '/system/notifications?page=1&pageSize=20&unreadOnly=true');
    const count = await good('GET', '/notifications/unread-count');
    assert.equal(list.pagination.total, 4);
    assert.equal(all.pagination.total, 4);
    assert.equal(all.unreadCount, unreadIds.length);
    assert.equal(unread.pagination.total, unreadIds.length);
    assert.equal(unread.unreadCount, unreadIds.length);
    assert.equal(count.count, unreadIds.length);
    assert.deepEqual(unread.items.map(row => row.id).sort(), [...unreadIds].sort());
    assert.deepEqual(list.items.filter(row => !row.isRead).map(row => row.id).sort(), [...unreadIds].sort());
    assert.deepEqual(all.items.filter(row => !row.isRead).map(row => row.id).sort(), [...unreadIds].sort());
    const persisted = snapshot();
    assert.equal(persisted.length, 4);
    assert.deepEqual(persisted.filter(row => !row.isRead).map(row => row.id).sort(), [...unreadIds].sort());
    return persisted;
  };

  await t.test('mark-one and same-row replay retain exact unread count after fresh reads', async () => {
    const before = await assertReadback(rows.slice(0, 3).map(row => row.id));
    // Two ordinary UI requests complete for the same current user's notification.
    const repeated = await Promise.all([
      good('POST', `/notifications/${rows[0].id}/read`),
      good('POST', `/notifications/${rows[0].id}/read`),
    ]);
    repeated.forEach(row => { assert.equal(row.id, rows[0].id); assert.equal(row.isRead, true); });
    await good('PUT', `/system/notifications/${rows[0].id}/read`);
    const after = await assertReadback(rows.slice(1, 3).map(row => row.id));
    assert.deepEqual(after, before.map(row => row.id === rows[0].id ? { ...row, isRead: 1 } : row));
    // A fresh Prisma connection still reads the saved state, as a page reload should.
    await db.$disconnect();
    assert.deepEqual(await assertReadback(rows.slice(1, 3).map(row => row.id)), after);
  });

  await t.test('mark-all and same-user retries leave four existing rows with zero unread', async () => {
    const before = await assertReadback(rows.slice(1, 3).map(row => row.id));
    await good('POST', '/notifications/read-all');
    const after = await assertReadback([]);
    assert.deepEqual(after, before.map(row => ({ ...row, isRead: 1 })));
    await Promise.all([good('POST', '/notifications/read-all'), good('POST', '/notifications/read-all')]);
    await db.$disconnect();
    assert.deepEqual(await assertReadback([]), after);
  });
});
