const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseDate,
  extractEXPNo,
  buildPaymentNote,
} = require('./import-payments');

test('extractEXPNo: 提取并规范化合同号', () => {
  assert.equal(extractEXPNo('exp250024'), 'EXP250024');
  assert.equal(extractEXPNo('合同 EXP2400001 回款'), 'EXP2400001');
  assert.equal(extractEXPNo('POR240008'), null);
});

test('parseDate: 支持 Excel 序列号日期', () => {
  const parsed = parseDate(45369);
  assert.ok(parsed instanceof Date);
  assert.equal(parsed.getUTCFullYear(), 2024);
});

test('buildPaymentNote: 命中 EXP 合同号时输出标准化备注', () => {
  const note = buildPaymentNote({
    contractRef: 'exp250024',
    store: '圣何塞店',
    usage: '收入',
    year: '2025',
  });

  assert.equal(note, '合同号:EXP250024 | 门店:圣何塞店 | 用途:收入');
});

test('buildPaymentNote: 无 EXP 合同号时保留原始单号和结构化信息', () => {
  const note = buildPaymentNote({
    contractRef: 'POR240008',
    store: 'Burbank',
    usage: '收入',
    year: '2025',
  });

  assert.equal(note, '原始单号:POR240008 | 门店:Burbank | 用途:收入');
});

test('buildPaymentNote: 无引用号时也输出可读的结构化备注', () => {
  const note = buildPaymentNote({
    contractRef: '',
    store: '',
    usage: '收入',
    year: '2025',
  });

  assert.equal(note, '年度:2025 | 用途:收入');
});
