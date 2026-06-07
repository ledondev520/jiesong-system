/**
 * Input: prisma.systemConfig KV 存储
 * Output: 系统配置读写接口（平铺格式 + 分域格式）；仅 Kimi/Moonshot AI 密钥
 * Pos: 系统配置控制层，支持向后兼容的平铺 getConfigs 与新增的分域 getConfigsByDomain
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const https = require('https');
const prisma = require('../../utils/prisma');
const { success } = require('../../utils/response');
const { createError } = require('../../middleware/errorHandler');
const {
  normalizeConfigValueForResponse,
  normalizeConfigValueForStorage,
} = require('../../utils/secretCrypto');

const parsePositiveIntEnv = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const EXCHANGE_RATE_SYNC_TIMEOUT_MS = parsePositiveIntEnv(
  process.env.EXCHANGE_RATE_SYNC_TIMEOUT_MS,
  1800,
);

/**
 * 配置键到域的映射表（不改 schema，仅在应用层做域划分）
 * - 新增配置 key 时，须在此表补充对应域，否则归入 "其他" 域。
 */
const CONFIG_DOMAIN_MAP = {
  // 基础参数域：影响定价与汇率计算的全局数值
  exchangeRate: { domain: 'params', label: '基础参数', note: '用于销售合同初始汇率填充' },
  profitRate:   { domain: 'params', label: '基础参数', note: '例如 1.3 表示 30% 利润率' },

  // 数据字典域：系统枚举值与下拉列表
  units:        { domain: 'dictionary', label: '数据字典', note: '商品计量单位枚举' },
  brokers:      { domain: 'dictionary', label: '数据字典', note: '报关公司枚举' },

  // AI 集成域：外部 AI 服务鉴权与参数
  apiKey:         { domain: 'ai', label: 'AI集成', note: 'Kimi API 密钥（脱敏存储）' },
  kimiModel:      { domain: 'ai', label: 'AI集成', note: 'Kimi 模型名称' },
  aiChatModel:     { domain: 'ai', label: 'AI集成', note: 'AI 助手问答场景使用的模型' },
  aiHsCodeModel:   { domain: 'ai', label: 'AI集成', note: 'HS Code 推荐与申报要素场景使用的模型' },
  aiPrimaryModel:  { domain: 'ai', label: 'AI集成', note: '（旧）AI 首选模型（已迁移至场景化配置）' },
  aiFallbackModel: { domain: 'ai', label: 'AI集成', note: '（旧）AI 备用模型（已迁移至场景化配置）' },
  aiTemperature:  { domain: 'ai', label: 'AI集成', note: '采样温度 0–1' },
  aiMaxTokens:    { domain: 'ai', label: 'AI集成', note: '最大输出 token 数' },

  // HSCIQ 海关归类 API 集成
  hsciqEnabled:   { domain: 'ai', label: 'AI集成', note: '是否启用 HSCIQ 海关归类 API（开启后 HS 编码推荐与申报要素将优先调用官方 API）' },
};

const getDomainMeta = (key) => CONFIG_DOMAIN_MAP[key] || { domain: 'other', label: '其他', note: '' };

const buildConfigValue = (key, value) => {
  if (value === undefined || value === null) {
    return value;
  }
  return normalizeConfigValueForResponse(key, value);
};

const formatConfigResponse = (configRecord) => {
  if (!configRecord) return configRecord;
  return {
    ...configRecord,
    value: buildConfigValue(configRecord.key, configRecord.value),
  };
};

const resolveExchangeRateConfig = async () => {
  const config = await prisma.systemConfig.findUnique({
    where: { key: 'exchangeRate' },
  });

  let rate = { rate: 6.8, buffer: 0.2, effectiveRate: 6.6 };
  if (config) {
    try {
      const parsed = JSON.parse(config.value);
      rate = {
        ...parsed,
        effectiveRate: parsed.rate - (parsed.buffer || 0.2),
      };
    } catch (parseError) {
      // exchangeRate 配置值不是合法 JSON，降级为默认值并记录以便排查。
      console.warn('[configController] exchangeRate 解析失败，使用默认值:', parseError?.message);
    }
  }

  return rate;
};

const fetchUsdCnyRate = async () => new Promise((resolve, reject) => {
  const url = 'https://open.er-api.com/v6/latest/USD';
  const request = https.get(url, (response) => {
    let data = '';
    response.on('data', (chunk) => { data += chunk; });
    response.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const cnyRate = parsed?.rates?.CNY;
        if (typeof cnyRate !== 'number' || cnyRate <= 0) {
          reject(new Error('汇率数据异常'));
        } else {
          resolve(Math.round(cnyRate * 100) / 100);
        }
      } catch {
        reject(new Error('解析汇率响应失败'));
      }
    });
  });

  request.setTimeout(EXCHANGE_RATE_SYNC_TIMEOUT_MS, () => {
    request.destroy(new Error(`汇率同步超时 ${EXCHANGE_RATE_SYNC_TIMEOUT_MS}ms`));
  });
  request.on('error', reject);
});

