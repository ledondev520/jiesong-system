/**
 * Input: configController、prisma
 * Output: 系统配置子控制器测试
 * Pos: 后端控制器测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');

// 汇率/加价只来自唯一报价配置：测试使用私有临时文件，绝不读写仓库里的 config/pricing.json。
const pricingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-controller-pricing-'));
const pricingFile = path.join(pricingDir, 'pricing.json');
const writePricing = (overrides = {}) => fs.writeFileSync(pricingFile, JSON.stringify({
  exchangeRate: 7.1, exchangeAdjustment: -0.2, defaultMarkup: 0.3, categoryMarkups: [], ...overrides,
}), { mode: 0o600 });
process.env.JIESONG_PRICING_CONFIG = pricingFile;
writePricing();
test.after(() => fs.rmSync(pricingDir, { recursive: true, force: true }));
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
    { key: 'exchangeRate', value: '{"rate":6.8,"buffer":0.2}' }, // 旧遗留行：不再对外返回
    { key: 'profitRate', value: '1.3' },
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
    assert.equal(Object.hasOwn(res.payload.data, 'exchangeRate'), false);
    assert.equal(Object.hasOwn(res.payload.data, 'profitRate'), false);
    assert.equal(res.payload.data.plainText, 'raw-value');
  } finally {
    prisma.systemConfig.findMany = originalFindMany;
  }
});

test('getConfigs: 敏感配置只返回脱敏状态，不返回完整密钥', async () => {
  const originalFindMany = prisma.systemConfig.findMany;
  const secret = 'sk-test-secret-should-never-leave-the-server';
  prisma.systemConfig.findMany = async () => ([
    { key: 'apiKey', value: JSON.stringify(secret) },
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
    assert.notEqual(res.payload.data.apiKey, secret);
    assert.equal(res.payload.data.apiKey, '••••rver');
    assert.doesNotMatch(JSON.stringify(res.payload), /sk-test-secret/);
  } finally {
    prisma.systemConfig.findMany = originalFindMany;
  }
});

test('getConfigs: 环境变量密钥回退也只返回脱敏状态', async () => {
  const config = require('../../config');
  const originalKey = config.kimi.apiKey;
  const originalFindMany = prisma.systemConfig.findMany;
  // Synthetic, non-production value; never use this fixture as a deployed credential.
  const syntheticKey = 'test-only-non-production-env-key-1234';
  config.kimi.apiKey = syntheticKey;
  prisma.systemConfig.findMany = async () => [];
  try {
    const res = createMockRes();
    await configController.getConfigs({}, res, (error) => { throw error; });
    assert.equal(res.payload.data.apiKey, '••••1234');
    assert.equal(JSON.stringify(res.payload).includes(syntheticKey), false);
  } finally {
    config.kimi.apiKey = originalKey;
    prisma.systemConfig.findMany = originalFindMany;
  }
});

test('getConfigs: DeepSeek 使用独立密钥，旧 Kimi 配置不冒充当前密钥', async () => {
  const config = require('../../config');
  const originalAi = config.ai;
  const originalFindMany = prisma.systemConfig.findMany;
  try {
    for (const stored of [false, true]) {
      config.ai = { provider: 'deepseek', apiKey: 'test-only-deepseek-env-4321' };
      prisma.systemConfig.findMany = async () => [
        { key: 'apiKey', value: JSON.stringify('test-only-legacy-kimi-1111') },
        ...(stored ? [{ key: 'deepseekApiKey', value: JSON.stringify('test-only-deepseek-stored-9876') }] : []),
      ];
      const res = createMockRes();
      await configController.getConfigs({}, res, (error) => { throw error; });
      assert.equal(res.payload.data.aiProvider, 'deepseek');
      assert.equal(res.payload.data.apiKey, stored ? '••••9876' : '••••4321');
      assert.equal(res.payload.data.deepseekApiKey, res.payload.data.apiKey);
      assert.equal(JSON.stringify(res.payload).includes('test-only-'), false);
    }
  } finally {
    config.ai = originalAi;
    prisma.systemConfig.findMany = originalFindMany;
  }
});

test('getConfigs: OpenAI 环境密钥从不返回（连脱敏后缀也没有），只给已配置标记与模型名', async () => {
  const config = require('../../config');
  const originalAi = config.ai;
  const originalFindMany = prisma.systemConfig.findMany;
  try {
    config.ai = { provider: 'openai', apiKey: 'test-only-openai-env-5555', model: 'synthetic-openai-model' };
    prisma.systemConfig.findMany = async () => [];
    const res = createMockRes();
    await configController.getConfigs({}, res, (error) => { throw error; });
    assert.equal(res.payload.data.aiProvider, 'openai');
    assert.equal(res.payload.data.openaiConfigured, true);
    assert.equal(res.payload.data.openaiModel, 'synthetic-openai-model');
    assert.equal(Object.hasOwn(res.payload.data, 'apiKey'), false);
    assert.equal(JSON.stringify(res.payload).includes('5555'), false);
    assert.equal(JSON.stringify(res.payload).includes('test-only-'), false);
  } finally {
    config.ai = originalAi;
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
      params: { key: 'stampPlatformUrl' },
      body: { value: { rate: 7.0, buffer: 0.1 }, note: '链接' },
    };
    const res = createMockRes();
    let capturedError = null;

    await configController.updateConfig(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.equal(upsertArgs.where.key, 'stampPlatformUrl');
    assert.equal(upsertArgs.update.value, JSON.stringify({ rate: 7.0, buffer: 0.1 }));
    assert.equal(res.payload.message, '配置更新成功');
  } finally {
    prisma.systemConfig.upsert = originalUpsert;
  }
});

test('updateConfig: exchangeRate / profitRate 不能经普通 SystemConfig 写入（只经报价配置）', async () => {
  const originalUpsert = prisma.systemConfig.upsert;
  let upserts = 0;
  prisma.systemConfig.upsert = async () => { upserts += 1; return {}; };
  try {
    for (const key of ['exchangeRate', 'profitRate']) {
      let captured = null;
      await configController.updateConfig({ params: { key }, body: { value: 7 } }, createMockRes(), (error) => { captured = error; });
      assert.equal(captured?.statusCode, 400, key);
      assert.match(captured.message, /报价配置/);
    }
    assert.equal(upserts, 0);
  } finally {
    prisma.systemConfig.upsert = originalUpsert;
  }
});

test('updateConfig: 敏感配置写入后响应不回传完整密钥', async () => {
  const originalUpsert = prisma.systemConfig.upsert;
  const secret = 'sk-test-updated-secret-value';

  prisma.systemConfig.upsert = async (args) => ({
    key: args.where.key,
    value: args.update.value,
  });

  try {
    const req = {
      params: { key: 'apiKey' },
      body: { value: secret },
    };
    const res = createMockRes();
    let capturedError = null;

    await configController.updateConfig(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.notEqual(res.payload.data.value, secret);
    assert.equal(res.payload.data.value, '••••alue');
    assert.doesNotMatch(JSON.stringify(res.payload), /sk-test-updated-secret/);
  } finally {
    prisma.systemConfig.upsert = originalUpsert;
  }
});

test('getExchangeRate: 汇率来自唯一报价配置（现汇、调整、报价汇率），不查 SystemConfig', async () => {
  const originalFindUnique = prisma.systemConfig.findUnique;
  prisma.systemConfig.findUnique = async () => { throw new Error('SystemConfig must not be read for pricing'); };
  writePricing({ exchangeRate: 6.72, exchangeAdjustment: -0.2 });
  try {
    const res = createMockRes();
    let capturedError = null;
    await configController.getExchangeRate({}, res, (error) => { capturedError = error; });
    assert.equal(capturedError, null);
    assert.deepEqual(res.payload.data, { rate: 6.72, buffer: 0.2, effectiveRate: 6.52 });
  } finally {
    prisma.systemConfig.findUnique = originalFindUnique;
    writePricing();
  }
});

test('syncExchangeRate: 外部同步失败时快速降级返回当前汇率', async () => {
  const originalFindUnique = prisma.systemConfig.findUnique;
  const originalHttpsGet = https.get;
  writePricing({ exchangeRate: 7.1 });

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
    assert.equal(res.payload.data.effectiveRate, 6.9);
    assert.equal(res.payload.data.source, 'cached');
    assert.equal(res.payload.data.syncStatus, 'degraded');
    assert.match(res.payload.message, /汇率同步暂不可用/);
  } finally {
    prisma.systemConfig.findUnique = originalFindUnique;
    https.get = originalHttpsGet;
  }
});

test('fetchUsdCnyRate: 总超时覆盖尚未建立 socket 的连接阶段', async () => {
  const originalHttpsGet = https.get;
  let destroyed = false;

  https.get = () => {
    const request = {
      handlers: {},
      setTimeout: () => request,
      on: (event, handler) => {
        request.handlers[event] = handler;
        return request;
      },
      destroy: (error) => {
        destroyed = true;
        request.handlers.error?.(error);
      },
    };
    return request;
  };

  try {
    await assert.rejects(
      configController.fetchUsdCnyRate({ timeoutMs: 5 }),
      /汇率同步超时 5ms/,
    );
    assert.equal(destroyed, true);
  } finally {
    https.get = originalHttpsGet;
  }
});

test('syncExchangeRate: 外部同步成功时只替换报价配置的 exchangeRate，其余字段与 SystemConfig 不变', async () => {
  const originalUpsert = prisma.systemConfig.upsert;
  const originalHttpsGet = https.get;
  let upserts = 0;
  writePricing({ exchangeRate: 7.1, exchangeAdjustment: -0.3, defaultMarkup: 0.35 });
  prisma.systemConfig.upsert = async () => { upserts += 1; return {}; };

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
    const req = { user: { id: 'actor-1' } };
    const res = createMockRes();
    let capturedError = null;

    await configController.syncExchangeRate(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.equal(res.payload.code, 200);
    assert.equal(res.payload.data.rate, 7.23);
    assert.equal(res.payload.data.buffer, 0.3);
    assert.equal(upserts, 0);
    const saved = JSON.parse(fs.readFileSync(pricingFile, 'utf8'));
    assert.deepEqual(saved, { exchangeRate: 7.23, exchangeAdjustment: -0.3, defaultMarkup: 0.35, categoryMarkups: [] });
  } finally {
    prisma.systemConfig.upsert = originalUpsert;
    https.get = originalHttpsGet;
    writePricing();
  }
});

// 同步用的假 https.get：返回一段上游响应体（可分多块）。
const stubUpstream = (...chunks) => {
  https.get = (url, callback) => {
    const response = { handlers: {}, on: (event, handler) => { response.handlers[event] = handler; return response; } };
    const request = { destroyed: false, setTimeout: () => request, on: () => request, destroy: () => { request.destroyed = true; return request; } };
    setImmediate(() => {
      callback(response);
      for (const chunk of chunks) response.handlers.data?.(chunk);
      response.handlers.end?.();
    });
    return request;
  };
};

test('syncExchangeRate: 超出区间[5,10]或与当前汇率偏差>5%时 409 拒绝，不写入，提示手动设置', async () => {
  const originalHttpsGet = https.get;
  try {
    for (const upstream of [4.9, 10.5, 7.5]) { // 7.5 vs 7.1 ≈ 5.6%
      writePricing({ exchangeRate: 7.1 });
      stubUpstream(JSON.stringify({ rates: { CNY: upstream } }));
      let captured = null;
      const res = createMockRes();
      await configController.syncExchangeRate({ user: { id: 'a' } }, res, (error) => { captured = error; });
      assert.equal(captured?.statusCode, 409, String(upstream));
      assert.match(captured.message, /手动设置/);
      assert.equal(res.payload, null);
      assert.equal(JSON.parse(fs.readFileSync(pricingFile, 'utf8')).exchangeRate, 7.1);
    }
    // 边界内（5%）仍可同步
    writePricing({ exchangeRate: 7.1 });
    stubUpstream(JSON.stringify({ rates: { CNY: 7.45 } })); // 4.9%
    const ok = createMockRes();
    await configController.syncExchangeRate({ user: { id: 'a' } }, ok, (error) => { throw error; });
    assert.equal(ok.payload.data.rate, 7.45);
  } finally {
    https.get = originalHttpsGet;
    writePricing();
  }
});

test('syncExchangeRate: 上游响应体超过上限即中止并降级，不解析', async () => {
  const originalHttpsGet = https.get;
  try {
    writePricing({ exchangeRate: 7.1 });
    stubUpstream('x'.repeat(40 * 1024), 'x'.repeat(40 * 1024));
    const res = createMockRes();
    await configController.syncExchangeRate({}, res, (error) => { throw error; });
    assert.equal(res.payload.data.syncStatus, 'degraded');
    assert.match(res.payload.data.error, /过大/);
  } finally {
    https.get = originalHttpsGet;
    writePricing();
  }
});

test('syncExchangeRate: 写入失败（无状态码的文件错误）如实交给错误处理，不返回成功', async () => {
  const originalHttpsGet = https.get;
  try {
    writePricing({ exchangeRate: 7.1 });
    stubUpstream(JSON.stringify({ rates: { CNY: 7.2 } }));
    const mode = fs.statSync(pricingDir).mode & 0o777;
    fs.chmodSync(pricingDir, 0o500); // 目录不可写：临时文件/锁创建失败
    let captured = null;
    const res = createMockRes();
    try {
      await configController.syncExchangeRate({ user: { id: 'a' } }, res, (error) => { captured = error; });
    } finally {
      fs.chmodSync(pricingDir, mode);
    }
    if (process.getuid?.() === 0) return; // root 无视目录权限，无法构造写失败
    assert.ok(captured, '写入错误必须传给 next');
    assert.equal(res.payload, null);
  } finally {
    https.get = originalHttpsGet;
    writePricing();
  }
});

test('updateConfig: openai* 键永不写入数据库（密钥/模型只来自服务器环境）', async () => {
  const originalUpsert = prisma.systemConfig.upsert;
  let upserts = 0;
  prisma.systemConfig.upsert = async () => { upserts += 1; return {}; };
  try {
    for (const key of ['openaiApiKey', 'OPENAI_API_KEY', 'openaiModel']) {
      const res = createMockRes();
      let capturedError = null;
      await configController.updateConfig({ params: { key }, body: { value: 'synthetic-non-key' } }, res, (error) => {
        capturedError = error;
      });
      assert.equal(capturedError?.statusCode, 400, key);
      assert.equal(res.payload, null);
    }
    assert.equal(upserts, 0);
  } finally {
    prisma.systemConfig.upsert = originalUpsert;
  }
});


test('updateConfig: invoiceTitleInfo 已并入公司信息，不能再写入（400，不写库）', async () => {
  const originalUpsert = prisma.systemConfig.upsert;
  let upserts = 0;
  prisma.systemConfig.upsert = async () => { upserts += 1; return {}; };
  try {
    let captured = null;
    await configController.updateConfig({ params: { key: 'invoiceTitleInfo' }, body: { value: 'x' } }, createMockRes(), (error) => { captured = error; });
    assert.equal(captured?.statusCode, 400);
    assert.match(captured.message, /公司信息/);
    assert.equal(upserts, 0);
  } finally {
    prisma.systemConfig.upsert = originalUpsert;
  }
});

test('getConfigs: 旧 invoiceTitleInfo（可能含银行行）与 companyBankInfo 一样仅 ADMIN/FINANCE 可读', async () => {
  const originalFindMany = prisma.systemConfig.findMany;
  prisma.systemConfig.findMany = async () => [
    { key: 'invoiceTitleInfo', value: JSON.stringify('公司名称：X\n开户行及账号：SECRET-ACCT') },
    { key: 'companyName', value: JSON.stringify('X') },
  ];
  try {
    for (const [role, visible] of [['ADMIN', true], ['FINANCE', true], ['SALES', false], ['PURCHASE', false], ['BOSS', false], [undefined, false]]) {
      const res = createMockRes();
      await configController.getConfigs({ user: role ? { role } : undefined }, res, (error) => { throw error; });
      assert.equal(Object.hasOwn(res.payload.data, 'invoiceTitleInfo'), visible, String(role));
      assert.equal(res.payload.data.companyName, 'X');
      assert.equal(JSON.stringify(res.payload).includes('SECRET-ACCT'), visible, String(role));
    }
  } finally {
    prisma.systemConfig.findMany = originalFindMany;
  }
});
