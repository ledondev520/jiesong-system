/**
 * Input: dashboardController
 * Output: 经营报表 API 路由
 * Pos: 报表路由定义
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const express = require('express');
const router = express.Router();
const { getBusinessOverview } = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

// 所有路由需要认证
router.use(authenticate);

// GET /api/v1/reports/business-overview - 获取经营数据报表（老板视角）
router.get('/business-overview', getBusinessOverview);

module.exports = router;
