const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

test('registered resource lifecycle matrix over HTTP, private SQLite and singleton files', async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'jiesong-resource-matrix-'),
  );
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-catalogue-fixture-never-for-production';
  process.env.TZ = 'UTC';
  // Never allow the singleton adapter to write the repository or an operator config.
  const previousPricingPath = process.env.JIESONG_PRICING_CONFIG;
  const pricingFile = path.join(directory, 'pricing.json');
  process.env.JIESONG_PRICING_CONFIG = pricingFile;
  const originalUmask = process.umask(0o022);
  let db, server;
  let sequence = 0;
  const auditRequests = new Set();
  const { resources } = require('../../../lifecycle/resources.json');
  // Only archive routes use response-finish database audit writes. Pricing audits
  // hashes/field names in its file service and must not store config in the DB.
  const auditedPaths = resources
    .filter((resource) => resource.kind !== 'singleton-config' && resource.kind !== 'action')
    .map((resource) => resource.matrix.path);
  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    // Successful response-finish audit writes must finish before deleting this fixture.
    if (db && auditRequests.size) {
      const deadline = Date.now() + 5000;
      while (true) {
        const saved = await db.operationLog.findMany({
          where: { requestId: { in: [...auditRequests] } },
          select: { requestId: true },
        });
        const persisted = new Set(saved.map((row) => row.requestId));
        if ([...auditRequests].every((id) => persisted.has(id))) break;
        assert.ok(
          Date.now() < deadline,
          'catalogue fixture audit writes did not settle',
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
    process.umask(originalUmask);
    if (previousPricingPath === undefined)
      delete process.env.JIESONG_PRICING_CONFIG;
    else process.env.JIESONG_PRICING_CONFIG = previousPricingPath;
  });
  // Apply the committed migrations; never use db push or regenerate shared clients.
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs
    .readdirSync(migrations)
    .sort()
    .filter((name) => fs.statSync(path.join(migrations, name)).isDirectory())
    .map((name) =>
      fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8'),
    )
    .join('\n');
  execFileSync(
    'python3',
    [
      '-c',
      'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()',
      database,
    ],
    { input: ddl },
  );
  fs.chmodSync(database, 0o600);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(database).mode & 0o777, 0o600);
  db = require('../utils/prisma');
  const user = await db.user.create({
    data: {
      username: 'synthetic-catalogue-editor',
      name: 'Synthetic catalogue editor',
      password: 'test-only-unused-hash',
      role: 'ADMIN',
    },
  });
  const token = require('jsonwebtoken').sign(
    { userId: user.id },
    process.env.JWT_SECRET,
  );
  const app = require('../app');
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, route, body) => {
    const requestId = `synthetic-catalogue-${++sequence}`;
    const response = await fetch(base + route, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-request-id': requestId,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    // The real global limiter (100/min) stays mounted; with many registered resources the matrix must pace itself.
    const remaining = Number(response.headers.get('x-ratelimit-remaining'));
    if (remaining <= 5) {
      const wait = Number(response.headers.get('x-ratelimit-reset')) - Date.now() + 100;
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    }
    if (
      method !== 'GET' &&
      response.status >= 200 &&
      response.status < 300 &&
      auditedPaths.some(
        (base) => route === base || route.startsWith(`${base}/`),
      )
    )
      auditRequests.add(requestId);
    return { status: response.status, ...payload };
  };
  const good = async (...args) => {
    const result = await call(...args);
    assert.equal(
      result.status,
      200,
      `${args[0]} ${args[1]}: ${result.message}`,
    );
    return result.data;
  };
  // A separate read-only SQLite connection proves failed saves did not change rows.
  const snapshot = (table) =>
    JSON.parse(
      execFileSync(
        'python3',
        [
          '-c',
          "import sqlite3,sys,json; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); c.row_factory=sqlite3.Row; print(json.dumps([dict(row) for row in c.execute('SELECT * FROM '+sys.argv[2]+' ORDER BY id')])); c.close()",
          database,
          table,
        ],
        { encoding: 'utf8', timeout: 10000 },
      ),
    );

  const fileSnapshot = () => {
    const contents = fs.readFileSync(pricingFile, 'utf8');
    const stat = fs.statSync(pricingFile);
    return {
      contents,
      config: JSON.parse(contents),
      revision: crypto.createHash('sha256').update(contents).digest('hex'),
      mode: stat.mode & 0o777,
      ino: stat.ino,
      dev: stat.dev,
      mtimeMs: stat.mtimeMs,
      ctimeMs: stat.ctimeMs,
    };
  };
  const withFileLock = async (run) => {
    const lock = `${pricingFile}.lock`;
    const fd = fs.openSync(lock, 'wx', 0o600);
    try {
      await run();
    } finally {
      fs.closeSync(fd);
      fs.unlinkSync(lock);
    }
  };
  const { runResourceMatrix } = require('../lifecycle/runResourceMatrix');
  const {
    runSingletonConfigMatrix,
  } = require('../lifecycle/runSingletonConfigMatrix');
  for (const resource of resources.filter((entry) => entry.kind !== 'action')) {
    await t.test(resource.id, async (t) => {
      const singleton = resource.kind === 'singleton-config';
      if (singleton) {
        assert.equal(resource.matrix.adapter, 'pricing-config-file');
        fs.writeFileSync(
          pricingFile,
          `${JSON.stringify(resource.matrix.initial, null, 2)}\n`,
          { flag: 'wx', mode: 0o600 },
        );
      }
      const run = singleton ? runSingletonConfigMatrix : runResourceMatrix;
      const result = await run(t, resource, {
        call,
        good,
        snapshot,
        fileSnapshot,
        withFileLock,
      });
      if (process.env.JIESONG_TEST_EVIDENCE_DIR) {
        fs.mkdirSync(process.env.JIESONG_TEST_EVIDENCE_DIR, {
          recursive: true,
          mode: 0o700,
        });
        fs.writeFileSync(
          path.join(
            process.env.JIESONG_TEST_EVIDENCE_DIR,
            `${resource.id}.json`,
          ),
          JSON.stringify(result, null, 2),
          { mode: 0o600 },
        );
      }
    });
  }
});
