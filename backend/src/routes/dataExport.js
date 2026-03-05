/**
 * Input: 系统导入导出控制器
 * Output: 数据导出 API 路由
 * Pos: 数据导出路由定义
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const systemController = require('../controllers/systemController');
const { authenticate } = require('../middleware/auth');

const router = Router();

// 所有路由需要认证
router.use(authenticate);

// GET /api/v1/export/:type - 导出数据
router.get('/:type', systemController.exportData);

module.exports = router;
