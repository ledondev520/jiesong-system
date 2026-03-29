/**
 * Input: mcp 路由模块
 * Output: HTTP MCP 路由 smoke test
 * Pos: 远程 MCP endpoint 验证
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('mcp route: 模块可正常加载并导出', () => {
  const mod = require('./mcp');
  assert.ok(mod !== undefined);
});
