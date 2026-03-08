/**
 * Input: customsDeclarationController
 * Output: 报关单管理路由
 * Pos: 税退模块路由，处理报关单 CRUD
 */

const { Router } = require('express');
const customsDeclarationController = require('../controllers/customsDeclarationController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withIdValidation, withPaginationValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();

router.use(authenticate);

router.get('/', withPaginationValidation, customsDeclarationController.list);
router.post(
  '/auto-drafts',
  roleAuth('ADMIN', 'SALES', 'FINANCE', 'WAREHOUSE'),
  customsDeclarationController.generateCustomsDeclarationDrafts,
);
router.get('/:id', withIdValidation, customsDeclarationController.getById);
router.post(
  '/',
  roleAuth('ADMIN', 'SALES', 'FINANCE', 'WAREHOUSE'),
  withAuditLog({ entity: 'CustomsDeclaration', action: 'CREATE', model: 'customsDeclaration' }, customsDeclarationController.create),
);
router.put(
  '/:id',
  withIdValidation,
  roleAuth('ADMIN', 'SALES', 'FINANCE', 'WAREHOUSE'),
  withAuditLog({ entity: 'CustomsDeclaration', action: 'UPDATE', model: 'customsDeclaration' }, customsDeclarationController.update),
);
router.delete(
  '/:id',
  withIdValidation,
  roleAuth('ADMIN', 'SALES', 'FINANCE'),
  withAuditLog({ entity: 'CustomsDeclaration', action: 'DELETE', model: 'customsDeclaration' }, customsDeclarationController.remove),
);

module.exports = router;
