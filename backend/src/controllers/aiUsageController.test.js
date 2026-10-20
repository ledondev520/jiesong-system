const test = require('node:test');
const assert = require('node:assert/strict');
const aiUsageService = require('../services/aiUsageService');
const controller = require('./aiUsageController');

const createResponse = () => ({
  statusCode: 200,
  payload: null,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.payload = data; return this; },
});

test('AI 调用明细复用分页边界，负值回退、过大 pageSize 截断', async () => {
  const original = aiUsageService.getCallDetails;
  const calls = [];
  aiUsageService.getCallDetails = async (query) => { calls.push(query); return { items: [], total: 0, ...query }; };
  try {
    const response = createResponse();
    await controller.getCallDetails({ query: { page: '-1', pageSize: '-1' } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(calls[0].page, 1);
    assert.equal(calls[0].pageSize, 20);
    await controller.getCallDetails({ query: { page: '2', pageSize: '1000000' } }, createResponse());
    assert.equal(calls[1].page, 2);
    assert.equal(calls[1].pageSize, 500);
  } finally {
    aiUsageService.getCallDetails = original;
  }
});

test('AI 用量趋势无效日期在查询前返回 400，正常日期保持传递', async () => {
  const original = aiUsageService.getUsageTrend;
  const calls = [];
  aiUsageService.getUsageTrend = async (query) => { calls.push(query); return []; };
  try {
    for (const query of [{ dateFrom: 'invalid' }, { dateTo: 'invalid' }, { dateFrom: ['2026-01-01'] }]) {
      const response = createResponse();
      await controller.getUsageTrend({ query }, response);
      assert.equal(response.statusCode, 400);
    }
    assert.equal(calls.length, 0);
    const query = { dateFrom: '2026-01-01', dateTo: '2026-10-01', groupBy: 'month' };
    const response = createResponse();
    await controller.getUsageTrend({ query }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, [query]);
  } finally {
    aiUsageService.getUsageTrend = original;
  }
});
