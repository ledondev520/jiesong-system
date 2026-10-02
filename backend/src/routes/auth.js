/**
 * Input: 认证控制器
 * Output: 认证相关路由
 * Pos: 认证路由，处理邮箱验证码注册、登录、邮箱验证码找回密码
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const authController = require('../controllers/authController');
const { validateLogin, validateRegister, validateResetPassword, validateChangePassword, passwordRule, emailRule, handleValidation } = require('../utils/validators');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withAuditLog } = require('../middleware/auditLog');
const { strictRateLimit } = require('../middleware/rateLimit');

const { body } = require('express-validator');
const emailRegistration = require('../services/emailRegistrationService');
const passwordReset = require('../services/passwordResetService');
const router = Router();

router.post('/email-code',
  strictRateLimit({ windowMs: 3600000, max: 10, keyGenerator: (req) => `email-send:${req.ip}` }),
  emailRule(), handleValidation,
  async (req, res, next) => {
    try { res.json({ success: true, data: await emailRegistration.sendCode(req.body.email), message: '验证码已发送，请查收邮箱' }); }
    catch (error) { next(error); }
  });
router.post('/email-register',
  strictRateLimit({ windowMs: 900000, max: 20, keyGenerator: (req) => `email-register:${req.ip}` }),
  emailRule(),
  body('code').isString().bail().matches(/^\d{6}$/).withMessage('请输入6位验证码'),
  passwordRule('password'),
  body('name').isString().bail().trim().isLength({ min: 1, max: 50 }).withMessage('姓名长度需为1至50字'),
  handleValidation,
  authController.publicRegister);

// ==================== 公开路由 ====================

// POST /api/v1/auth/login - 用户登录（严格限流：10 次/15 分钟）
router.post(
  '/login',
  strictRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: '登录尝试过于频繁，请 15 分钟后再试',
    keyGenerator: (req) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
      return username ? `${ip}:${username}` : ip;
    },
  }),
  validateLogin,
  handleValidation,
  withAuditLog(
    {
      entity: 'User',
      action: 'LOGIN',
      getUserId: ({ responseData }) => responseData?.user?.id,
      getEntityId: ({ responseData }) => responseData?.user?.id,
      getNewValue: ({ responseData }) => ({
        user: responseData?.user || null,
      }),
    },
    authController.login
  )
);

// Public recovery endpoints: persistent quotas additionally protect across workers/restarts.
router.post('/reset-password-code',
  strictRateLimit({ windowMs: 3600000, max: 10, keyGenerator: (req) => `reset-send:${req.ip}` }),
  emailRule(), handleValidation,
  async (req, res, next) => {
    try {
      const data = await passwordReset.sendCode(req.body.email, req.ip);
      res.json({ code: 200, data, message: passwordReset.SEND_MESSAGE });
    } catch (error) { next(error); }
  });
router.post('/reset-password',
  strictRateLimit({ windowMs: 900000, max: 20, keyGenerator: (req) => `reset-verify:${req.ip}` }),
  validateResetPassword, handleValidation, authController.resetPassword);

// ==================== 需认证路由 ====================

// POST /api/v1/auth/register - 注册新用户（仅管理员）
router.post(
  '/register',
  authenticate,
  roleAuth('ADMIN'),
  validateRegister,
  handleValidation,
  withAuditLog(
    { entity: 'User', action: 'CREATE', model: 'user' },
    authController.register
  )
);

// GET /api/v1/auth/me - 获取当前用户信息
router.get('/me', authenticate, authController.getCurrentUser);

// POST /api/v1/auth/change-password - 修改密码
router.post(
  '/change-password',
  authenticate,
  validateChangePassword, handleValidation,
  roleAuth('ADMIN', 'BOSS', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'),
  withAuditLog(
    {
      entity: 'User',
      action: 'UPDATE',
      model: 'user',
      getEntityId: ({ req }) => req.user?.id || null,
      beforeWhere: ({ req }) => (req.user?.id ? { id: req.user.id } : null),
      afterWhere: ({ req }) => (req.user?.id ? { id: req.user.id } : null),
      getNewValue: ({ defaultValue }) => defaultValue,
    },
    authController.changePassword
  )
);

// GET /api/v1/auth/users - 获取用户列表（仅管理员）
router.get('/users', authenticate, roleAuth('ADMIN'), authController.getUsers);

// PUT /api/v1/auth/users/:id - 更新用户（仅管理员）
router.put(
  '/users/:id',
  authenticate,
  roleAuth('ADMIN'),
  withAuditLog(
    { entity: 'User', action: 'UPDATE', model: 'user' },
    authController.updateUser
  )
);

module.exports = router;
