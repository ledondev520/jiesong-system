/**
 * Input: Express请求对象
 * Output: 控制台日志输出
 * Pos: 日志中间件，记录所有HTTP请求
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

/**
 * 职责：记录每个HTTP请求的基本信息
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 * @param {NextFunction} next - 下一个中间件
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // 响应完成后记录
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLine = [
      `[${new Date().toISOString()}]`,
      req.method,
      req.originalUrl,
      res.statusCode,
      `${duration}ms`,
    ].join(' ');
    
    // 根据状态码选择日志级别
    if (res.statusCode >= 500) {
      console.error(logLine);
    } else if (res.statusCode >= 400) {
      console.warn(logLine);
    } else {
      console.log(logLine);
    }
  });
  
  next();
};

module.exports = { requestLogger };
