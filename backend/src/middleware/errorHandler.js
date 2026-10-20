/**
 * Input: Express错误对象
 * Output: 统一格式的错误响应，Multer输入限制错误返回400
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

// 已知技术错误 → 中文提示映射（Prisma / Multer / JWT / JSON 解析）
const PRISMA_ERROR_MESSAGES = {
  P2002: '数据已存在（唯一性冲突），请勿重复提交',
  P2003: '存在关联数据，无法执行该操作',
  P2025: '记录不存在或已被删除',
};

const MULTER_ERROR_MESSAGES = {
  LIMIT_FILE_SIZE: '文件大小超出限制，请压缩后重试',
  LIMIT_FILE_COUNT: '文件数量超出限制',
  LIMIT_UNEXPECTED_FILE: '上传字段不符合要求',
};

/**
 * 职责：判断消息是否包含中文（业务错误均为中文文案）
 * @param {string} message - 错误消息
 * @returns {boolean}
 */
const hasChinese = (message) => /[\u4e00-\u9fff]/.test(String(message || ''));

/**
 * 职责：将技术类英文错误转换为用户可读的中文提示
 * 思路：
 *   1. 命中已知错误族（Prisma 错误码 / Multer 错误码 / JWT / JSON 解析）→ 使用对应中文
 *   2. 消息已含中文（业务错误）→ 原样返回
 *   3. 其余英文技术错误 → 按状态码返回通用中文，原始消息只进日志
 * @param {Error} err - 错误对象
 * @param {number} statusCode - HTTP 状态码
 * @returns {string} 中文错误消息
 */
const toClientMessage = (err, statusCode) => {
  if (err?.code && PRISMA_ERROR_MESSAGES[err.code]) {
    return PRISMA_ERROR_MESSAGES[err.code];
  }
  if (err?.code && MULTER_ERROR_MESSAGES[err.code]) {
    return MULTER_ERROR_MESSAGES[err.code];
  }
  if (err?.name === 'TokenExpiredError') {
    return '登录已过期，请重新登录';
  }
  if (err?.name === 'JsonWebTokenError') {
    return '登录凭证无效，请重新登录';
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return '请求格式错误（JSON 解析失败）';
  }
  if (hasChinese(err?.message)) {
    return err.message;
  }
  return statusCode >= 500 ? '服务器内部错误，请稍后重试' : '请求处理失败，请检查输入后重试';
};

/**
 * 职责：统一处理所有错误，返回标准格式响应
 * 思路：
 * 1. 提取错误状态码，将英文技术错误转换为中文提示
 * 2. 开发环境返回详细堆栈信息
 * 3. 生产环境隐藏敏感信息
 * @param {Error} err - 错误对象
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 * @param {NextFunction} next - 下一个中间件
 */
const errorHandler = (err, req, res, next) => {
  // 1. 确定状态码
  const statusCode = err.statusCode || (err.name === 'MulterError' ? 400 : 500);
  
  // 2. 构建响应对象（统一输出中文提示，原始英文消息只进日志）
  const response = {
    code: statusCode,
    message: toClientMessage(err, statusCode),
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
