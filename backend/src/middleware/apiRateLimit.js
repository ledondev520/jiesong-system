/**
 * Input: Express req.ip under the existing explicit trusted-proxy policy
 * Output: Locked express-rate-limit gate: 100 requests/minute with the legacy response contract
 * Pos: Shared global API admission control, before parsing and every router; no production bypass.
 */
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const MESSAGE = '请求过于频繁，请稍后再试';
const globalApiKey = (req) => ipKeyGenerator(req.ip);
const setLegacyHeaders = (req, res) => {
  const info = req.apiRateLimit;
  res.setHeader('X-RateLimit-Limit', info.limit);
  res.setHeader('X-RateLimit-Remaining', info.remaining);
  // Preserve the existing app's millisecond reset timestamp; Retry-After stays seconds.
  res.setHeader('X-RateLimit-Reset', info.resetTime.getTime());
};
const exposeApiRateLimitHeaders = (req, res, next) => { setLegacyHeaders(req, res); next(); };
const createApiRateLimiter = () => rateLimit({
  windowMs: 60000,
  limit: 100,
  keyGenerator: globalApiKey,
  requestPropertyName: 'apiRateLimit',
  standardHeaders: false,
  legacyHeaders: false,
  handler: (req, res) => {
    setLegacyHeaders(req, res);
    const retryAfter = Math.max(1, Math.ceil((req.apiRateLimit.resetTime.getTime() - Date.now()) / 1000));
    res.setHeader('Retry-After', retryAfter);
    res.status(429).json({ success: false, message: MESSAGE, retryAfter });
  },
});
module.exports = { createApiRateLimiter, exposeApiRateLimitHeaders, globalApiKey };
