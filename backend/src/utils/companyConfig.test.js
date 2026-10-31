const test = require('node:test');
const assert = require('node:assert/strict');
const { isCompanyConfigKey, validateCompanyConfigValue: validate } = require('./companyConfig');

const bad = (key, value, pattern) => assert.throws(() => validate(key, value), (error) => error.statusCode === 400 && pattern.test(error.message), `${key} ${String(JSON.stringify(value)).slice(0, 40)}`);

test('only the three shared keys are company settings', () => {
  for (const key of ['companyName', 'companyAddress', 'companyBankInfo']) assert.equal(isCompanyConfigKey(key), true);
  for (const key of ['invoiceTitleInfo', 'companyInfo', 'toString', '__proto__']) assert.equal(isCompanyConfigKey(key), false);
  assert.equal(validate('somethingElse', { any: 1 }).any, 1, 'other keys pass through untouched');
});

test('empty is allowed (clears the value); text is trimmed and spaces collapsed', () => {
  assert.equal(validate('companyName', ''), '');
  assert.equal(validate('companyName', '   '), '');
  assert.equal(validate('companyName', '  Synthetic   Export  Co '), 'Synthetic Export Co');
});

test('multi-line fields keep line breaks, normalise CRLF, drop blank edge lines and trim each line', () => {
  assert.equal(validate('companyAddress', '\n 1 Synthetic Road \r\n City  Name\r\n\n'), '1 Synthetic Road\nCity Name');
  assert.equal(validate('companyBankInfo', 'Bank: Synthetic\nAccount: 1234 5678\n\nSWIFT: ABCDGB2L'), 'Bank: Synthetic\nAccount: 1234 5678\n\nSWIFT: ABCDGB2L');
});

test('rejects non-text, control characters, line breaks in the one-line name, overlong and too many lines', () => {
  for (const value of [null, undefined, 5, {}, [], true]) bad('companyName', value, /必须是文本/);
  bad('companyName', 'a\nb', /一行/);
  bad('companyName', 'a\tb', /控制字符/);
  bad('companyAddress', 'a\u0000b', /控制字符/);
  bad('companyAddress', 'a\tb', /控制字符/);
  bad('companyName', 'x'.repeat(201), /不能超过 200/);
  bad('companyAddress', 'x'.repeat(501), /不能超过 500/);
  bad('companyBankInfo', 'x'.repeat(1001), /不能超过 1000/);
  bad('companyBankInfo', Array(13).fill('l').join('\n'), /最多 12 行/);
  assert.equal(validate('companyBankInfo', Array(12).fill('l').join('\n')).split('\n').length, 12);
});
