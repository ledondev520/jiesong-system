/**
 * Input: financeImportController 模块
 * Output: 模块导出冒烟测试
 * Pos: 财务导入控制器自动测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('financeImportController: 模块可正常加载并导出', () => {
  const mod = require('./financeImportController');
  assert.ok(mod);
  assert.strictEqual(typeof mod.previewBankFlow, 'function');
  assert.strictEqual(typeof mod.importBankFlow, 'function');
  assert.strictEqual(typeof mod.previewInvoices, 'function');
  assert.strictEqual(typeof mod.importInvoices, 'function');
  assert.ok(mod.upload);
});
