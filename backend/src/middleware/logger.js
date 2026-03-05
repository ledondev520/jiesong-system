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
        url: req.originalUrl,
        ip: req.ip,
        query: req.query || {},
        body: req.body || null,
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

module.exports = { requestLogger };
