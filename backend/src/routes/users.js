/**
 * Input: 用户控制器
 * Output: 用户管理路由
 * Pos: 用户路由，处理用户CRUD
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const userController = require('../controllers/userController');
const { authenticate, adminOnly } = require('../middleware/auth');
const { validateId, validatePagination, handleValidation } = require('../utils/validators');
const { body } = require('express-validator');

const router = Router();

// 所有用户路由需要认证且仅管理员可访问
router.use(authenticate);
router.use(adminOnly);

// GET /api/v1/users - 获取用户列表
router.get('/', validatePagination, handleValidation, userController.list);

// GET /api/v1/users/:id - 获取单个用户
router.get('/:id', validateId, handleValidation, userController.getById);

// POST /api/v1/users - 创建用户
router.post('/', [
  body('username').notEmpty().withMessage('用户名不能为空'),
  body('password').isLength({ min: 6 }).withMessage('密码至少6位'),
  body('name').notEmpty().withMessage('姓名不能为空'),
], handleValidation, userController.create);

// PUT /api/v1/users/:id - 更新用户
router.put('/:id', validateId, handleValidation, userController.update);

// DELETE /api/v1/users/:id - 删除用户
router.delete('/:id', validateId, handleValidation, userController.remove);

module.exports = router;
