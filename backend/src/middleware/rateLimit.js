/**
 * Input: 请求对象、配置选项
 * Output: 速率限制中间件
 * Pos: 防止 API 滥用和暴力攻击
 */

// 内存存储：key -> { count, resetTime }
const store = new Map();

const cleanupInterval = 60000; // 每分钟清理一次过期记录

// 定期清理过期记录
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (value.resetTime < now) {
      store.delete(key);
    }
  }
}, cleanupInterval);

/**
 * 创建速率限制中间件
 * @param {Object} options - 配置选项
 * @param {number} options.windowMs - 时间窗口（毫秒），默认 15 分钟
 * @param {number} options.max - 最大请求数，默认 100 次
 * @param {string} options.message - 超限时的错误消息
 * @param {(req, res) => string} options.keyGenerator - 生成限流 key 的函数，默认使用 IP
 * @returns {Function} Express 中间件
 */
const rateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 分钟
    max = 100, // 默认 100 次
    message = '请求过于频繁，请稍后再试',
    keyGenerator = (req) => req.ip || req.connection.remoteAddress || 'unknown',
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let record = store.get(key);

    if (!record || record.resetTime < now) {
      record = {
        count: 0,
        resetTime: now + windowMs,
      };
      store.set(key, record);
    }

    record.count++;

    // 设置响应头
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('X-RateLimit-Reset', record.resetTime);

    if (record.count > max) {
      res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000));
      return res.status(429).json({
        success: false,
        message,
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
    }

    next();
  };
};

/**
 * 严格限流：用于登录等敏感操作
 * @param {Object} options - 配置选项
 * @returns {Function} Express 中间件
 */
const strictRateLimit = (options = {}) => {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分钟
    max: 10, // 10 次
    message: '操作过于频繁，请 15 分钟后再试',
    ...options,
  });
};

/**
 * 宽松限流：用于普通查询操作
 * @param {Object} options - 配置选项
 * @returns {Function} Express 中间件
 */
const gentleRateLimit = (options = {}) => {
  return rateLimit({
    windowMs: 60 * 1000, // 1 分钟
    max: 60, // 60 次/分钟
    message: '查询过于频繁，请稍后再试',
    ...options,
  });
};

/**
 * 重置限流记录（用于管理员操作）
 * @param {string} key - 要重置的 key
 */
const resetLimit = (key) => {
  store.delete(key);
};

/**
 * 获取当前限流状态
 * @param {string} key - 要查询的 key
 * @returns {Object|null} 限流状态或 null
 */
const getLimitStatus = (key) => {
  const record = store.get(key);
  if (!record) return null;

  return {
    count: record.count,
    resetTime: record.resetTime,
    remaining: record.count < 100 ? 100 - record.count : 0,
  };
};

module.exports = {
  rateLimit,
  strictRateLimit,
  gentleRateLimit,
  resetLimit,
  getLimitStatus,
};
