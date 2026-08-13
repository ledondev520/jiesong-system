/**
 * Input: taxRefundController
 * Output: 退税管理路由
 * Pos: 税退模块路由，处理退税记录 CRUD
 */

const { Router } = require('express');
const taxRefundController = require('../controllers/taxRefundController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withIdValidation, withPaginationValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();

router.use(authenticate);

router.get('/workbench', taxRefundController.getWorkbench);
router.get('/workbench/:salesContractId/invoice-verification', taxRefundController.getInvoiceVerification);
router.get('/', withPaginationValidation, taxRefundController.list);
router.post(
  '/auto-drafts',
  roleAuth('ADMIN', 'SALES', 'FINANCE'),
  taxRefundController.generateTaxRefundDrafts,
);
router.post(
  '/export',
  roleAuth('ADMIN', 'SALES', 'FINANCE'),
  taxRefundController.exportTaxRefunds,
);
router.get('/:id', withIdValidation, taxRefundController.getById);
router.post(
  '/',
  roleAuth('ADMIN', 'SALES', 'FINANCE'),
  withAuditLog({ entity: 'TaxRefund', action: 'CREATE', model: 'taxRefund' }, taxRefundController.create),
);
router.put(
  '/:id',
  withIdValidation,
  roleAuth('ADMIN', 'SALES', 'FINANCE'),
  withAuditLog({ entity: 'TaxRefund', action: 'UPDATE', model: 'taxRefund' }, taxRefundController.update),
);
router.delete(
  '/:id',
  withIdValidation,
  roleAuth('ADMIN', 'FINANCE'),
  withAuditLog({ entity: 'TaxRefund', action: 'DELETE', model: 'taxRefund' }, taxRefundController.remove),
);

module.exports = router;
