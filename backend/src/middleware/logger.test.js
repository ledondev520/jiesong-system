/**
 * Input: logger 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('logger: 模块可正常加载并导出', () => {
  const mod = require('./logger');
  assert.ok(mod !== undefined);
});

test('summarizeRequestFields: 请求日志只保留结构，不复制 AI 提示词或业务值', () => {
  const { summarizeRequestFields } = require('./logger');
  const summary = summarizeRequestFields({
    system: 'confidential system prompt',
    messages: [{ role: 'user', content: 'confidential customer question' }],
    tools: [{ name: 'SearchEntities', description: 'long tool description' }],
    max_tokens: 4096,
  }, '38123');

  assert.deepEqual(summary, {
    present: true,
    type: 'object',
    fieldCount: 4,
    fields: ['system', 'messages', 'tools', 'max_tokens'],
    contentLength: 38123,
  });
  assert.doesNotMatch(JSON.stringify(summary), /confidential|customer question|tool description/);
});

test('getLogRoutePath: 优先记录 Express 路由模板而不是具体参数值', () => {
  const { getLogRoutePath } = require('./logger');

  assert.equal(getLogRoutePath({
    baseUrl: '/api/v1/sales',
    route: { path: '/:id/finance-summary' },
    originalUrl: '/api/v1/sales/confidential-id/finance-summary?debug=1',
  }), '/api/v1/sales/:id/finance-summary');
});
