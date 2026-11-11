const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArguments, classifyPending } = require('./finance-pending-backlog-report');

const similarity = (name, candidates) => (candidates.includes(name) ? 100 : 0);
const base = {
  similarity,
  purchaseDraft: (c) => c.status === 'DRAFT',
  salesDraft: (c) => c.status === 'DRAFT',
  validInvoice: (inv) => inv.status === '正常',
  purchaseContracts: [
    { status: 'DRAFT', nameCandidates: ['合成供应商甲'] },
    { status: 'SIGNED', nameCandidates: ['合成供应商乙'] },
    { status: 'DRAFT', nameCandidates: ['合成供应商乙'] },
  ],
  salesContracts: [{ status: 'DRAFT', nameCandidates: ['Synthetic Store A'] }],
};

test('A100 backlog: every PENDING row lands in exactly one bucket and buckets sum to totals', () => {
  const report = classifyPending({
    ...base,
    bankTxns: [
      { currency: 'CNY', counterpart: '无人认识' },
      { currency: 'CNY', counterpart: '合成供应商甲' },
      { currency: 'CNY', counterpart: '合成供应商乙' },
      { currency: 'usd', counterpart: 'Synthetic Store A' },
      { currency: 'EUR', counterpart: '合成供应商乙' },
    ],
    invoices: [
      { seller: '合成供应商乙', status: '正常' },
      { seller: '合成供应商甲', status: '已红冲-全额' },
    ],
  });
  assert.deepEqual(report.bank, { total: 5, NO_COUNTERPART: 2, COUNTERPART_DRAFT: 2, ENGINE_MISS: 1 });
  assert.deepEqual(report.invoice, { total: 2, NO_COUNTERPART: 0, COUNTERPART_DRAFT: 1, ENGINE_MISS: 1 });
  assert.deepEqual(report.detail, { unsupportedCurrency: 1, invalidInvoice: 1 });
  for (const side of [report.bank, report.invoice]) {
    assert.equal(side.NO_COUNTERPART + side.COUNTERPART_DRAFT + side.ENGINE_MISS, side.total);
  }
});

test('A100 backlog CLI: only an absolute --database is accepted', () => {
  assert.equal(parseArguments(['--database', '/private/app.db']).database, '/private/app.db');
  for (const bad of [[], ['--database', 'rel.db'], ['--database'], ['--database', '/a', '--apply']]) {
    assert.throws(() => parseArguments(bad), /用法/);
  }
});
