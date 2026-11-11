/**
 * Input: quote controller
 * Output: /api/v1/quotes routes (list, detail, create, update/transition); no DELETE (quotes are cancelled, never deleted)
 * Pos: OD-8 two roles — read, write, export.xlsx and print: ADMIN/SALES; exports are streamed, never stored.
 */
const { Router } = require('express');
const quoteController = require('../controllers/quoteController');
const quoteExportController = require('../controllers/quoteExportController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { ROLE_SETS } = require('../middleware/roleAuth');
const { withIdValidation, withPaginationValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();

router.use(authenticate);

router.get('/', roleAuth('ADMIN', 'SALES'), withPaginationValidation, quoteController.list);

router.get('/:id', roleAuth('ADMIN', 'SALES'), withIdValidation, quoteController.getById);

router.get('/:id/export.xlsx', roleAuth(ROLE_SETS.ALL), withIdValidation, quoteExportController.exportXlsx);

router.get('/:id/print', roleAuth(ROLE_SETS.ALL), withIdValidation, quoteExportController.printView);

router.post('/', roleAuth('ADMIN', 'SALES'), withAuditLog(
  { entity: 'Quote', action: 'CREATE', model: 'quote' },
  quoteController.create
));

router.put('/:id', roleAuth('ADMIN', 'SALES'), withIdValidation, withAuditLog(
  { entity: 'Quote', action: 'UPDATE', model: 'quote' },
  quoteController.update
));

module.exports = router;
