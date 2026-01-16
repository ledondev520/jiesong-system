/**
 * Input: express-validator库
 * Output: 通用验证规则
 * Pos: 参数验证工具，提供常用验证规则
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { body, param, query, validationResult } = require('express-validator');
const { createError } = require('../middleware/errorHandler');

/**
 * 职责：处理验证结果，抛出验证错误
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 * @param {NextFunction} next - 下一个中间件
 */
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors.array().map(e => e.msg).join('; ');
    return next(createError(message, 400));
  }
  next();
};

// ==================== 通用验证规则 ====================

// ID参数验证
const validateId = param('id')
  .notEmpty().withMessage('ID不能为空')
  .isString().withMessage('ID格式无效');

// 分页参数验证
const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须大于0'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
];

// 用户登录验证
const validateLogin = [
  body('username').notEmpty().withMessage('用户名不能为空'),
  body('password').notEmpty().withMessage('密码不能为空'),
];

// 用户注册验证
const validateRegister = [
  body('username')
    .notEmpty().withMessage('用户名不能为空')
    .isLength({ min: 3, max: 20 }).withMessage('用户名长度3-20字符'),
  body('password')
    .notEmpty().withMessage('密码不能为空')
    .isLength({ min: 6 }).withMessage('密码至少6个字符'),
  body('name').notEmpty().withMessage('姓名不能为空'),
  body('role').optional().isIn(['ADMIN', 'PURCHASE', 'SALES']).withMessage('角色无效'),
];

module.exports = {
  handleValidation,
  validateId,
  validatePagination,
  validateLogin,
  validateRegister,
  body,
  param,
  query,
};
