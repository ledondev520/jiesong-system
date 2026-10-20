// Ephemeral test-only backend: real migration chain, auth router and SQLite. No production data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const directory = process.env.BROWSER_SESSION_TEST_DIR;
if (process.env.NODE_ENV !== 'test' || !directory?.startsWith(path.join(os.tmpdir(), 'jiesong-browser-e2e-')) || !process.send || !process.env.BROWSER_SESSION_TEST_PASSWORD) process.exit(2);
process.env.DATABASE_URL = `file:${directory}/test.db`;
async function start() {
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).filter((name) => fs.statSync(path.join(migrations, name)).isDirectory()).sort().map((name) => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', path.join(directory, 'test.db')], { input: ddl });
  const db = require('../utils/prisma');
  await db.user.create({ data: { username: 'synthetic-browser', name: 'Synthetic Browser', role: 'ADMIN', password: await require('bcrypt').hash(process.env.BROWSER_SESSION_TEST_PASSWORD, 4) } });
  const app = require('../app');
  const server = app.listen(3001, 'localhost', () => process.send({ baseURL: `http://localhost:${server.address().port}` }));
  process.on('message', async (message) => {
    if (message === 'expire') { await db.browserSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } }); process.send({ expired: true }); }
  });
  const close = async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); await db.$disconnect(); process.exit(0); };
  process.on('SIGTERM', close); process.on('disconnect', close);
}
start().catch(() => { console.error('Synthetic browser session fixture failed'); process.exit(1); });
