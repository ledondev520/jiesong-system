/**
 * Input: taxRateController
 * Output: 退税率管理路由
 * Pos: 税退模块路由，处理退税率 CRUD
 */

const { Router } = require('express');
const taxRateController = require('../controllers/taxRateController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { ROLE_SETS } = require('../middleware/roleAuth');
const { withIdValidation, withPaginationValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();

router.use(authenticate);

router.get('/', withPaginationValidation, taxRateController.list);
router.get('/:id', withIdValidation, taxRateController.getById);
router.post(
  '/',
  roleAuth(ROLE_SETS.COMMERCIAL),
  withAuditLog({ entity: 'TaxRate', action: 'CREATE', model: 'taxRate' }, taxRateController.create),
);
router.put(
  '/:id',
  withIdValidation,
  roleAuth(ROLE_SETS.COMMERCIAL),
  withAuditLog({ entity: 'TaxRate', action: 'UPDATE', model: 'taxRate' }, taxRateController.update),
);
router.delete(
  '/:id',
  withIdValidation,
  roleAuth(ROLE_SETS.FINANCE),
  withAuditLog({ entity: 'TaxRate', action: 'DELETE', model: 'taxRate' }, taxRateController.remove),
);

module.exports = router;
