/** Input: validated package and readonly SQLite snapshot. Output: normal target-bound transfer plan. No Prisma or writable DB connection. */
const crypto = require('node:crypto');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const service = require('../src/services/financialEvidenceTransferService');

function planFromSnapshot(bundle, snapshot) {
  if (snapshot?.format !== 'financial-evidence-readonly-snapshot-v1' || snapshot.readOnly !== true
    || !Array.isArray(snapshot.documents) || !Array.isArray(snapshot.periods)) throw new Error('Invalid readonly snapshot');
  const { host, file, device, inode } = snapshot.target || {};
  if (![host, file, device, inode].every(v => typeof v === 'string' && v.length)) throw new Error('Missing target identity');
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify([host, file, device, inode])).digest('hex');
  // Only the two read operations consumed by preview are available; writes cannot be dispatched.
  const adapter = {
    financialEvidenceDocument: { findMany: async ({ where }) => snapshot.documents.filter(doc =>
      where.OR.some(filter => Object.entries(filter).every(([key, value]) => doc[key] === value))) },
    financialPeriod: { findUnique: async ({ where }) => snapshot.periods.find(p => p.id === where.id) || null },
    $transaction: async callback => callback(adapter),
  };
  return service.previewBundle(bundle, adapter, fingerprint);
}

function readSnapshot(bundle, database) {
  service.validateBundle(bundle);
  const selection = bundle.documents.map(({ sourceKey, contentSha256, category }) => ({ sourceKey, contentSha256, category }));
  const output = execFileSync('python3', [path.join(__dirname, 'financial-evidence-readonly.py'), database], {
    input: JSON.stringify(selection), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: 60000,
  });
  return JSON.parse(output);
}

module.exports = { readSnapshot, planFromSnapshot };
