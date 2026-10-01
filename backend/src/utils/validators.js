/**
 * Input: express-validator库
 * Output: 通用验证规则（登录、注册、找回密码和安全整数分页边界）
 * Pos: 参数验证工具，提供常用验证规则
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { body, param, query, validationResult } = require('express-validator');
const { createError } = require('../middleware/errorHandler');
const { ROLES } = require('../config/constants');
const { MAX_PAGE } = require('./pagination');

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
  query('page').optional().isInt({ min: 1, max: MAX_PAGE }).withMessage(`页码必须在1-${MAX_PAGE}之间`),
  query('pageSize').optional().isInt({ min: 1, max: 500 }).withMessage('每页数量必须在1-500之间'),
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
  body('role').optional().isIn(Object.values(ROLES)).withMessage('角色无效'),
];

// 找回密码验证
const validateResetPassword = [
  body('username')
    .notEmpty().withMessage('用户名不能为空'),
  body('phone')
    .notEmpty().withMessage('手机号不能为空')
    .matches(/^1[3-9]\d{9}$/).withMessage('手机号格式无效'),
  body('newPassword')
    .notEmpty().withMessage('新密码不能为空')
    .isLength({ min: 6 }).withMessage('新密码至少6个字符'),
];

/**
 * 复用分页参数校验链。
 */
const withPaginationValidation = [
  validatePagination,
  handleValidation,
].flat();

/**
 * 复用 ID 参数校验链。
 */
const withIdValidation = [
  validateId,
  handleValidation,
].flat();

module.exports = {
  handleValidation,
  validateId,
  validatePagination,
  validateLogin,
  validateRegister,
  validateResetPassword,
  withPaginationValidation,
  withIdValidation,
  body,
  param,
};
