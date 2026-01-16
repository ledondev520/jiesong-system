/**
 * Input: node:test、node:assert/strict、授权中间件
 * Output: 认证授权中间件的单元测试结果
 * Pos: 后端授权校验测试文件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { authorize, adminOnly } = require('./auth');

/**
 * 职责：创建捕获next错误的函数
 * @returns {Object} 包含next与捕获结果
 */
const createNextCapture = () => {
  const capture = { called: false, error: null };
  const next = (error) => {
    capture.called = true;
    capture.error = error;
  };
  return { next, capture };
};

test('authorize: 未登录时拒绝', () => {
  const req = {};
  const middleware = authorize('ADMIN');
  const { next, capture } = createNextCapture();

  middleware(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error.statusCode, 401);
  assert.match(capture.error.message, /请先登录/);
});

test('authorize: 角色不匹配时拒绝', () => {
  const req = { user: { role: 'SALES' } };
  const middleware = authorize('ADMIN', 'PURCHASE');
  const { next, capture } = createNextCapture();

  middleware(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error.statusCode, 403);
  assert.match(capture.error.message, /无权限执行此操作/);
});

test('authorize: 角色匹配时放行', () => {
  const req = { user: { role: 'PURCHASE' } };
  const middleware = authorize('ADMIN', 'PURCHASE');
  const { next, capture } = createNextCapture();

  middleware(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error, undefined);
});

test('adminOnly: 仅允许管理员', () => {
  const req = { user: { role: 'ADMIN' } };
  const { next, capture } = createNextCapture();

  adminOnly(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error, undefined);
});
