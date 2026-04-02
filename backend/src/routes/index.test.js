/**
 * Input: index 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('index: 模块可正常加载并导出', () => {
  const mod = require('./index');
  assert.ok(mod !== undefined);
});

test('index: 挂载 batch-import 路由', () => {
  const router = require('./index');
  const mountedPaths = router.stack
    .filter((layer) => layer.name === 'router' && layer.regexp)
    .map((layer) => String(layer.regexp));

  assert.ok(
    mountedPaths.some((entry) => entry.includes('batch-import')),
    '缺少 /batch-import 路由挂载',
  );
});
