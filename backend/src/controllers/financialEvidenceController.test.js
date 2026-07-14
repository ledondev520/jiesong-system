/**
 * Input: 模拟财务资料服务与 HTTP 响应
 * Output: 查询 Adapter 成功、404 与安全错误响应测试
 * Pos: 财务资料库 HTTP Adapter 单元测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../services/financialEvidenceService');
const controller = require('./financialEvidenceController');

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('financialEvidenceController: 返回资料库摘要', async (t) => {
  const summary = { totals: { documentCount: 2 } };
  t.mock.method(service, 'getFinancialEvidenceSummary', async () => summary);
  const res = response();
  await controller.getSummary({}, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, summary);
});

test('financialEvidenceController: 缺失文档返回 404', async (t) => {
  t.mock.method(service, 'getFinancialEvidenceDocument', async () => null);
  const res = response();
  await controller.getDocument({ params: { id: 'missing' }, query: {} }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, '未找到该财务资料');
});

test('financialEvidenceController: 服务错误不泄露底层明细', async (t) => {
  t.mock.method(service, 'listFinancialEvidenceDocuments', async () => {
    throw new Error('private database detail');
  });
  t.mock.method(console, 'error', () => {});
  const res = response();
  await controller.listDocuments({ query: {} }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, '财务资料查询失败');
  assert.equal(JSON.stringify(res.body).includes('private database detail'), false);
});
