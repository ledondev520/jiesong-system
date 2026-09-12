/**
 * Input: dashboardController
 * Output: 仪表盘API路由及WPS同步汇总状态
 * Pos: 仪表盘路由定义
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

// 所有路由需要认证
router.use(authenticate);

router.get('/wps-sync', (req, res) => {
  res.set('Cache-Control', 'no-store');
  require('../utils/response').success(res, require('../services/wpsSyncStatusService').getStatus());
});

// GET /api/v1/dashboard/stats - 获取仪表盘统计数据
router.get('/stats', dashboardController.getStats);

// GET /api/v1/dashboard/track-product - 商品追踪查询
router.get('/track-product', dashboardController.trackProduct);

// GET /api/v1/dashboard/analytics - 数据看板详细分析
router.get('/analytics', dashboardController.getAnalytics);

// GET /api/v1/dashboard/trade-workflows - 出口专项单主线路与下一动作
router.get('/trade-workflows', dashboardController.getTradeWorkflows);

module.exports = router;
