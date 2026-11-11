/**
 * Input: forexVerificationController
 * Output: 收汇核销管理路由
 * Pos: 税退模块路由，处理收汇核销 CRUD
 */

const { Router } = require('express');
const forexVerificationController = require('../controllers/forexVerificationController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { ROLE_SETS } = require('../middleware/roleAuth');
const { withIdValidation, withPaginationValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const { settlementFieldGuard } = require('../middleware/settlementFieldGuard');

const router = Router();

router.use(authenticate);

const forexFieldGuard = settlementFieldGuard({
  safeStatuses: ['PENDING'],
  fields: ['settledAmount', 'verifiedAt'],
  model: 'forexVerification',
});

router.get('/', withPaginationValidation, forexVerificationController.list);
router.get('/:id', withIdValidation, forexVerificationController.getById);
router.post(
  '/',
  roleAuth(ROLE_SETS.ADMIN),
  forexFieldGuard,
  withAuditLog({ entity: 'ForexVerification', action: 'CREATE', model: 'forexVerification' }, forexVerificationController.create),
);
router.put(
  '/:id',
  withIdValidation,
  roleAuth(ROLE_SETS.ADMIN),
  forexFieldGuard,
  withAuditLog({ entity: 'ForexVerification', action: 'UPDATE', model: 'forexVerification' }, forexVerificationController.update),
);
router.delete(
  '/:id',
  withIdValidation,
  roleAuth(ROLE_SETS.ADMIN),
  withAuditLog({ entity: 'ForexVerification', action: 'DELETE', model: 'forexVerification' }, forexVerificationController.remove),
);

module.exports = router;
