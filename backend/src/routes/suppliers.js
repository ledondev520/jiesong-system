/**
 * Input: 供应商控制器
 * Output: 供应商管理路由
 * Pos: 供应商路由，处理供应商CRUD操作
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const supplierController = require('../controllers/supplierController');
const { authenticate, roleAuth } = require('../middleware/auth');
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
], roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), handleValidation, withAuditLog(
  { entity: 'Supplier', action: 'CREATE', model: 'supplier' },
  supplierController.create
));

// PUT /api/v1/suppliers/:id - 更新供应商
router.put('/:id', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'Supplier', action: 'UPDATE', model: 'supplier' },
  supplierController.update
));

// DELETE /api/v1/suppliers/:id - 删除供应商
router.delete('/:id', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'Supplier', action: 'DELETE', model: 'supplier' },
  supplierController.remove
));

// POST /api/v1/suppliers/:id/aliases - 添加供应商昵称
router.post('/:id/aliases', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'SupplierAlias', action: 'CREATE', model: 'supplierAlias' },
  supplierController.addAlias
));

// POST /api/v1/suppliers/:id/quality-issue - 标记质量问题
router.post('/:id/quality-issue', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'Supplier', action: 'UPDATE', model: 'supplier' },
  supplierController.markQualityIssue
));

module.exports = router;
