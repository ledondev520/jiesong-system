/**
 * Input: HSCode 种子脚本导出
 * Output: HSCode 示例数据约束测试
 * Pos: 后端脚本测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { sampleHsCodes } = require('./seed-hscodes');

test('sampleHsCodes: 提供 100 条唯一且字段完整的 HSCode 示例数据', () => {
  assert.equal(sampleHsCodes.length, 100);

  const uniqueCodes = new Set(sampleHsCodes.map((item) => item.hsCode));
  assert.equal(uniqueCodes.size, 100);

  for (const item of sampleHsCodes) {
    assert.match(item.hsCode, /^\d{8}$/);
    assert.equal(typeof item.productName, 'string');
    assert.ok(item.productName.length > 0);
    assert.equal(typeof item.taxRate, 'number');
    assert.ok(Number.isFinite(item.taxRate));
    assert.ok(item.unit === null || typeof item.unit === 'string');
    assert.ok(item.note === null || typeof item.note === 'string');
    assert.ok(!Number.isNaN(new Date(item.effectiveDate).getTime()));
  }
});
