/**
 * Input: 供应商控制器
 * Output: 供应商管理路由
 * Pos: 供应商路由，处理供应商CRUD操作
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const supplierController = require('../controllers/supplierController');
const { authenticate } = require('../middleware/auth');
const { validateId, validatePagination, handleValidation, body } = require('../utils/validators');

const router = Router();

// 所有路由需要认证
router.use(authenticate);

// GET /api/v1/suppliers - 获取供应商列表
router.get('/', validatePagination, handleValidation, supplierController.list);

// GET /api/v1/suppliers/:id - 获取供应商详情
router.get('/:id', validateId, handleValidation, supplierController.getById);

// POST /api/v1/suppliers - 创建供应商
router.post('/', [
  body('name').notEmpty().withMessage('供应商名称不能为空'),
], handleValidation, supplierController.create);

// PUT /api/v1/suppliers/:id - 更新供应商
router.put('/:id', validateId, handleValidation, supplierController.update);

// DELETE /api/v1/suppliers/:id - 删除供应商
router.delete('/:id', validateId, handleValidation, supplierController.remove);

// POST /api/v1/suppliers/:id/aliases - 添加供应商昵称
router.post('/:id/aliases', validateId, handleValidation, supplierController.addAlias);

// POST /api/v1/suppliers/:id/quality-issue - 标记质量问题
router.post('/:id/quality-issue', validateId, handleValidation, supplierController.markQualityIssue);

module.exports = router;
