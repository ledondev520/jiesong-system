/**
 * Input: Express app
 * Output: 应用入口基础可用性测试
 * Pos: 后端入口测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('./app');

test('app: 以模块方式加载时不直接监听端口', () => {
  assert.equal(typeof app, 'function');
});

test('app: /health 返回基础健康信息', async () => {
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.status, 'ok');
    assert.equal(data.version, '1.0.0');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
