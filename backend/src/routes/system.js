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
const { withIdValidation, withPaginationValidation, body, handleValidation } = require('../utils/validators');
const { upload } = require('../utils/upload');

const router = Router();

router.use(authenticate);

// GET /api/v1/system/configs - 获取系统配置
router.get('/configs', systemController.getConfigs);

// PUT /api/v1/system/configs/:key - 更新系统配置（仅管理员）
router.put('/configs/:key', adminOnly, systemController.updateConfig);

// GET /api/v1/system/logs - 获取操作日志（仅管理员）
router.get('/logs', adminOnly, withPaginationValidation, systemController.getLogs);

// GET /api/v1/system/notifications - 获取通知列表
router.get('/notifications', withPaginationValidation, systemController.getNotifications);

// PUT /api/v1/system/notifications/:id/read - 标记通知已读
router.put('/notifications/:id/read', systemController.markNotificationRead);

// GET /api/v1/system/exchange-rate - 获取当前汇率
router.get('/exchange-rate', systemController.getExchangeRate);

// GET /api/v1/system/ports - 获取港口列表
router.get('/ports', withPaginationValidation, systemController.getPorts);

// POST /api/v1/system/ports - 创建港口（仅管理员）
router.post('/ports', adminOnly, [
  body('name').notEmpty().withMessage('港口名称不能为空'),
  body('code').notEmpty().withMessage('港口代码不能为空'),
], handleValidation, systemController.createPort);

// PUT /api/v1/system/ports/:id - 更新港口（仅管理员）
router.put('/ports/:id', adminOnly, withIdValidation, systemController.updatePort);

// DELETE /api/v1/system/ports/:id - 停用港口（仅管理员）
router.delete('/ports/:id', adminOnly, withIdValidation, systemController.removePort);

// GET /api/v1/system/categories - 获取商品分类列表
router.get('/categories', withPaginationValidation, systemController.getCategories);

// POST /api/v1/system/categories - 创建商品分类（仅管理员）
router.post('/categories', adminOnly, [
  body('name').notEmpty().withMessage('分类名称不能为空'),
], handleValidation, systemController.createCategory);

// PUT /api/v1/system/categories/:id - 更新商品分类（仅管理员）
router.put('/categories/:id', adminOnly, withIdValidation, systemController.updateCategory);

// DELETE /api/v1/system/categories/:id - 删除商品分类（仅管理员）
router.delete('/categories/:id', adminOnly, withIdValidation, systemController.removeCategory);

// POST /api/v1/system/import - 导入CSV数据（仅管理员）
router.post('/import', adminOnly, upload.single('file'), systemController.importData);

// GET /api/v1/system/import/records - 获取导入记录（仅管理员）
router.get('/import/records', adminOnly, withPaginationValidation, systemController.getImportRecords);

// GET /api/v1/system/export/:type - 导出数据
router.get('/export/:type', systemController.exportData);

module.exports = router;
