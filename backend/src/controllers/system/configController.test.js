/**
 * Input: configController、prisma
 * Output: 系统配置子控制器测试
 * Pos: 后端控制器测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../utils/prisma');
const configController = require('./configController');

const createMockRes = () => {
  const res = { statusCode: null, payload: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.payload = payload;
    return res;
  };
  return res;
};

test('getConfigs: JSON 配置解析为对象，非 JSON 保留原字符串', async () => {
  const originalFindMany = prisma.systemConfig.findMany;
  prisma.systemConfig.findMany = async () => ([
    { key: 'exchangeRate', value: '{"rate":6.8,"buffer":0.2}' },
    { key: 'plainText', value: 'raw-value' },
  ]);

  try {
    const req = {};
    const res = createMockRes();
    let capturedError = null;

    await configController.getConfigs(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.equal(res.payload.code, 200);
    assert.deepEqual(res.payload.data.exchangeRate, { rate: 6.8, buffer: 0.2 });
    assert.equal(res.payload.data.plainText, 'raw-value');
  } finally {
    prisma.systemConfig.findMany = originalFindMany;
  }
});

test('updateConfig: upsert 时会 JSON.stringify(value)', async () => {
  const originalUpsert = prisma.systemConfig.upsert;
  let upsertArgs = null;

  prisma.systemConfig.upsert = async (args) => {
    upsertArgs = args;
    return { key: args.where.key, value: args.update.value };
  };

  try {
    const req = {
      params: { key: 'exchangeRate' },
      body: { value: { rate: 7.0, buffer: 0.1 }, note: '汇率' },
    };
    const res = createMockRes();
    let capturedError = null;

    await configController.updateConfig(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.equal(upsertArgs.where.key, 'exchangeRate');
    assert.equal(upsertArgs.update.value, JSON.stringify({ rate: 7.0, buffer: 0.1 }));
    assert.equal(res.payload.message, '配置更新成功');
  } finally {
    prisma.systemConfig.upsert = originalUpsert;
  }
});

test('getExchangeRate: 配置缺失时返回默认值', async () => {
  const originalFindUnique = prisma.systemConfig.findUnique;
  prisma.systemConfig.findUnique = async () => null;

  try {
    const req = {};
    const res = createMockRes();
    let capturedError = null;

    await configController.getExchangeRate(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.deepEqual(res.payload.data, {
      rate: 6.8,
      buffer: 0.2,
      effectiveRate: 6.6,
    });
  } finally {
    prisma.systemConfig.findUnique = originalFindUnique;
  }
});
