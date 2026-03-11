/**
 * Input: rateLimit 中间件
 * Output: 速率限制测试
 * Pos: 中间件测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { rateLimit, strictRateLimit, gentleRateLimit } = require('./rateLimit');

test('rateLimit: 在限制范围内允许请求通过', async () => {
  const limiter = rateLimit({ windowMs: 60000, max: 5 });
  let callCount = 0;

  for (let i = 0; i < 3; i++) {
    const req = { ip: '192.168.1.1' };
    const res = {
      setHeader: () => {},
      status: () => res,
      json: () => {},
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    limiter(req, res, next);
    assert.ok(nextCalled, `请求 ${i + 1} 应该通过`);
    callCount++;
  }

  assert.equal(callCount, 3);
});

test('rateLimit: 超过限制后返回 429', async () => {
  const limiter = rateLimit({ windowMs: 60000, max: 3 });
  let statusCode = null;
  let responseData = null;

  // 先发起 3 次请求
  for (let i = 0; i < 3; i++) {
    const req = { ip: '192.168.1.2' };
    const res = { setHeader: () => {} };
    const next = () => {};
    limiter(req, res, next);
  }

  // 第 4 次请求应该被限制
  const req = { ip: '192.168.1.2' };
  const res = {
    setHeader: () => {},
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (data) => {
      responseData = data;
    },
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  limiter(req, res, next);

  assert.equal(statusCode, 429);
  assert.ok(responseData.message.includes('频繁'));
  assert.ok(!nextCalled);
});

test('strictRateLimit: 使用更严格的限制', async () => {
  const limiter = strictRateLimit();
  let statusCode = null;

  // 发起 10 次请求
  for (let i = 0; i < 10; i++) {
    const req = { ip: '192.168.1.3' };
    const res = { setHeader: () => {} };
    const next = () => {};
    limiter(req, res, next);
  }

  // 第 11 次请求应该被限制
  const req = { ip: '192.168.1.3' };
  const res = {
    setHeader: () => {},
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: () => {},
  };
  const next = () => {};

  limiter(req, res, next);
  assert.equal(statusCode, 429);
});

test('gentleRateLimit: 使用宽松的限制', async () => {
  const limiter = gentleRateLimit();
  let nextCalledCount = 0;

  // 发起 30 次请求，应该都能通过
  for (let i = 0; i < 30; i++) {
    const req = { ip: '192.168.1.4' };
    const res = { setHeader: () => {} };
    const next = () => { nextCalledCount++; };
    limiter(req, res, next);
  }

  assert.equal(nextCalledCount, 30);
});

test('rateLimit: 响应头包含限流信息', async () => {
  const limiter = rateLimit({ windowMs: 60000, max: 10 });
  let headers = {};

  const req = { ip: '192.168.1.5' };
  const res = {
    setHeader: (key, value) => {
      headers[key] = value;
    },
  };
  const next = () => {};

  limiter(req, res, next);

  assert.ok(headers['X-RateLimit-Limit'] === 10);
  assert.ok(headers['X-RateLimit-Remaining'] !== undefined);
  assert.ok(headers['X-RateLimit-Reset'] !== undefined);
});
