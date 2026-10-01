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

test('专用历史CSV预览和执行均仅限ADMIN，普通采购不能绕过验货', () => {
  const router = require('./dataImport');
  for (const path of ['/preview', '/execute']) {
    const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods.post).route;
    const gate = route.stack.find(layer => layer.handle.isRoleAuth)?.handle;
    assert.deepEqual(gate.allowedRoles, ['ADMIN']);
    let error;
    gate({ user: { role: 'PURCHASE' } }, {}, (value) => { error = value; });
    assert.equal(error.statusCode, 403);
  }
});
