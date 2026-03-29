/**
 * Input: agents 路由模块
 * Output: 模块导出冒烟测试
 * Pos: Agent 管理路由 smoke test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('agents: 模块可正常加载并导出', () => {
  const mod = require('./agents');
  assert.ok(mod !== undefined);
});
