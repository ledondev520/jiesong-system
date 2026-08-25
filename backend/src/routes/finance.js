/**
 * Input: 财务控制器、财务报表控制器、multer
 * Output: 财务管理路由（付款记录 + 财务报表分析 + 脱敏资料库 + 三文件预览确认导入）
 * Pos: 财务路由，处理付款记录、账款查询、受限资料下钻，以及不可绕过预览的账期数据包写入
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const multer = require('multer');
const financeController = require('../controllers/financeController');
const financialStatementsController = require('../controllers/financialStatementsController');
const financialEvidenceController = require('../controllers/financialEvidenceController');
const financeMatchController = require('../controllers/financeMatchController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withPaginationValidation, body, handleValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

// 内存存储：Excel 文件直接以 buffer 形式传递，不落盘临时目录
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB 上限
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.xlsx$/i)) {
      return cb(new Error('只支持 .xlsx 格式的 Excel 文件'), false);
    }
    cb(null, true);
  },
});

const financialBundleUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 3 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.xls(x)?$/i)) {
      return cb(new Error('只支持 .xls 或 .xlsx 格式的财务文件'), false);
    }
    cb(null, true);
  },
});

const bundleFields = [
  { name: 'statement', maxCount: 1 },
  { name: 'trialBalance', maxCount: 1 },
  { name: 'generalLedger', maxCount: 1 },
];

const router = Router();

router.use(authenticate);

// GET /api/v1/finance/payments - 获取付款记录列表
router.get('/payments', withPaginationValidation, financeController.listPayments);

// POST /api/v1/finance/payments - 创建付款记录
router.post('/payments', [
  body('type').notEmpty().withMessage('付款类型不能为空'),
  body('amount').notEmpty().withMessage('金额不能为空'),
  body('paymentDate').notEmpty().withMessage('付款日期不能为空'),
], roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), handleValidation, withAuditLog(
  { entity: 'Payment', action: 'CREATE', model: 'payment' },
  financeController.createPayment
));

// GET /api/v1/finance/payables - 获取应付账款
router.get('/payables', withPaginationValidation, financeController.getPayables);

// GET /api/v1/finance/receivables - 获取应收账款
router.get('/receivables', withPaginationValidation, financeController.getReceivables);

// GET /api/v1/finance/stats - 获取财务统计
router.get('/stats', financeController.getStats);

// GET /api/v1/finance/receivable-reconciliation - 美元经营应收与会计应收差异桥接
router.get(
  '/receivable-reconciliation',
  roleAuth('ADMIN', 'FINANCE'),
  financeController.getReceivableReconciliation,
);

// GET /api/v1/finance/payment-trends - 获取近N天收付款趋势（按周聚合，用于折线图）
router.get('/payment-trends', financeController.getPaymentTrends);

// GET /api/v1/finance/overdue-receivables - 获取应收逾期预警（发货后超N天未收款）
router.get('/overdue-receivables', financeController.getOverdueReceivables);

// GET /api/v1/finance/unallocated-payments - 获取待分配收款列表
router.get('/unallocated-payments', financeController.listUnallocatedPayments);

// POST /api/v1/finance/payments/auto-match - 对待分配收款执行高置信度自动匹配
router.post(
  '/payments/auto-match',
  roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'),
  financeController.autoMatchPayments
);

// POST /api/v1/finance/payments/:id/allocate - 将收款分配到多张销售合同
router.post(
  '/payments/:id/allocate',
  roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'),
  financeController.allocatePayment
);

// ==================== 财务报表路由 ====================

// GET /api/v1/finance/statements/analytics - 获取趋势分析数据和预警列表（必须在 /:year/:month 之前注册）
router.get('/statements/analytics', financialStatementsController.getAnalytics);

// 财务资料库包含工资、社保和税务结构化行，只允许财务角色下钻。
router.get('/statements/evidence/summary', roleAuth('ADMIN', 'FINANCE'), financialEvidenceController.getSummary);
router.get('/statements/evidence/documents', roleAuth('ADMIN', 'FINANCE'), financialEvidenceController.listDocuments);
router.get('/statements/evidence/documents/:id', roleAuth('ADMIN', 'FINANCE'), financialEvidenceController.getDocument);

// POST /api/v1/finance/statements/import-file/preview - 只读解析，不写数据库
router.post(
  '/statements/import-file/preview',
  roleAuth('ADMIN', 'FINANCE'),
  excelUpload.single('file'),
  financialStatementsController.previewFile,
);

// POST /api/v1/finance/statements/import-file/confirm - 携预览凭证确认写入
router.post(
  '/statements/import-file/confirm',
  roleAuth('ADMIN', 'FINANCE'),
  excelUpload.single('file'),
  financialStatementsController.confirmFile,
);

// POST /api/v1/finance/statements/import-bundle/preview - 三类来源只读解析
router.post(
  '/statements/import-bundle/preview',
  roleAuth('ADMIN', 'FINANCE'),
  financialBundleUpload.fields(bundleFields),
  financialStatementsController.previewBundle,
);

// POST /api/v1/finance/statements/import-bundle/confirm - 三类来源单事务确认写入
router.post(
  '/statements/import-bundle/confirm',
  roleAuth('ADMIN', 'FINANCE'),
  financialBundleUpload.fields(bundleFields),
  financialStatementsController.confirmBundle,
);

// GET /api/v1/finance/statements - 获取所有账期列表
router.get('/statements', financialStatementsController.listStatements);

// GET /api/v1/finance/statements/:year/:month - 获取指定账期详情
router.get('/statements/:year/:month', financialStatementsController.getStatementDetail);

// ==================== 智能关联引擎路由 ====================

// POST /api/v1/finance/auto-match - 触发自动匹配
router.post(
  '/auto-match',
  roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'),
  financeMatchController.autoMatch
);

// GET /api/v1/finance/unmatched - 获取未匹配项列表
router.get('/unmatched', withPaginationValidation, financeMatchController.getUnmatched);

// GET /api/v1/finance/contracts-for-match - 获取可用于匹配的合同列表
router.get('/contracts-for-match', financeMatchController.listContracts);

// POST /api/v1/finance/match - 人工确认关联
router.post(
  '/match',
  roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'),
  financeMatchController.manualMatch
);

// POST /api/v1/finance/unmatch - 解除关联
router.post(
  '/unmatch',
  roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'),
  financeMatchController.unmatch
);

// POST /api/v1/finance/ignore - 忽略该项
router.post(
  '/ignore',
  roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'),
  financeMatchController.ignore
);

module.exports = router;
