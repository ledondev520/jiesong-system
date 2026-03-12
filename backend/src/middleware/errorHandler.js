/**
 * Input: Express错误对象
 * Output: 统一格式的错误响应
 * Pos: 错误处理中间件，统一异常响应格式
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

/**
 * 职责：处理404未找到路由的情况
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 * @param {NextFunction} next - 下一个中间件
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`路由未找到: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

/**
 * 职责：统一处理所有错误，返回标准格式响应
 * 思路：
 * 1. 提取错误状态码和消息
 * 2. 开发环境返回详细堆栈信息
 * 3. 生产环境隐藏敏感信息
 * @param {Error} err - 错误对象
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 * @param {NextFunction} next - 下一个中间件
 */
const errorHandler = (err, req, res, next) => {
  // 1. 确定状态码
  const statusCode = err.statusCode || 500;
  
  // 2. 构建响应对象
  const response = {
    code: statusCode,
    message: err.message || '服务器内部错误',
    data: null,
  };
  
  // 3. 开发环境添加堆栈信息
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }
  
  // 4. 记录错误日志
  console.error(`[ERROR] ${new Date().toISOString()} - ${err.message}`);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }
  
  // 5. 返回错误响应
  res.status(statusCode).json(response);
};

/**
 * 职责：创建自定义业务错误
 * @param {string} message - 错误消息
 * @param {number} statusCode - HTTP状态码
 * @returns {Error} 带状态码的错误对象
 */
const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

/**
 * 职责：包装异步路由处理器，自动捕获错误
 * @param {Function} fn - 异步路由处理函数
 * @returns {Function} Express 中间件函数
 */
const wrapAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  notFoundHandler,
  errorHandler,
  createError,
  wrapAsync,
};
