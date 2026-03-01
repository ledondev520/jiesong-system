/**
 * Input: dataImport 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('dataImport: 模块可正常加载并导出', () => {
  const mod = require('./dataImport');
  assert.ok(mod !== undefined);
});
