/** Synthetic hashes only; this unit test does not open a database or load configuration. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { ensureBootstrapAdmin } = require('./bootstrapAdmin');

test('secure admin ignores unused invalid bootstrap settings; password writes still validate', async () => {
  const admin = { id: 'synthetic', password: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 4) };
  const db = { user: { findUnique: async () => admin } };
  for (const password of ['', 'short', 'x'.repeat(73)]) {
    assert.equal(await ensureBootstrapAdmin(db, { password }), admin);
  }
  const empty = { user: { findUnique: async () => null } };
  await assert.rejects(ensureBootstrapAdmin(empty, { password: 'short', allowCreate: true }), { statusCode: 400 });
  const legacy = { user: { findUnique: async () => ({ ...admin, password: await bcrypt.hash('123456', 4) }) } };
  await assert.rejects(ensureBootstrapAdmin(legacy, { password: 'short' }), { statusCode: 400 });
});