/**
 * 职责：获取所有系统配置（平铺格式，向后兼容）
 * @returns {Object} key→value 的平铺对象
 */
const getConfigs = async (req, res, next) => {
  try {
    const configs = await prisma.systemConfig.findMany();

    const formatted = configs.reduce((acc, config) => {
      acc[config.key] = buildConfigValue(config.key, config.value);
      return acc;
    }, {});

    // 若数据库未存储 API Key，降级读取环境变量（管理员需要看到实际使用的 Key）
    const config = require('../../config');
    if (!formatted.apiKey && config.kimi?.apiKey) {
      formatted.apiKey = config.kimi.apiKey;
    }

    success(res, formatted);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取按域分组的系统配置（分域格式，供新前端页面使用）
 * 思路：
 *   1. 从 DB 读取全量 KV
 *   2. 按 CONFIG_DOMAIN_MAP 归类为 params / dictionary / ai / other 四域
 *   3. 每个域返回 { domain, label, configs: [{key, value, note}] }
 *
 * @returns {Object[]} 域分组数组
 */
const getConfigsByDomain = async (req, res, next) => {
  try {
    const configs = await prisma.systemConfig.findMany();

    // 0. 按域收集
    const domainBuckets = {};
    for (const config of configs) {
      const meta = getDomainMeta(config.key);
      if (!domainBuckets[meta.domain]) {
        domainBuckets[meta.domain] = {
          domain: meta.domain,
          label: meta.label,
          configs: [],
        };
      }
      domainBuckets[meta.domain].configs.push({
        key: config.key,
        value: buildConfigValue(config.key, config.value),
        note: config.note || meta.note || '',
      });
    }

    // 1. 保持域的展示顺序
    const orderedDomains = ['params', 'dictionary', 'ai', 'other'];
    const result = orderedDomains
      .filter((d) => domainBuckets[d])
      .map((d) => domainBuckets[d]);

    success(res, result);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新单个系统配置（upsert）
 * @param req.params.key 配置键名
 * @param req.body.value 新值
 * @param req.body.note  可选备注
 */
const updateConfig = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value, note } = req.body;

    const storedValue = normalizeConfigValueForStorage(key, value);

    const config = await prisma.systemConfig.upsert({
      where: { key },
      update: { value: storedValue, note },
      create: { key, value: storedValue, note },
    });

    success(res, formatConfigResponse(config), '配置更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取当前汇率（兜底默认值，前端可直接使用）
 */
const getExchangeRate = async (req, res, next) => {
  try {
    success(res, await resolveExchangeRateConfig());
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：从公共汇率 API 自动同步 USD/CNY 汇率，并写入 systemConfig
 * 思路：
 * 1. 请求 open.er-api.com 获取实时汇率
 * 2. 保留现有 buffer 配置，只更新 rate 字段
 * 3. 写入 exchangeRate systemConfig
 */
const syncExchangeRate = async (req, res, next) => {
  try {
    // 1. 从免费开放 API 获取汇率；外部慢或失败时必须快速降级，不能拖慢系统设置界面。
    const rate = await fetchUsdCnyRate();

    // 2. 读取现有配置（保留 buffer）
    const existing = await prisma.systemConfig.findUnique({
      where: { key: 'exchangeRate' },
    });
    let buffer = 0.2;
    if (existing) {
      try {
        const parsed = JSON.parse(existing.value);
        if (typeof parsed.buffer === 'number') buffer = parsed.buffer;
      } catch { /* 使用默认 buffer */ }
    }

    // 3. 写入新汇率
    const newValue = JSON.stringify({ rate, buffer, effectiveRate: rate - buffer });
    await prisma.systemConfig.upsert({
      where: { key: 'exchangeRate' },
      update: { value: newValue, note: `汇率自动同步 - ${new Date().toISOString()}` },
      create: { key: 'exchangeRate', value: newValue, note: '汇率自动同步' },
    });

    success(res, { rate, buffer, effectiveRate: rate - buffer }, `汇率已同步：1 USD = ${rate} CNY`);
  } catch (error) {
    try {
      const currentRate = await resolveExchangeRateConfig();
      success(res, {
        ...currentRate,
        source: 'cached',
        syncStatus: 'degraded',
        error: error.message,
      }, `汇率同步暂不可用，已返回当前系统汇率：${currentRate.rate}`);
    } catch (fallbackError) {
      next(createError(`汇率同步失败: ${fallbackError.message}`, 503));
    }
  }
};

module.exports = {
  getConfigs,
  getConfigsByDomain,
  updateConfig,
  getExchangeRate,
  syncExchangeRate,
};
