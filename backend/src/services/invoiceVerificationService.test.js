/**
 * Input: 出货汇总候选行与仿真发票记录
 * Output: 发票号码、销方、金额、品名和状态核验回归测试
 * Pos: 出口退税发票只读核验 Module 测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidInvoiceNumber,
  normalizeInvoiceNumber,
  verifyShipmentInvoices,
} = require('./invoiceVerificationService');

const shipment = {
  sourceRow: 100,
  contractNo: 'EXP260004',
  invoiceNo: '26110000000000000001',
  expectedSeller: '测试供应商有限公司',
  itemName: '餐盘',
  supplement: '密胺',
  expectedTotal: 113,
};

const invoice = {
  invNo: '26110000000000000001',
  seller: '测试供应商有限公司',
  sellerTaxId: 'TEST-TAX-ID',
  invDate: '2026-06-01',
  itemName: '*塑料制品*餐盘',
  spec: '10寸',
  qty: 10,
  amount: 100,
  tax: 13,
  total: 113,
  status: '正常',
  isPositive: '是',
  lookupSource: 'database',
};

test('发票号码标准化只移除空白，不吞掉前导零', () => {
  assert.equal(normalizeInvoiceNumber(' 00123456 '), '00123456');
  assert.equal(isValidInvoiceNumber('00123456'), true);
  assert.equal(isValidInvoiceNumber('261100000000000001'), false);
});

test('完全一致时通过，并识别税收分类前缀后的商品本体', () => {
  const result = verifyShipmentInvoices({ shipmentRows: [shipment], invoiceRecords: [invoice] });
  assert.deepEqual(result.summary, {
    shipmentRows: 1,
    uniqueInvoices: 1,
    found: 1,
    pass: 1,
    review: 0,
    missing: 0,
    invalidInvoiceNumber: 0,
  });
  assert.equal(result.results[0].checks.item, true);
});

test('同一发票覆盖多条源行时按采购金额合计核验', () => {
  const result = verifyShipmentInvoices({
    shipmentRows: [
      { ...shipment, sourceRow: 100, itemName: '餐盘', expectedTotal: 56.5 },
      { ...shipment, sourceRow: 101, itemName: '餐碗', expectedTotal: 56.5 },
    ],
    invoiceRecords: [{ ...invoice, itemName: '*塑料制品*餐盘｜餐碗' }],
  });
  assert.equal(result.results[0].expectedTotal, 113);
  assert.equal(result.results[0].status, 'PASS');
});

test('未查到与查到但金额不一致分别标记 MISSING 和 REVIEW', () => {
  const missing = verifyShipmentInvoices({ shipmentRows: [shipment], invoiceRecords: [] });
  assert.equal(missing.results[0].status, 'MISSING');

  const mismatch = verifyShipmentInvoices({
    shipmentRows: [shipment],
    invoiceRecords: [{ ...invoice, total: 120 }],
  });
  assert.equal(mismatch.results[0].status, 'REVIEW');
  assert.match(mismatch.results[0].issues.join('；'), /价税合计/);
});

test('相同发票同时来自数据库和导出文件时合并来源而不误报重复', () => {
  const result = verifyShipmentInvoices({
    shipmentRows: [shipment],
    invoiceRecords: [invoice, { ...invoice, lookupSource: 'invoice_file' }],
  });
  assert.equal(result.results[0].status, 'PASS');
  assert.deepEqual(result.results[0].lookupSources, ['database', 'invoice_file']);
});

test('未命中发票时仍保留源表厂家缺失问题，便于补证据', () => {
  const result = verifyShipmentInvoices({
    shipmentRows: [{ ...shipment, expectedSeller: null }],
    invoiceRecords: [],
  });
  assert.equal(result.results[0].status, 'MISSING');
  assert.match(result.results[0].issues.join('；'), /源表缺少厂家/);
});
