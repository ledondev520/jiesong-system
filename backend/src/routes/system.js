/**
 * Input: 系统控制器
 * Output: 系统配置管理路由
 * Pos: 系统路由，处理系统配置和日志查询
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const systemController = require('../controllers/systemController');
const { authenticate, adminOnly } = require('../middleware/auth');
const { validatePagination, handleValidation } = require('../utils/validators');

const router = Router();

router.use(authenticate);

// GET /api/v1/system/configs - 获取系统配置
router.get('/configs', systemController.getConfigs);

// PUT /api/v1/system/configs/:key - 更新系统配置（仅管理员）
router.put('/configs/:key', adminOnly, systemController.updateConfig);

// GET /api/v1/system/logs - 获取操作日志（仅管理员）
router.get('/logs', adminOnly, validatePagination, handleValidation, systemController.getLogs);

// GET /api/v1/system/notifications - 获取通知列表
router.get('/notifications', validatePagination, handleValidation, systemController.getNotifications);

// PUT /api/v1/system/notifications/:id/read - 标记通知已读
router.put('/notifications/:id/read', systemController.markNotificationRead);

// GET /api/v1/system/exchange-rate - 获取当前汇率
router.get('/exchange-rate', systemController.getExchangeRate);

// POST /api/v1/system/import - 导入CSV数据（仅管理员）
router.post('/import', adminOnly, systemController.importData);

// GET /api/v1/system/export/:type - 导出数据
router.get('/export/:type', systemController.exportData);

module.exports = router;
