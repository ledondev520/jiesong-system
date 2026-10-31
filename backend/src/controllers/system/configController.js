/**
 * Input: prisma.systemConfig KV 存储
 * Output: 系统配置读写接口（平铺格式 + 分域格式）；数据库与环境密钥均仅返回脱敏状态
 * Pos: 系统配置控制层，支持向后兼容的平铺 getConfigs 与新增的分域 getConfigsByDomain
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const https = require('https');
const prisma = require('../../utils/prisma');
const { success } = require('../../utils/response');
const { createError } = require('../../middleware/errorHandler');
const { loadPricingSnapshot, updatePricingConfig } = require('../../services/pricingConfigService');
const { currentRates } = require('../../services/exportPricing');
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
  stampPlatformUrl: { domain: 'params', label: '基础参数', note: '线上盖章平台链接（购销合同生成后跳转盖章）' },
  invoiceTitleInfo: { domain: 'params', label: '基础参数', note: '我方开票抬头信息（催票文本附带，多行）' },

  // 数据字典域：系统枚举值与下拉列表
  units:        { domain: 'dictionary', label: '数据字典', note: '商品计量单位枚举' },
  brokers:      { domain: 'dictionary', label: '数据字典', note: '报关公司枚举' },

  // AI 集成域：外部 AI 服务鉴权与参数
  apiKey:         { domain: 'ai', label: 'AI集成', note: 'Kimi API 密钥（脱敏存储）' },
  deepseekApiKey: { domain: 'ai', label: 'AI集成', note: 'DeepSeek API 密钥（脱敏存储）' },
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

// 汇率/加价只来自报价配置（config/pricing.json，经 /system/pricing-config）；普通 SystemConfig 不能再保存这两项。
const PRICING_CONFIG_KEYS = ['exchangeRate', 'profitRate'];

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

// 兼容旧响应形状 { rate, buffer, effectiveRate }，数值全部来自唯一报价配置。
const resolveExchangeRateConfig = async () => {
  const rates = currentRates();
  return { rate: rates.spotRate, buffer: -rates.adjustment, effectiveRate: rates.effectiveRate };
};

const fetchUsdCnyRate = async ({ timeoutMs = EXCHANGE_RATE_SYNC_TIMEOUT_MS } = {}) => new Promise((resolve, reject) => {
  const url = 'https://open.er-api.com/v6/latest/USD';
  let overallTimeout;
  let settled = false;
  const finish = (callback, value) => {
    if (settled) return;
    settled = true;
    clearTimeout(overallTimeout);
    callback(value);
  };
  const request = https.get(url, (response) => {
    let data = '';
    response.on('data', (chunk) => { data += chunk; });
    response.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const cnyRate = parsed?.rates?.CNY;
        if (typeof cnyRate !== 'number' || cnyRate <= 0) {
          finish(reject, new Error('汇率数据异常'));
        } else {
          finish(resolve, Math.round(cnyRate * 100) / 100);
        }
      } catch {
        finish(reject, new Error('解析汇率响应失败'));
      }
    });
  });

  const timeoutError = () => new Error(`汇率同步超时 ${timeoutMs}ms`);
  overallTimeout = setTimeout(() => {
    const error = timeoutError();
    request.destroy(error);
    finish(reject, error);
  }, timeoutMs);
  request.setTimeout(timeoutMs, () => {
    request.destroy(timeoutError());
  });
  request.on('error', (error) => finish(reject, error));
});

/**
 * 职责：获取所有系统配置（平铺格式，向后兼容）
 * @returns {Object} key→value 的平铺对象
 */
const getConfigs = async (req, res, next) => {
  try {
    const configs = await prisma.systemConfig.findMany();

    const formatted = configs.reduce((acc, config) => {
      if (PRICING_CONFIG_KEYS.includes(config.key)) return acc;
      acc[config.key] = buildConfigValue(config.key, config.value);
      return acc;
    }, {});

    // 环境变量回退与数据库配置遵守同一只写式密钥响应约束。
    const config = require('../../config');
    const activeAi = config.ai || config.kimi;
    formatted.aiProvider = activeAi.provider || 'kimi';
    if (formatted.aiProvider === 'deepseek') {
      formatted.deepseekApiKey = formatted.deepseekApiKey ||
        normalizeConfigValueForResponse('deepseekApiKey', activeAi.apiKey || '');
      formatted.apiKey = formatted.deepseekApiKey;
    } else if (!formatted.apiKey && activeAi.apiKey) {
      formatted.apiKey = normalizeConfigValueForResponse('apiKey', activeAi.apiKey);
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
    if (PRICING_CONFIG_KEYS.includes(key)) {
      throw createError('汇率和加价由报价配置统一维护，请在「系统配置 > 报价配置」中修改', 400);
    }

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
 * 职责：从公共汇率 API 取现汇，并作为唯一报价配置的 exchangeRate 保存（带版本校验，ADMIN）
 * 思路：读取当前配置与版本 → 只替换 exchangeRate → 原子整份替换；不再写 SystemConfig。
 */
const syncExchangeRate = async (req, res, next) => {
  try {
    const rate = await fetchUsdCnyRate();
    const { config, revision } = loadPricingSnapshot();
    updatePricingConfig({ ...config, exchangeRate: rate }, revision, req.user?.id);
    const buffer = -config.exchangeAdjustment;
    success(res, { rate, buffer, effectiveRate: Math.round((rate - buffer) * 1e6) / 1e6 }, `汇率已同步：1 USD = ${rate} CNY`);
  } catch (error) {
    // 报价配置冲突/锁/校验（带状态码）必须如实返回，不能伪装成“同步降级”。
    if (error.statusCode) return next(error);
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
  fetchUsdCnyRate,
  getConfigs,
  getConfigsByDomain,
  updateConfig,
  getExchangeRate,
  syncExchangeRate,
};
