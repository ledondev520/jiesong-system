/**
 * Input: 财务控制器
 * Output: 财务管理路由
 * Pos: 财务路由，处理付款记录和账款查询
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const financeController = require('../controllers/financeController');
const { authenticate } = require('../middleware/auth');
const { withPaginationValidation, body, handleValidation } = require('../utils/validators');

const router = Router();

router.use(authenticate);

// GET /api/v1/finance/payments - 获取付款记录列表
router.get('/payments', withPaginationValidation, financeController.listPayments);

// POST /api/v1/finance/payments - 创建付款记录
router.post('/payments', [
  body('type').notEmpty().withMessage('付款类型不能为空'),
  body('amount').notEmpty().withMessage('金额不能为空'),
  body('paymentDate').notEmpty().withMessage('付款日期不能为空'),
], handleValidation, financeController.createPayment);

// GET /api/v1/finance/payables - 获取应付账款
router.get('/payables', withPaginationValidation, financeController.getPayables);

// GET /api/v1/finance/receivables - 获取应收账款
router.get('/receivables', withPaginationValidation, financeController.getReceivables);

// GET /api/v1/finance/stats - 获取财务统计
router.get('/stats', financeController.getStats);

module.exports = router;
