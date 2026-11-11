/**
 * Input: 系统控制器
 * Output: 系统配置管理路由；CSV/xlsx 导入经内存上传，不在磁盘留下文件
 * Pos: 系统路由，处理系统配置和日志查询
 */

const { Router } = require('express');
const systemController = require('../controllers/systemController');
const pricingController = require('../controllers/system/pricingController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { ROLE_SETS } = require('../middleware/roleAuth');
const { withIdValidation, withPaginationValidation, body, handleValidation } = require('../utils/validators');
const { tabularUpload } = require('../utils/tabularImport');
const { withAuditLog } = require('../middleware/auditLog');
const { paymentsExportGuard } = require('../middleware/paymentsExportGuard');

const router = Router();

router.use(authenticate);

router.get('/pricing-config', roleAuth(ROLE_SETS.ADMIN), pricingController.getPricing);
router.put('/pricing-config', roleAuth(ROLE_SETS.ADMIN), pricingController.updatePricing);
// 预览只读计算，用 GET：lifecycle 契约不允许新增未登记的写路由（check-lifecycle.cjs）
router.get('/pricing-config/preview', roleAuth(ROLE_SETS.ADMIN), pricingController.previewPricing);

// GET /api/v1/system/configs - 获取系统配置（平铺格式，向后兼容）
router.get('/configs', systemController.getConfigs);

// GET /api/v1/system/configs/domains - 获取按域分组的系统配置（新端点，供设置页使用）
router.get('/configs/domains', roleAuth(ROLE_SETS.ADMIN), systemController.getConfigsByDomain);

// PUT /api/v1/system/configs/:key - 更新系统配置（仅管理员）
router.put('/configs/:key', roleAuth(ROLE_SETS.ADMIN), withAuditLog(
  {
    entity: 'SystemConfig',
    action: 'UPDATE',
    model: 'systemConfig',
    idParam: 'key',
    idField: 'key',
  },
  systemController.updateConfig
));

// GET /api/v1/system/logs - 获取操作日志（仅管理员）
router.get('/logs', roleAuth(ROLE_SETS.ADMIN), withPaginationValidation, systemController.getLogs);

// GET /api/v1/system/logs/export/csv - 导出操作日志（CSV）
router.get('/logs/export/csv', roleAuth(ROLE_SETS.ADMIN), systemController.exportOperationLogsCsv);

// GET /api/v1/system/notifications - 获取通知列表
router.get('/notifications', withPaginationValidation, systemController.getNotifications);

// PUT /api/v1/system/notifications/:id/read - 标记通知已读
router.put('/notifications/:id/read', roleAuth(ROLE_SETS.EVERYONE), withAuditLog(
  { entity: 'Notification', action: 'UPDATE', model: 'notification' },
  systemController.markNotificationRead
));

// GET /api/v1/system/seller-identity - 统一卖方信息（公司信息 + 旧开票抬头别名；银行资料仅 ADMIN/FINANCE）
router.get('/seller-identity', systemController.getSellerIdentity);

// GET /api/v1/system/exchange-rate - 获取当前汇率
router.get('/exchange-rate', systemController.getExchangeRate);

// POST /api/v1/system/exchange-rate/sync - 从公开 API 自动同步汇率（仅管理员）
router.post('/exchange-rate/sync', roleAuth(ROLE_SETS.ADMIN), systemController.syncExchangeRate);

// GET /api/v1/system/ports - 获取港口列表
router.get('/ports', withPaginationValidation, systemController.getPorts);

// POST /api/v1/system/ports - 创建港口（仅管理员）
router.post('/ports', roleAuth(ROLE_SETS.ADMIN), [
  body('name').notEmpty().withMessage('港口名称不能为空'),
  body('code').notEmpty().withMessage('港口代码不能为空'),
], handleValidation, withAuditLog(
  { entity: 'Port', action: 'CREATE', model: 'port' },
  systemController.createPort
));

// PUT /api/v1/system/ports/:id - 更新港口（仅管理员）
router.put('/ports/:id', roleAuth(ROLE_SETS.ADMIN), withIdValidation, withAuditLog(
  { entity: 'Port', action: 'UPDATE', model: 'port' },
  systemController.updatePort
));

// DELETE /api/v1/system/ports/:id - 停用港口（仅管理员）
router.delete('/ports/:id', roleAuth(ROLE_SETS.ADMIN), withIdValidation, withAuditLog(
  { entity: 'Port', action: 'DELETE', model: 'port' },
  systemController.removePort
));

// GET /api/v1/system/categories - 获取商品分类列表
router.get('/categories', withPaginationValidation, systemController.getCategories);

// POST /api/v1/system/categories - 创建商品分类（仅管理员）
router.post('/categories', roleAuth(ROLE_SETS.ADMIN), [
  body('name').notEmpty().withMessage('分类名称不能为空'),
], handleValidation, withAuditLog(
  { entity: 'ProductCategory', action: 'CREATE', model: 'productCategory' },
  systemController.createCategory
));

// PUT /api/v1/system/categories/:id - 更新商品分类（仅管理员）
router.put('/categories/:id', roleAuth(ROLE_SETS.ADMIN), withIdValidation, withAuditLog(
  { entity: 'ProductCategory', action: 'UPDATE', model: 'productCategory' },
  systemController.updateCategory
));

// DELETE /api/v1/system/categories/:id - 删除商品分类（仅管理员）
router.delete('/categories/:id', roleAuth(ROLE_SETS.ADMIN), withIdValidation, withAuditLog(
  { entity: 'ProductCategory', action: 'DELETE', model: 'productCategory' },
  systemController.removeCategory
));

// GET /api/v1/system/customs-brokers - 获取报关公司列表
router.get('/customs-brokers', withPaginationValidation, systemController.getCustomsBrokers);

// POST /api/v1/system/customs-brokers - 创建报关公司（仅管理员）
router.post('/customs-brokers', roleAuth(ROLE_SETS.ADMIN), [
  body('name').notEmpty().withMessage('报关公司名称不能为空'),
], handleValidation, withAuditLog(
  { entity: 'CustomsBroker', action: 'CREATE', model: 'customsBroker' },
  systemController.createCustomsBroker
));

// PUT /api/v1/system/customs-brokers/:id - 更新报关公司（仅管理员）
router.put('/customs-brokers/:id', roleAuth(ROLE_SETS.ADMIN), withIdValidation, withAuditLog(
  { entity: 'CustomsBroker', action: 'UPDATE', model: 'customsBroker' },
  systemController.updateCustomsBroker
));

// DELETE /api/v1/system/customs-brokers/:id - 停用报关公司（仅管理员）
router.delete('/customs-brokers/:id', roleAuth(ROLE_SETS.ADMIN), withIdValidation, withAuditLog(
  { entity: 'CustomsBroker', action: 'DELETE', model: 'customsBroker' },
  systemController.removeCustomsBroker
));

// POST /api/v1/system/import - 导入CSV数据（仅管理员）
router.post('/import', roleAuth(ROLE_SETS.ADMIN), tabularUpload.single('file'), withAuditLog(
  {
    entity: 'DataImport',
    action: 'IMPORT',
    captureBefore: false,
    captureAfter: false,
    getNewValue: ({ responseData, req }) => ({
      fileName: req.file?.originalname || null,
      result: responseData || null,
    }),
  },
  systemController.importData
));

// GET /api/v1/system/import/records - 获取导入记录（仅管理员）
router.get('/import/records', roleAuth(ROLE_SETS.ADMIN), withPaginationValidation, systemController.getImportRecords);


// GET /api/v1/system/export/:type - 导出数据（需要管理员或业务主管权限，操作记入审计日志）
router.get('/export/:type', roleAuth(ROLE_SETS.OPERATORS), paymentsExportGuard, withAuditLog(
  {
    entity: 'DataExport',
    action: 'EXPORT',
    captureBefore: false,
    captureAfter: false,
    getNewValue: ({ req }) => ({
      type: req.params.type,
      format: 'csv',
      query: req.query,
    }),
  },
  systemController.exportData
));

// GET /api/v1/system/export/:type/pdf - 导出PDF报表（需要管理员或业务主管权限，操作记入审计日志）
router.get('/export/:type/pdf', roleAuth(ROLE_SETS.OPERATORS), paymentsExportGuard, withAuditLog(
  {
    entity: 'DataExport',
    action: 'EXPORT',
    captureBefore: false,
    captureAfter: false,
    getNewValue: ({ req }) => ({
      type: req.params.type,
      format: 'pdf',
      query: req.query,
    }),
  },
  systemController.exportDataPdf
));

// GET /api/v1/system/event-ledger - 获取统一事件流（仅管理员）
router.get('/event-ledger', roleAuth(ROLE_SETS.ADMIN), withPaginationValidation, systemController.getEventLedger);

// GET /api/v1/system/patrol/status - 获取巡检状态（仅管理员）
router.get('/patrol/status', roleAuth(ROLE_SETS.ADMIN), systemController.getPatrolStatus);

// POST /api/v1/system/patrol/trigger - 手动触发巡检（仅管理员）
router.post('/patrol/trigger', roleAuth(ROLE_SETS.ADMIN), systemController.triggerPatrol);

module.exports = router;
