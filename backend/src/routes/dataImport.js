/**
 * Input: catalogImportController、tabularImport 共享内存上传中间件
 * Output: CSV/xlsx 数据导入API路由；上传仅在内存中解析，不落盘
 * Pos: 数据导入路由定义
 */

const { tabularUpload } = require('../utils/tabularImport');
const express = require('express');
const router = express.Router();
const catalog = require('../controllers/catalogImportController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { ROLE_SETS } = require('../middleware/roleAuth');

// CSV/xlsx 内存上传（10MB，仅 .csv/.xlsx）
const memoryUpload = tabularUpload;

// 所有路由需要认证
router.use(authenticate);

// Dry-run handlers deliberately have no audit wrapper or write side effects.
router.get('/templates/:kind', roleAuth(ROLE_SETS.ADMIN), catalog.downloadTemplate);
router.post('/catalog/:kind/preview', roleAuth(ROLE_SETS.ADMIN), memoryUpload.single('file'), catalog.preview);
router.post('/catalog/:kind/execute', roleAuth(ROLE_SETS.ADMIN), memoryUpload.single('file'), catalog.execute);

module.exports = router;
