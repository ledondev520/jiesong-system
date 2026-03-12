/**
 * Input: 财务控制器、财务报表控制器、multer
 * Output: 财务管理路由（付款记录 + 财务报表分析 + 文件上传导入）
 * Pos: 财务路由，处理付款记录、账款查询、财务报表导入与分析
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const multer = require('multer');
const financeController = require('../controllers/financeController');
const financialStatementsController = require('../controllers/financialStatementsController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withPaginationValidation, body, handleValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

// 内存存储：Excel 文件直接以 buffer 形式传递，不落盘临时目录
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB 上限
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(xlsx|xls)$/i)) {
      return cb(new Error('只支持 .xlsx 或 .xls 格式的 Excel 文件'), false);
    }
    cb(null, true);
  },
});

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

// ==================== 财务报表路由 ====================

// GET /api/v1/finance/statements/analytics - 获取趋势分析数据和预警列表（必须在 /:year/:month 之前注册）
router.get('/statements/analytics', financialStatementsController.getAnalytics);

// POST /api/v1/finance/statements/import-folder - 从本地目录批量导入账期 Excel
router.post(
  '/statements/import-folder',
  roleAuth('ADMIN', 'FINANCE'),
  financialStatementsController.importFromFolder,
);

// POST /api/v1/finance/statements/import-file - 上传单个 Excel 文件导入指定账期
router.post(
  '/statements/import-file',
  roleAuth('ADMIN', 'FINANCE'),
  excelUpload.single('file'),
  financialStatementsController.importFile,
);

// GET /api/v1/finance/statements - 获取所有账期列表
router.get('/statements', financialStatementsController.listStatements);

// GET /api/v1/finance/statements/:year/:month - 获取指定账期详情
router.get('/statements/:year/:month', financialStatementsController.getStatementDetail);

module.exports = router;
