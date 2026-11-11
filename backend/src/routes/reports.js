/**
 * Input: dashboardController
 * Output: 经营报表 API 路由
 * Pos: 报表路由定义
 */

const express = require('express');
const router = express.Router();
const { getBusinessOverview } = require('../controllers/dashboardController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { ROLE_SETS } = require('../middleware/roleAuth');

// 所有路由需要认证
router.use(authenticate);

// GET /api/v1/reports/business-overview - 获取经营数据报表（老板视角）
router.get('/business-overview', roleAuth(ROLE_SETS.ADMIN), getBusinessOverview);

module.exports = router;
