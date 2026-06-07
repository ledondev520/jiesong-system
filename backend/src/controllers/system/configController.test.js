/**
 * Input: configController、prisma
 * Output: 系统配置子控制器测试
 * Pos: 后端控制器测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
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

test('syncExchangeRate: 外部同步失败时快速降级返回当前汇率', async () => {
  const originalFindUnique = prisma.systemConfig.findUnique;
  const originalHttpsGet = https.get;
  prisma.systemConfig.findUnique = async () => ({
    key: 'exchangeRate',
    value: '{"rate":7.1,"buffer":0.2}',
  });

  https.get = () => {
    const request = {
      handlers: {},
      setTimeout: () => request,
      on: (event, handler) => {
        request.handlers[event] = handler;
        return request;
      },
      destroy: (error) => {
        request.handlers.error?.(error);
      },
    };
    setImmediate(() => request.handlers.error?.(new Error('network down')));
    return request;
  };

  try {
    const req = {};
    const res = createMockRes();
    let capturedError = null;

    await configController.syncExchangeRate(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.equal(res.payload.code, 200);
    assert.equal(res.payload.data.rate, 7.1);
    assert.equal(res.payload.data.effectiveRate, 6.8999999999999995);
    assert.equal(res.payload.data.source, 'cached');
    assert.equal(res.payload.data.syncStatus, 'degraded');
    assert.match(res.payload.message, /汇率同步暂不可用/);
  } finally {
    prisma.systemConfig.findUnique = originalFindUnique;
    https.get = originalHttpsGet;
  }
});

test('syncExchangeRate: 外部同步成功时写入当前 schema 支持的配置字段', async () => {
  const originalFindUnique = prisma.systemConfig.findUnique;
  const originalUpsert = prisma.systemConfig.upsert;
  const originalHttpsGet = https.get;
  let upsertArgs = null;

  prisma.systemConfig.findUnique = async () => ({
    key: 'exchangeRate',
    value: '{"rate":7.1,"buffer":0.3}',
  });
  prisma.systemConfig.upsert = async (args) => {
    upsertArgs = args;
    return { key: args.where.key, value: args.update.value };
  };

  https.get = (url, callback) => {
    const response = {
      handlers: {},
      on: (event, handler) => {
        response.handlers[event] = handler;
        return response;
      },
    };
    const request = {
      setTimeout: () => request,
      on: () => request,
      destroy: () => request,
    };
    setImmediate(() => {
      callback(response);
      response.handlers.data?.(JSON.stringify({ rates: { CNY: 7.23 } }));
      response.handlers.end?.();
    });
    return request;
  };

  try {
    const req = {};
    const res = createMockRes();
    let capturedError = null;

    await configController.syncExchangeRate(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.equal(res.payload.code, 200);
    assert.equal(res.payload.data.rate, 7.23);
    assert.equal(res.payload.data.buffer, 0.3);
    assert.equal(upsertArgs.where.key, 'exchangeRate');
    assert.deepEqual(Object.keys(upsertArgs.create).sort(), ['key', 'note', 'value']);
    assert.match(upsertArgs.update.note, /汇率自动同步/);
  } finally {
    prisma.systemConfig.findUnique = originalFindUnique;
    prisma.systemConfig.upsert = originalUpsert;
    https.get = originalHttpsGet;
  }
});
