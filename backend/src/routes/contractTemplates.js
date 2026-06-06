/**
 * Input: contractTemplateController
 * Output: 合同模板管理路由
 * Pos: 合同模板路由，处理模板 CRUD 操作
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const contractTemplateController = require('../controllers/contractTemplateController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withIdValidation, body, handleValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();

router.use(authenticate);

// GET /api/v1/contract-templates - 列出模板
router.get('/', contractTemplateController.list);

// POST /api/v1/contract-templates - 创建模板
router.post('/', [
  body('name').notEmpty().withMessage('模板名称不能为空'),
  body('type').notEmpty().withMessage('模板类型不能为空'),
], roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), handleValidation, withAuditLog(
  { entity: 'ContractTemplate', action: 'CREATE', model: 'contractTemplate' },
  contractTemplateController.create
));

// GET /api/v1/contract-templates/:id - 获取模板详情
router.get('/:id', withIdValidation, contractTemplateController.getById);

// DELETE /api/v1/contract-templates/:id - 删除模板
router.delete('/:id', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'ContractTemplate', action: 'DELETE', model: 'contractTemplate' },
  contractTemplateController.remove
));

module.exports = router;
