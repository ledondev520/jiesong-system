/**
 * Input: express-validator库
 * Output: 通用验证规则（统一新密码策略、邮箱找回、注册及安全整数分页边界）
 * Pos: 参数验证工具，提供常用验证规则
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { body, param, query, validationResult } = require('express-validator');
const { createError } = require('../middleware/errorHandler');
const { ROLES } = require('../config/constants');
const { MAX_PAGE } = require('./pagination');
const { isValidPassword, PASSWORD_MESSAGE } = require('./passwordPolicy');
const passwordRule = (field) => body(field).custom(isValidPassword).withMessage(PASSWORD_MESSAGE);
const emailRule = () => body('email').isString().bail().trim().isLength({ max: 254 }).isEmail()
  .withMessage('请输入有效邮箱地址').bail().customSanitizer((email) => email.toLowerCase());

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
  passwordRule('password'),
  body('name').notEmpty().withMessage('姓名不能为空'),
  body('role').optional().isIn(Object.values(ROLES)).withMessage('角色无效'),
];

// 邮箱验证码找回密码；旧用户名+手机号请求不再通过校验。
const validateResetPassword = [
  emailRule(),
  body('code').isString().bail().matches(/^\d{6}$/).withMessage('请输入6位验证码'),
  passwordRule('newPassword'),
];
const validateChangePassword = [
  body('oldPassword').isString().bail().notEmpty().withMessage('请输入原密码'),
  passwordRule('newPassword'),
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
  validateChangePassword,
  passwordRule,
  emailRule,
  withPaginationValidation,
  withIdValidation,
  body,
  param,
};
