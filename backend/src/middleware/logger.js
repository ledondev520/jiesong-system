/**
 * Input: Express请求对象
 * Output: JSONL日志输出
 * Pos: 日志中间件，记录所有HTTP请求（含脱敏、耗时、响应状态）
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

/**
 * 职责：记录每个HTTP请求并输出JSONL结构日志
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 * @param {NextFunction} next - 下一个中间件
 */
const { redactSensitiveData } = require('../utils/security-scan');

const getLevelByStatus = (statusCode) => {
  if (statusCode >= 500) {
    return 'error';
  }

  if (statusCode >= 400) {
    return 'warn';
  }

  return 'info';
};

const getRequestId = (req) =>
  req.get('x-request-id') ||
  req.get('x-correlation-id') ||
  req.get('traceparent') ||
  null;

const parseContentLength = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const summarizeRequestFields = (value, contentLength = null) => {
  if (value === null || value === undefined) {
    return { present: false, contentLength: parseContentLength(contentLength) };
  }

  if (Array.isArray(value)) {
    return {
      present: true,
      type: 'array',
      itemCount: value.length,
      contentLength: parseContentLength(contentLength),
    };
  }

  if (typeof value !== 'object') {
    return {
      present: true,
      type: typeof value,
      contentLength: parseContentLength(contentLength),
    };
  }

  const keys = Object.keys(value);
  const visibleFields = keys.slice(0, 24);
  return {
    present: keys.length > 0,
    type: 'object',
    fieldCount: keys.length,
    fields: visibleFields,
    ...(keys.length > visibleFields.length ? { omittedFieldCount: keys.length - visibleFields.length } : {}),
    contentLength: parseContentLength(contentLength),
  };
};

const getLogRoutePath = (req) => {
  const baseUrl = typeof req?.baseUrl === 'string' ? req.baseUrl : '';
  const routePath = typeof req?.route?.path === 'string' ? req.route.path : '';
  if (routePath) {
    return `${baseUrl}${routePath === '/' ? '' : routePath}`.replace(/\/+/g, '/') || '/';
  }
  return String(req?.originalUrl || '').split('?')[0] || '/';
};

const requestLogger = (req, res, next) => {
  const startedAt = Date.now();
  let logged = false;

  const writeLog = () => {
    if (logged) {
      return;
    }

    logged = true;
    const durationMs = Date.now() - startedAt;
    const statusCode = res.statusCode;
    const level = getLevelByStatus(statusCode);

    const event = {
      timestamp: new Date().toISOString(),
      level,
      event: 'http_request',
      requestId: getRequestId(req),
      request: {
        method: req.method,
        url: getLogRoutePath(req),
        ip: req.ip,
        query: summarizeRequestFields(req.query || {}),
        body: summarizeRequestFields(req.body, req.get('content-length')),
        userAgent: req.get('user-agent') || null,
        referer: req.get('referer') || null,
      },
      response: {
        statusCode,
        durationMs,
        contentLength: res.getHeader('content-length') || null,
      },
      env: process.env.NODE_ENV || 'development',
    };

    const sanitizedEvent = redactSensitiveData(event);
    const line = `${JSON.stringify(sanitizedEvent)}\n`;
    if (level === 'error') {
      process.stderr.write(line);
      return;
    }

    if (level === 'warn') {
      process.stdout.write(line);
      return;
    }

    process.stdout.write(line);
  };

  res.on('finish', writeLog);
  res.on('close', writeLog);
  next();
};

module.exports = { requestLogger, summarizeRequestFields, getLogRoutePath };
