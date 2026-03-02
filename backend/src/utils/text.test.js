/**
 * Input: parseOptionalText 工具
 * Output: 文本清洗函数单元测试
 * Pos: 后端工具测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseOptionalText } = require('./text');

test('parseOptionalText: 去除首尾空白并保留有效文本', () => {
  assert.equal(parseOptionalText('  demo  '), 'demo');
});

test('parseOptionalText: 空白或非字符串返回 undefined', () => {
  assert.equal(parseOptionalText('   '), undefined);
  assert.equal(parseOptionalText(null), undefined);
  assert.equal(parseOptionalText(123), undefined);
});
