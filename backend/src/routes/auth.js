/**
 * Input: 认证控制器
 * Output: 认证相关路由
 * Pos: 认证路由，处理登录/注册/找回密码/Token刷新
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const authController = require('../controllers/authController');
const { validateLogin, validateRegister, validateResetPassword, handleValidation } = require('../utils/validators');
const { authenticate, adminOnly } = require('../middleware/auth');

const router = Router();

// ==================== 公开路由 ====================

// POST /api/v1/auth/login - 用户登录
router.post('/login', validateLogin, handleValidation, authController.login);

// POST /api/v1/auth/public-register - 公开注册（新用户自助注册）
router.post('/public-register', validateRegister, handleValidation, authController.publicRegister);

// POST /api/v1/auth/reset-password - 找回密码（用户名+手机号验证）
router.post('/reset-password', validateResetPassword, handleValidation, authController.resetPassword);

// ==================== 需认证路由 ====================

// POST /api/v1/auth/register - 注册新用户（仅管理员）
router.post('/register', authenticate, adminOnly, validateRegister, handleValidation, authController.register);

// GET /api/v1/auth/me - 获取当前用户信息
router.get('/me', authenticate, authController.getCurrentUser);

// POST /api/v1/auth/change-password - 修改密码
router.post('/change-password', authenticate, authController.changePassword);

// GET /api/v1/auth/users - 获取用户列表（仅管理员）
router.get('/users', authenticate, adminOnly, authController.getUsers);

// PUT /api/v1/auth/users/:id - 更新用户（仅管理员）
router.put('/users/:id', authenticate, adminOnly, authController.updateUser);

module.exports = router;
