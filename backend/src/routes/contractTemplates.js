/**
 * Input: contractTemplateController
 * Output: 合同模板管理路由
 * Pos: 合同模板路由，处理模板 CRUD 操作
 */

const { Router } = require('express');
const contractTemplateController = require('../controllers/contractTemplateController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { ROLE_SETS } = require('../middleware/roleAuth');
const { body, handleValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();

router.use(authenticate);

// GET /api/v1/contract-templates - 列出模板
router.get('/', contractTemplateController.list);

// POST /api/v1/contract-templates - 创建模板
router.post('/', [
  body('name').notEmpty().withMessage('模板名称不能为空'),
  body('type').notEmpty().withMessage('模板类型不能为空'),
], roleAuth(ROLE_SETS.ALL), handleValidation, withAuditLog(
  { entity: 'ContractTemplate', action: 'CREATE', model: 'contractTemplate' },
  contractTemplateController.create
));

module.exports = router;
