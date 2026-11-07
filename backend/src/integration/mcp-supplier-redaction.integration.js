/** MCP create_supplier/update_supplier return bank fields only to bank roles (synthetic data; agent tokens never). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { copyTemplate } = require('../testHelpers/sqlite-template');

test('MCP supplier results carry bank fields only for bank roles', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-mcp-supplier-redaction-'));
  fs.chmodSync(directory, 0o700);
  const dbFile = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-review-secret-never-production';
  let db, server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  copyTemplate('schema', dbFile);
  fs.chmodSync(dbFile, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  const { hashAgentSecret } = require('../utils/agentCredentials');
  const tokens = {};
  for (const role of ['SALES', 'WAREHOUSE', 'PURCHASE', 'FINANCE']) {
    const user = await db.user.create({ data: { username: `review-${role}`, password: 'unused', name: role, role, isActive: true } });
    // Token claim says ADMIN on purpose: the DB role decides (same pattern as mcp-rbac-deletes).
    tokens[role] = jwt.sign({ userId: user.id, role: 'ADMIN' }, config.jwt.secret);
  }
  const account = await db.agentAccount.create({ data: { name: 'review agent', slug: 'review-agent' } });
  const credential = await db.agentCredential.create({ data: { agentAccountId: account.id, credentialKey: 'reviewkey', secretHash: hashAgentSecret('review-secret') } });
  for (const action of ['create', 'update']) {
    await db.agentGrant.create({ data: { agentAccountId: account.id, agentCredentialId: credential.id, resource: 'supplier', action } });
  }
  tokens.AGENT = 'jsa_reviewkey.review-secret';
  const BANK = { bankAccountName: 'SYNTH-NAME', bankName: 'SYNTH-BANK', bankBranch: 'SYNTH-BRANCH', bankCode: 'SYNTH-CODE', bankAccount: 'SYNTH-0000' };
  const target = await db.supplier.create({ data: { name: 'Review supplier', ...BANK } });
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const mcp = async (who, name, args) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokens[who]}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    });
    return { status: response.status, text: await response.text() };
  };
  for (const [who, sees] of [['SALES', false], ['WAREHOUSE', false], ['AGENT', false], ['PURCHASE', true], ['FINANCE', true]]) {
    const updated = await mcp(who, 'update_supplier', { id: target.id, shortName: `s-${who}` });
    assert.equal(updated.status, 200, `${who} update: ${updated.text}`);
    assert.equal(/SYNTH-0000/.test(updated.text), sees, `${who} update_supplier bank visibility`);
    assert.match(updated.text, new RegExp(`s-${who}`));
    const created = await mcp(who, 'create_supplier', { name: `Review new ${who}`, ...BANK });
    assert.equal(created.status, 200, `${who} create: ${created.text}`);
    assert.equal(/SYNTH-0000/.test(created.text), sees, `${who} create_supplier bank visibility`);
  }
  // Non-bank writers cannot set bank fields either (sanitizeSupplierInput); stored values stay intact.
  assert.equal((await db.supplier.findFirst({ where: { name: 'Review new SALES' } })).bankAccount, null);
  assert.equal((await db.supplier.findFirst({ where: { name: 'Review new AGENT' } })).bankAccount, null);
  assert.equal((await db.supplier.findUnique({ where: { id: target.id } })).bankAccount, 'SYNTH-0000');
});
