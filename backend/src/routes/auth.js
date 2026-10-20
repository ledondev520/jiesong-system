/**
 * Input: 认证控制器
 * Output: 认证相关路由
 * Pos: 认证路由，处理邮箱验证码注册、登录/浏览器会话、邮箱验证码找回密码
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const authController = require('../controllers/authController');
const { validateLogin, validateRegister, validateResetPassword, validateChangePassword, passwordRule, emailRule, handleValidation } = require('../utils/validators');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withAuditLog } = require('../middleware/auditLog');
const { strictRateLimit } = require('../middleware/rateLimit');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const { body } = require('express-validator');
const emailRegistration = require('../services/emailRegistrationService');
const passwordReset = require('../services/passwordResetService');
const router = Router();
const browserSessions = require('../services/browserSessionService');
// Tokens, CSRF proofs and profile responses must never be cached by intermediaries.
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

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
  body('rememberMe').optional().isBoolean({ strict: true }).withMessage('保持登录选项无效'),
  handleValidation,
  browserSessions.protectLogin,
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
  rateLimit({ windowMs: 3600000, limit: 10, keyGenerator: (req) => ipKeyGenerator(req.ip),
    standardHeaders: 'draft-7', legacyHeaders: false,
    message: { code: 429, message: '验证码请求过于频繁，请一小时后重试', data: null } }),
  emailRule(), handleValidation,
  async (req, res, next) => {
    try {
      const data = await passwordReset.sendCode(req.body.email, req.ip);
      res.json({ code: 200, data, message: passwordReset.SEND_MESSAGE });
    } catch (error) { next(error); }
  });
router.post('/reset-password',
  rateLimit({ windowMs: 900000, limit: 20, keyGenerator: (req) => ipKeyGenerator(req.ip),
    standardHeaders: 'draft-7', legacyHeaders: false,
    message: { code: 429, message: '验证请求过于频繁，请15分钟后重试', data: null } }),
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

// Cookie bootstrap never renews expiry. Logout verifies its own cookie/CSRF, even after expiry.
router.get('/session', authenticate, authController.getSession);
router.get('/logout-csrf', (req, res, next) => {
  try { res.json({ code: 200, data: browserSessions.logoutProof(req), message: '获取成功' }); }
  catch (error) { next(error); }
});
router.post('/logout', authController.logout);

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
