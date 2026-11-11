/**
 * Input: 供应商控制器
 * Output: 供应商管理路由
 * Pos: 供应商路由，处理供应商CRUD操作
 */

const { Router } = require('express');
const supplierController = require('../controllers/supplierController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { ROLE_SETS } = require('../middleware/roleAuth');
const { withIdValidation, withPaginationValidation, body, handleValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();

// 所有路由需要认证
router.use(authenticate);

// GET /api/v1/suppliers - 获取供应商列表
router.get('/', withPaginationValidation, supplierController.list);

// GET /api/v1/suppliers/:id - 获取供应商详情
router.get('/:id', withIdValidation, supplierController.getById);

// POST /api/v1/suppliers - 创建供应商
router.post('/', [
  body('name').notEmpty().withMessage('供应商名称不能为空'),
], roleAuth(ROLE_SETS.ALL), handleValidation, withAuditLog(
  { entity: 'Supplier', action: 'CREATE', model: 'supplier' },
  supplierController.create
));

// PUT /api/v1/suppliers/:id - 更新供应商
router.put('/:id', withIdValidation, roleAuth(ROLE_SETS.ALL), withAuditLog(
  { entity: 'Supplier', action: 'UPDATE', model: 'supplier' },
  supplierController.update
));

// DELETE /api/v1/suppliers/:id - 归档供应商（软停用，非物理删除）
router.delete('/:id', withIdValidation, roleAuth(ROLE_SETS.ALL), withAuditLog(
  { entity: 'Supplier', action: 'DELETE', model: 'supplier' },
  supplierController.remove
));

// GET /api/v1/suppliers/:id/hard-delete-preview - 永久删除预览（仅 ADMIN，只读）
router.get('/:id/hard-delete-preview', withIdValidation, roleAuth(ROLE_SETS.ADMIN), supplierController.hardDeletePreview);

// POST /api/v1/suppliers/:id/hard-delete - 永久删除（仅 ADMIN；审计行在删除事务内写入，故不套 withAuditLog）
router.post('/:id/hard-delete', withIdValidation, roleAuth(ROLE_SETS.ADMIN), supplierController.hardDelete);

// POST /api/v1/suppliers/:id/aliases - 添加供应商昵称
router.post('/:id/aliases', withIdValidation, roleAuth(ROLE_SETS.ALL), withAuditLog(
  { entity: 'SupplierAlias', action: 'CREATE', model: 'supplierAlias' },
  supplierController.addAlias
));

// POST /api/v1/suppliers/:id/quality-issue - 标记质量问题
router.post('/:id/quality-issue', withIdValidation, roleAuth(ROLE_SETS.ALL), withAuditLog(
  { entity: 'Supplier', action: 'UPDATE', model: 'supplier' },
  supplierController.markQualityIssue
));

module.exports = router;
