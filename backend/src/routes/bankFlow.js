/**
 * Input: bankFlowController、auth middleware
 * Output: 银行流水与发票查询路由
 * Pos: 财务模块-银行流水/发票 REST 路由
 */

const { Router } = require('express');
const ctrl = require('../controllers/bankFlowController');
const importCtrl = require('../controllers/financeImportController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { ROLE_SETS } = require('../middleware/roleAuth');
const { withPaginationValidation } = require('../utils/validators');

const router = Router();

router.use(authenticate);
// 银行流水与发票为 Restricted：读写仅 ADMIN（OD-8）
router.use(roleAuth(ROLE_SETS.ADMIN));

// GET /api/v1/bank-flow/transactions
router.get('/transactions', withPaginationValidation, ctrl.listTransactions);

// GET /api/v1/bank-flow/transactions/stats
router.get('/transactions/stats', ctrl.getTransactionStats);

// GET /api/v1/bank-flow/invoices
router.get('/invoices', withPaginationValidation, ctrl.listInvoices);

// GET /api/v1/bank-flow/invoices/stats
router.get('/invoices/stats', ctrl.getInvoiceStats);

// GET /api/v1/bank-flow/invoices/by-seller
router.get('/invoices/by-seller', ctrl.getInvoicesBySeller);

// GET /api/v1/bank-flow/batches
router.get('/batches', ctrl.listBatches);

// GET /api/v1/bank-flow/reconciliation?counterpart=xxx
router.get('/reconciliation', ctrl.getReconciliation);

// GET /api/v1/bank-flow/reconciliation/full
router.get('/reconciliation/full', ctrl.getFullReconciliation);

// GET /api/v1/bank-flow/incoming-summary
router.get('/incoming-summary', ctrl.getIncomingSummary);

// POST /api/v1/bank-flow/import/preview — 预览银行对账单
router.post('/import/preview', roleAuth(ROLE_SETS.ADMIN), importCtrl.upload.single('file'), importCtrl.previewBankFlow);

// POST /api/v1/bank-flow/import — 导入银行对账单
router.post('/import', roleAuth(ROLE_SETS.ADMIN), importCtrl.upload.single('file'), importCtrl.importBankFlow);

// POST /api/v1/bank-flow/invoices/import/preview — 预览发票
router.post('/invoices/import/preview', roleAuth(ROLE_SETS.ADMIN), importCtrl.upload.single('file'), importCtrl.previewInvoices);

// POST /api/v1/bank-flow/invoices/import — 导入发票
router.post('/invoices/import', roleAuth(ROLE_SETS.ADMIN), importCtrl.upload.single('file'), importCtrl.importInvoices);

module.exports = router;
