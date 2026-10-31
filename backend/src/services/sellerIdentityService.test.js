const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLegacyInvoiceTitle, composeInvoiceTitleText, loadSellerIdentity } = require('./sellerIdentityService');

const db = (rows) => ({ systemConfig: { findMany: async ({ where }) => rows.filter((row) => where.key.in.includes(row.key)) } });
const row = (key, value) => ({ key, value: JSON.stringify(value) });
const LEGACY = '公司名称：合成公司\n纳税人识别号：91-X1\n地址电话：1 Road 555\n开户行及账号：Bank 000-ACCT\n随便写点什么';

test('legacy text parser recognises labelled lines (full- or half-width colon) and ignores the rest', () => {
  assert.deepEqual(parseLegacyInvoiceTitle(LEGACY), { name: '合成公司', taxId: '91-X1', address: '1 Road 555', bank: 'Bank 000-ACCT' });
  assert.deepEqual(parseLegacyInvoiceTitle('名称: A\n税号: B\n电话：C\n银行：D\n地址：E'), { name: 'A', taxId: 'B', phone: 'C', bank: 'D', address: 'E' });
  assert.deepEqual(parseLegacyInvoiceTitle('no labels here\n\n'), {});
  assert.deepEqual(parseLegacyInvoiceTitle(undefined), {});
});

test('canonical keys win field by field; the legacy alias fills only empty fields and says which', async () => {
  const identity = await loadSellerIdentity({ includeBank: true, db: db([row('companyName', 'Canon Co'), row('companyPhone', '+1 555'), row('invoiceTitleInfo', LEGACY)]) });
  assert.equal(identity.name, 'Canon Co');
  assert.equal(identity.phone, '+1 555');
  assert.equal(identity.taxId, '91-X1');
  assert.equal(identity.bank, 'Bank 000-ACCT');
  assert.deepEqual(identity.legacyFilled.sort(), ['address', 'bank', 'taxId']);
});

test('nothing configured → all blank (nothing invented); unlabeled legacy text is only a fallback for bank-privileged callers', async () => {
  assert.deepEqual(await loadSellerIdentity({ db: db([]) }), { name: '', address: '', phone: '', taxId: '', bank: '', legacyFilled: [], invoiceTitleText: '' });
  const free = row('invoiceTitleInfo', '自由格式抬头，没有标签');
  assert.equal((await loadSellerIdentity({ includeBank: true, db: db([free]) })).invoiceTitleText, '自由格式抬头，没有标签');
  assert.equal((await loadSellerIdentity({ includeBank: false, db: db([free]) })).invoiceTitleText, '');
});

test('without bank access neither the canonical bank, the legacy bank line nor the raw legacy text is returned', async () => {
  const rows = [row('companyBankInfo', 'CANON-BANK-777'), row('invoiceTitleInfo', LEGACY)];
  const identity = await loadSellerIdentity({ includeBank: false, db: db(rows) });
  assert.equal(identity.bank, '');
  assert.equal(JSON.stringify(identity).includes('ACCT'), false);
  assert.equal(JSON.stringify(identity).includes('CANON-BANK-777'), false);
  assert.equal(identity.legacyFilled.includes('bank'), false);
  assert.equal(identity.name, '合成公司');
});

test('invoice title text is composed from the one identity (address and phone share a line)', () => {
  assert.equal(composeInvoiceTitleText({ name: 'N', taxId: 'T', address: 'A\nB', phone: 'P', bank: 'X\nY' }),
    '公司名称：N\n纳税人识别号：T\n地址电话：A B P\n开户行及账号：X Y');
  assert.equal(composeInvoiceTitleText({ name: '', taxId: '', address: '', phone: '', bank: '' }, '  旧文本 '), '旧文本');
});
