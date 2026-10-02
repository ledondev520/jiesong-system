// Isolated E2E server only; no production data, credentials, mail provider or test routes.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const directory = process.env.RECOVERY_TEST_DIR;
if (process.env.NODE_ENV !== 'test' || !directory?.startsWith(path.join(os.tmpdir(), 'jiesong-recovery-e2e-')) || !process.send) process.exit(2);
process.env.DATABASE_URL = `file:${directory}/test.db`;
async function start() {
  const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.resolve(__dirname, '../../prisma/schema.prisma'), '--script'], { encoding: 'utf8', timeout: 30000 });
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', path.join(directory, 'test.db')], { input: ddl + '\nINSERT INTO password_reset_lock (id) VALUES (1);' });
  const db = require('../utils/prisma');
  const mail = require('../services/emailService');
  mail.isConfigured = () => true;
  mail.sendPasswordResetCode = async (email, code) => fs.writeFileSync(path.join(directory, 'mailbox.json'), JSON.stringify({ email, code }), { mode: 0o600 });
  await db.user.create({ data: { username: 'synthetic-recovery', email: 'recovery@example.com', name: 'Synthetic', password: await require('bcrypt').hash(process.env.RECOVERY_TEST_PASSWORD, 12) } });
  const express = require('express'); const app = express(); app.use(express.json()); app.use('/api/v1/auth', require('../routes/auth'));
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.statusCode ? error.message : 'synthetic server failure', data: null }));
  const server = app.listen(0, '127.0.0.1', () => process.send({ baseURL: `http://127.0.0.1:${server.address().port}` }));
  const close = async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); await db.$disconnect(); process.exit(0); };
  process.on('SIGTERM', close); process.on('disconnect', close);
}
start().catch(() => { console.error('Synthetic recovery fixture failed'); process.exit(1); });
