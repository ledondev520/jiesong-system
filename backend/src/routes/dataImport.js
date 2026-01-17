/**
 * Input: dataImportController、multer中间件
 * Output: 数据导入API路由
 * Pos: 数据导入路由定义
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const dataImportController = require('../controllers/dataImportController');
const { authenticate } = require('../middleware/auth');

// 配置multer内存存储
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB限制
  },
  fileFilter: (req, file, cb) => {
    // 只允许CSV文件
    if (file.mimetype === 'text/csv' || 
        file.originalname.endsWith('.csv') ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('只支持CSV文件格式'), false);
    }
  },
});

// 所有路由需要认证
router.use(authenticate);

// POST /api/v1/import/preview - 上传并预览CSV
router.post('/preview', upload.single('file'), dataImportController.previewImport);

// POST /api/v1/import/execute - 执行导入
router.post('/execute', dataImportController.executeImport);

// GET /api/v1/import/history - 获取导入历史
router.get('/history', dataImportController.getHistory);

// GET /api/v1/import/stats - 获取数据库统计
router.get('/stats', dataImportController.getStats);

module.exports = router;
