/**
 * Input: node:test、node:assert/strict、express-validator规则
 * Output: 参数验证与错误处理的单元测试结果
 * Pos: 后端参数校验工具测试文件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  handleValidation,
  validateId,
  validatePagination,
  validateLogin,
  validateRegister,
} = require('./validators');

/**
 * 职责：顺序执行验证规则
 * @param {Array} validations - 验证规则数组
 * @param {Object} req - Express请求对象
 */
const runValidations = async (validations, req) => {
  for (const validation of validations) {
    await validation.run(req);
  }
};

/**
 * 职责：构建基础请求对象
 * @param {Object} options - body/query/params覆盖
 * @returns {Object} 模拟的请求对象
 */
const createRequest = (options = {}) => {
  return {
    body: {},
    query: {},
    params: {},
    ...options,
  };
};

/**
 * 职责：创建可捕获错误的next函数
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

test('validateLogin: 必填字段验证', async () => {
  const req = createRequest({ body: { username: 'admin' } });

  await runValidations(validateLogin, req);
  const { next, capture } = createNextCapture();
  handleValidation(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error.statusCode, 400);
  assert.match(capture.error.message, /密码不能为空/);
});

test('validateLogin: 正常通过', async () => {
  const req = createRequest({ body: { username: 'admin', password: 'pass123' } });

  await runValidations(validateLogin, req);
  const { next, capture } = createNextCapture();
  handleValidation(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error, undefined);
});

test('validateRegister: 角色无效', async () => {
  const req = createRequest({
    body: { username: 'user1', password: 'pass123', name: '张三', role: 'OTHER' },
  });

  await runValidations(validateRegister, req);
  const { next, capture } = createNextCapture();
  handleValidation(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error.statusCode, 400);
  assert.match(capture.error.message, /角色无效/);
});

test('validateRegister: 新角色 FINANCE 可通过', async () => {
  const req = createRequest({
    body: { username: 'user2', password: 'pass123', name: '李四', role: 'FINANCE' },
  });

  await runValidations(validateRegister, req);
  const { next, capture } = createNextCapture();
  handleValidation(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error, undefined);
});

test('validateRegister: 用户名长度不足', async () => {
  const req = createRequest({
    body: { username: 'ab', password: 'pass123', name: '张三' },
  });

  await runValidations(validateRegister, req);
  const { next, capture } = createNextCapture();
  handleValidation(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error.statusCode, 400);
  assert.match(capture.error.message, /用户名长度3-20字符/);
});

test('validatePagination: 页码与每页数量', async () => {
  const req = createRequest({ query: { page: 1, pageSize: 600 } });

  await runValidations(validatePagination, req);
  const { next, capture } = createNextCapture();
  handleValidation(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error.statusCode, 400);
  assert.match(capture.error.message, /每页数量必须在1-500之间/);
});

test('validateId: ID参数不能为空', async () => {
  const req = createRequest({ params: { id: '' } });

  await runValidations([validateId], req);
  const { next, capture } = createNextCapture();
  handleValidation(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error.statusCode, 400);
  assert.match(capture.error.message, /ID不能为空/);
});
