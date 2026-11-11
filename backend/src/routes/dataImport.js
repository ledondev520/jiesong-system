/**
 * Input: dataImportController、tabularImport 共享内存上传中间件
 * Output: CSV/xlsx 数据导入API路由；上传仅在内存中解析，不落盘
 * Pos: 数据导入路由定义
 */

const { tabularUpload } = require('../utils/tabularImport');
const express = require('express');
const router = express.Router();
const catalog = require('../controllers/catalogImportController');
const dataImportController = require('../controllers/dataImportController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { ROLE_SETS } = require('../middleware/roleAuth');
const systemController = require('../controllers/systemController');
const { withAuditLog } = require('../middleware/auditLog');

// CSV/xlsx 内存上传（10MB，仅 .csv/.xlsx），与 /system/import 共用同一配置
const memoryUpload = tabularUpload;

// 所有路由需要认证
router.use(authenticate);

// Dry-run handlers deliberately have no audit wrapper or write side effects.
router.get('/templates', roleAuth(ROLE_SETS.ADMIN), catalog.listTemplates);
router.get('/templates/:kind', roleAuth(ROLE_SETS.ADMIN), catalog.downloadTemplate);
router.post('/catalog/:kind/preview', roleAuth(ROLE_SETS.ADMIN), memoryUpload.single('file'), catalog.preview);
router.post('/catalog/:kind/execute', roleAuth(ROLE_SETS.ADMIN), memoryUpload.single('file'), catalog.execute);

// POST /api/v1/import - 导入CSV数据（仅管理员）
router.post('/', roleAuth(ROLE_SETS.ADMIN), memoryUpload.single('file'), withAuditLog(
  {
    entity: 'DataImport',
    action: 'IMPORT',
    captureBefore: false,
    captureAfter: false,
    getNewValue: ({ req, responseData }) => ({
      fileName: req.file?.originalname || null,
      result: responseData || null,
    }),
  },
  systemController.importData
));

// POST /api/v1/import/preview - 上传并预览CSV
router.post('/preview', roleAuth(ROLE_SETS.ADMIN), memoryUpload.single('file'), dataImportController.previewImport);

// POST /api/v1/import/execute - 执行导入
router.post('/execute', roleAuth(ROLE_SETS.ADMIN), withAuditLog(
  {
    entity: 'DataImport',
    action: 'IMPORT',
    captureBefore: false,
    captureAfter: false,
    getNewValue: ({ req, responseData }) => ({
      recordsCount: Array.isArray(req.body?.records) ? req.body.records.length : 0,
      result: responseData || null,
    }),
  },
  dataImportController.executeImport
));

// GET /api/v1/import/history - 获取导入历史
router.get('/history', roleAuth(ROLE_SETS.ADMIN), dataImportController.getHistory);

// GET /api/v1/import/stats - 获取数据库统计
router.get('/stats', roleAuth(ROLE_SETS.ADMIN), dataImportController.getStats);

module.exports = router;
