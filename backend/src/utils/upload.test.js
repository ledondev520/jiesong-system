/**
 * Input: upload 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('upload: 模块可正常加载并导出', () => {
  const mod = require('./upload');
  assert.ok(mod !== undefined);
});
