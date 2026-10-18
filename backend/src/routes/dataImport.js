/**
 * Input: dataImportController、multer中间件
 * Output: CSV/xlsx 数据导入API路由
 * Pos: 数据导入路由定义
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { acceptsTabularFile } = require('../utils/tabularImport');
const { createError } = require('../middleware/errorHandler');
const express = require('express');
const multer = require('multer');
const router = express.Router();
const catalog = require('../controllers/catalogImportController');
const dataImportController = require('../controllers/dataImportController');
const { authenticate, roleAuth } = require('../middleware/auth');
const systemController = require('../controllers/systemController');
const { withAuditLog } = require('../middleware/auditLog');

// 配置multer内存存储
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB限制
  },
  fileFilter: (req, file, cb) => {
    if (acceptsTabularFile(file.originalname)) cb(null, true);
    else cb(createError('只支持 CSV 或 xlsx 文件', 400));
  },
});

// 所有路由需要认证
router.use(authenticate);

// Dry-run handlers deliberately have no audit wrapper or write side effects.
router.get('/templates', roleAuth('ADMIN'), catalog.listTemplates);
router.get('/templates/:kind', roleAuth('ADMIN'), catalog.downloadTemplate);
router.post('/catalog/:kind/preview', roleAuth('ADMIN'), memoryUpload.single('file'), catalog.preview);
router.post('/catalog/:kind/execute', roleAuth('ADMIN'), memoryUpload.single('file'), catalog.execute);

// POST /api/v1/import - 导入CSV数据（仅管理员）
router.post('/', roleAuth('ADMIN'), memoryUpload.single('file'), withAuditLog(
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
router.post('/preview', roleAuth('ADMIN'), memoryUpload.single('file'), dataImportController.previewImport);

// POST /api/v1/import/execute - 执行导入
router.post('/execute', roleAuth('ADMIN'), withAuditLog(
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
router.get('/history', dataImportController.getHistory);

// GET /api/v1/import/stats - 获取数据库统计
router.get('/stats', dataImportController.getStats);

module.exports = router;
