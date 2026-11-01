/**
 * Input: quote controller
 * Output: /api/v1/quotes routes (list, detail, create, update/transition); no DELETE (quotes are cancelled, never deleted)
 * Pos: roles per docs/redesign/DATA-MODEL-2026.md §4.4 — read ADMIN/SALES/PURCHASE/FINANCE/BOSS, write ADMIN/SALES;
 *      WAREHOUSE has no access. export.xlsx / print: ADMIN/SALES/PURCHASE/FINANCE, not BOSS (generated documents), streamed, never stored.
 */
const { Router } = require('express');
const quoteController = require('../controllers/quoteController');
const quoteExportController = require('../controllers/quoteExportController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withIdValidation, withPaginationValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();

router.use(authenticate);

router.get('/', roleAuth('ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'BOSS'), withPaginationValidation, quoteController.list);

router.get('/:id', roleAuth('ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'BOSS'), withIdValidation, quoteController.getById);

router.get('/:id/export.xlsx', roleAuth('ADMIN', 'SALES', 'PURCHASE', 'FINANCE'), withIdValidation, quoteExportController.exportXlsx);

router.get('/:id/print', roleAuth('ADMIN', 'SALES', 'PURCHASE', 'FINANCE'), withIdValidation, quoteExportController.printView);

router.post('/', roleAuth('ADMIN', 'SALES'), withAuditLog(
  { entity: 'Quote', action: 'CREATE', model: 'quote' },
  quoteController.create
));

router.put('/:id', roleAuth('ADMIN', 'SALES'), withIdValidation, withAuditLog(
  { entity: 'Quote', action: 'UPDATE', model: 'quote' },
  quoteController.update
));

module.exports = router;
