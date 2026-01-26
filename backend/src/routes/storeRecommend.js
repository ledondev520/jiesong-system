/**
 * Input: storeRecommendController
 * Output: 门店采购建议API路由
 * Pos: 路由层定义
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/storeRecommendController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/v1/store-recommend/stats - 获取门店采购统计
router.get('/stats', controller.getStoreStats);

// GET /api/v1/store-recommend/stores - 获取门店列表
router.get('/stores', controller.getStoreList);

// POST /api/v1/store-recommend/recommend - 生成采购建议
router.post('/recommend', controller.getRecommendation);

module.exports = router;
