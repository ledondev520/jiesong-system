/**
 * Input: taxRefundController
 * Output: 退税管理路由
 * Pos: 税退模块路由，处理退税记录 CRUD
 */

const { Router } = require('express');
const taxRefundController = require('../controllers/taxRefundController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { ROLE_SETS } = require('../middleware/roleAuth');
const { withIdValidation, withPaginationValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const { settlementFieldGuard } = require('../middleware/settlementFieldGuard');

const router = Router();

router.use(authenticate);

router.get('/workbench', taxRefundController.getWorkbench);
router.get('/workbench/monthly-export', roleAuth(ROLE_SETS.FINANCE), taxRefundController.exportMonthlyPreparations);
router.get('/workbench/:salesContractId/preparation', roleAuth(ROLE_SETS.FINANCE), taxRefundController.getShipmentPreparation);
router.get('/workbench/:salesContractId/preparation-export', roleAuth(ROLE_SETS.FINANCE), taxRefundController.exportShipmentPreparation);
router.post('/workbench/:salesContractId/confirm', roleAuth(ROLE_SETS.FINANCE), taxRefundController.confirmShipmentPreparation);
router.get('/workbench/:salesContractId/invoice-verification', roleAuth(ROLE_SETS.FINANCE), taxRefundController.getInvoiceVerification);
router.get('/', withPaginationValidation, taxRefundController.list);
router.post(
  '/auto-drafts',
  roleAuth(ROLE_SETS.FINANCE),
  taxRefundController.generateTaxRefundDrafts,
);
router.post(
  '/export',
  roleAuth('ADMIN', 'SALES', 'FINANCE'),
  taxRefundController.exportTaxRefunds,
);
router.get('/:id', withIdValidation, taxRefundController.getById);
const refundFieldGuard = settlementFieldGuard({
  safeStatuses: ['DRAFT', 'APPLIED'],
  fields: ['refundedAmount', 'refundedAt'],
  model: 'taxRefund',
});
router.post(
  '/',
  roleAuth('ADMIN', 'SALES', 'FINANCE'),
  refundFieldGuard,
  withAuditLog({ entity: 'TaxRefund', action: 'CREATE', model: 'taxRefund' }, taxRefundController.create),
);
router.put(
  '/:id',
  withIdValidation,
  roleAuth('ADMIN', 'SALES', 'FINANCE'),
  refundFieldGuard,
  withAuditLog({ entity: 'TaxRefund', action: 'UPDATE', model: 'taxRefund' }, taxRefundController.update),
);
router.delete(
  '/:id',
  withIdValidation,
  roleAuth(ROLE_SETS.FINANCE),
  withAuditLog({ entity: 'TaxRefund', action: 'DELETE', model: 'taxRefund' }, taxRefundController.remove),
);

module.exports = router;
