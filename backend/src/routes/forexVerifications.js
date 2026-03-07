/**
 * Input: forexVerificationController
 * Output: 收汇核销管理路由
 * Pos: 税退模块路由，处理收汇核销 CRUD
 */

const { Router } = require('express');
const forexVerificationController = require('../controllers/forexVerificationController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withIdValidation, withPaginationValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();

router.use(authenticate);

router.get('/', withPaginationValidation, forexVerificationController.list);
router.get('/:id', withIdValidation, forexVerificationController.getById);
router.post(
  '/',
  roleAuth('ADMIN', 'SALES', 'FINANCE'),
  withAuditLog({ entity: 'ForexVerification', action: 'CREATE', model: 'forexVerification' }, forexVerificationController.create),
);
router.put(
  '/:id',
  withIdValidation,
  roleAuth('ADMIN', 'SALES', 'FINANCE'),
  withAuditLog({ entity: 'ForexVerification', action: 'UPDATE', model: 'forexVerification' }, forexVerificationController.update),
);
router.delete(
  '/:id',
  withIdValidation,
  roleAuth('ADMIN', 'FINANCE'),
  withAuditLog({ entity: 'ForexVerification', action: 'DELETE', model: 'forexVerification' }, forexVerificationController.remove),
);

module.exports = router;
