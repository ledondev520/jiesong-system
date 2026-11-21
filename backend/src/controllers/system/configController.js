/**
 * Input: prisma.systemConfig KV 存储
 * Output: 系统配置读写接口（平铺格式 + 分域格式）；数据库与环境密钥均仅返回脱敏状态
 * Pos: 系统配置控制层，支持向后兼容的平铺 getConfigs 与新增的分域 getConfigsByDomain
 */

const https = require('https');
const prisma = require('../../utils/prisma');
const { success } = require('../../utils/response');
const { createError } = require('../../middleware/errorHandler');
const { currentRates } = require('../../services/exportPricing');
const {
  normalizeConfigValueForResponse,
  normalizeConfigValueForStorage,
} = require('../../utils/secretCrypto');
const { isCompanyConfigKey, isLegacyInvoiceTitleKey, validateCompanyConfigValue } = require('../../utils/companyConfig');
const { loadSellerIdentity } = require('../../services/sellerIdentityService');

const parsePositiveIntEnv = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const EXCHANGE_RATE_SYNC_TIMEOUT_MS = parsePositiveIntEnv(
  process.env.EXCHANGE_RATE_SYNC_TIMEOUT_MS,
  1800,
);
const EXCHANGE_RATE_MAX_BODY_CHARS = 64 * 1024; // 公共汇率 API 的正常响应约 4KB

// 汇率/加价只来自报价配置（config/pricing.json，经 /system/pricing-config）；普通 SystemConfig 不能再保存这两项。
const PRICING_CONFIG_KEYS = ['exchangeRate', 'profitRate'];
// Restricted company bank details are returned only to the roles that may already read bank evidence.
const BANK_CONFIG_READ_ROLES = ['ADMIN'];
// 旧 invoiceTitleInfo 文本可能含开户行及账号，按同一受限口径处理。
const RESTRICTED_CONFIG_KEYS = ['companyBankInfo', 'invoiceTitleInfo'];

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
    response.on('data', (chunk) => {
      data += chunk;
      if (data.length > EXCHANGE_RATE_MAX_BODY_CHARS) {
        request.destroy();
        finish(reject, new Error('汇率响应过大'));
      }
    });
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
      if (RESTRICTED_CONFIG_KEYS.includes(config.key) && !BANK_CONFIG_READ_ROLES.includes(req.user?.role)) return acc;
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
    } else if (formatted.aiProvider === 'openai') {
      // OpenAI 密钥只来自进程环境，从不经 API 返回（连掩码后缀也不给）；仅暴露"已配置"与模型名。
      formatted.openaiConfigured = Boolean(activeAi.apiKey);
      formatted.openaiModel = activeAi.model;
      formatted.openaiMaxOutputTokens = activeAi.maxOutputTokens; // 服务器对输出长度的硬上限，非密钥
    } else if (!formatted.apiKey && activeAi.apiKey) {
      formatted.apiKey = normalizeConfigValueForResponse('apiKey', activeAi.apiKey);
    }

    success(res, formatted);
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

    // OpenAI 密钥/模型只来自服务器进程环境，任何 openai* 键都不允许写入数据库。
    if (/^openai/i.test(String(key))) {
      throw createError('OpenAI 配置只能通过服务器环境设置，不能保存到系统设置', 400);
    }

    if (isLegacyInvoiceTitleKey(key)) {
      throw createError('开票抬头信息已并入公司信息，请在「设置 > 公司信息」中修改', 400);
    }

    // 公司信息三个键：严格校验（文本、无控制字符、长度/行数上限）后再存；失败 400 且不写库
    const storedValue = normalizeConfigValueForStorage(key, isCompanyConfigKey(key) ? validateCompanyConfigValue(key, value) : value);

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

/** 统一卖方信息（canonical 键 + 旧 invoiceTitleInfo 别名兜底）；银行资料仅 ADMIN/FINANCE 可得。 */
const getSellerIdentity = async (req, res, next) => {
  try {
    success(res, await loadSellerIdentity({ includeBank: BANK_CONFIG_READ_ROLES.includes(req.user?.role) }));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSellerIdentity,
  fetchUsdCnyRate,
  getConfigs,
  updateConfig,
  getExchangeRate,
};
