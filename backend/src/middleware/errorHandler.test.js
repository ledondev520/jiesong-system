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

test('errorHandler: 英文技术错误转为通用中文提示', () => {
  const originalConsole = console.error;
  console.error = () => {};

  // 500 英文错误 → 通用服务器错误提示
  const res500 = createMockResponse();
  errorHandler(new Error("Cannot read properties of undefined (reading 'id')"), {}, res500, () => {});
  assert.equal(res500.payload.message, '服务器内部错误，请稍后重试');

  // 400 英文错误 → 通用请求失败提示
  const res400 = createMockResponse();
  errorHandler(createError('Invalid input', 400), {}, res400, () => {});
  assert.equal(res400.payload.message, '请求处理失败，请检查输入后重试');

  console.error = originalConsole;
});

test('errorHandler: 已知错误族映射为具体中文提示', () => {
  const originalConsole = console.error;
  console.error = () => {};

  // Prisma 唯一性冲突
  const prismaError = new Error('Unique constraint failed on the fields: (`contractNo`)');
  prismaError.code = 'P2002';
  const resPrisma = createMockResponse();
  errorHandler(prismaError, {}, resPrisma, () => {});
  assert.match(resPrisma.payload.message, /唯一性冲突/);

  // Multer 文件过大
  const multerError = new Error('File too large');
  multerError.code = 'LIMIT_FILE_SIZE';
  multerError.statusCode = 400;
  const resMulter = createMockResponse();
  errorHandler(multerError, {}, resMulter, () => {});
  assert.match(resMulter.payload.message, /文件大小超出限制/);

  // JWT 过期
  const jwtError = new Error('jwt expired');
  jwtError.name = 'TokenExpiredError';
  jwtError.statusCode = 401;
  const resJwt = createMockResponse();
  errorHandler(jwtError, {}, resJwt, () => {});
  assert.match(resJwt.payload.message, /登录已过期/);

  console.error = originalConsole;
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

test('errorHandler: 实际Multer限制错误保持400且不把未知内部错误当输入错误', t => {
  t.mock.method(console, 'error', () => {});
  const multer = require('multer');
  for (const code of ['LIMIT_FILE_SIZE', 'LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE']) {
    const res = createMockResponse();
    errorHandler(new multer.MulterError(code), {}, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.payload.code, 400);
  }
  const res = createMockResponse();
  errorHandler(new Error('synthetic internal failure'), {}, res, () => {});
  assert.equal(res.statusCode, 500);
});
