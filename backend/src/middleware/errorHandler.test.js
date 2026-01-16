/**
 * Input: node:test、node:assert/strict、错误处理中间件
 * Output: 错误处理中间件的单元测试结果
 * Pos: 后端错误处理测试文件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { notFoundHandler, errorHandler, createError } = require('./errorHandler');

/**
 * 职责：创建响应对象并记录状态与响应体
 * @returns {Object} 模拟的Express响应对象
 */
const createMockResponse = () => {
  const res = { statusCode: null, payload: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.payload = body;
    return res;
  };
  return res;
};

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

test('notFoundHandler: 404错误注入到next', () => {
  const req = { originalUrl: '/api/unknown' };
  const { next, capture } = createNextCapture();

  notFoundHandler(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error.statusCode, 404);
  assert.match(capture.error.message, /路由未找到/);
});

test('createError: 自定义状态码', () => {
  const error = createError('无权限', 403);

  assert.equal(error.message, '无权限');
  assert.equal(error.statusCode, 403);
});

test('errorHandler: 开发环境包含堆栈信息', () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const originalConsole = console.error;
  console.error = () => {};

  const res = createMockResponse();
  const error = createError('测试错误', 500);

  errorHandler(error, {}, res, () => {});

  assert.equal(res.statusCode, 500);
  assert.equal(res.payload.message, '测试错误');
  assert.equal(res.payload.code, 500);
  assert.equal(res.payload.data, null);
  assert.ok(res.payload.stack);

  console.error = originalConsole;
  process.env.NODE_ENV = originalEnv;
});

test('errorHandler: 生产环境不暴露堆栈信息', () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const originalConsole = console.error;
  console.error = () => {};

  const res = createMockResponse();
  const error = createError('测试错误', 400);

  errorHandler(error, {}, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.message, '测试错误');
  assert.equal(res.payload.code, 400);
  assert.equal(res.payload.data, null);
  assert.equal(res.payload.stack, undefined);

  console.error = originalConsole;
  process.env.NODE_ENV = originalEnv;
});
