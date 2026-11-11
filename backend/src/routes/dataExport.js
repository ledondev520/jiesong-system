/**
 * Input: 系统导入导出控制器
 * Output: 数据导出 API 路由（挂载于 /api/v1/export/:type）
 * Pos: 数据导出路由定义，与 /api/v1/system/export/:type 功能相同，保留为兼容层
 *
 * 安全说明：该路由与 system.js 中的 /system/export/:type 指向同一控制器，
 * 已对齐相同的 roleAuth 权限配置，防止绕过 RBAC 直接访问。
 */

const { Router } = require('express');
const systemController = require('../controllers/systemController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { ROLE_SETS } = require('../middleware/roleAuth');
const { paymentsExportGuard } = require('../middleware/paymentsExportGuard');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();

// 所有路由需要认证
router.use(authenticate);

// GET /api/v1/export/:type - 导出数据（权限与 /system/export/:type 对齐，防止 RBAC 旁路）
router.get('/:type', roleAuth(ROLE_SETS.ALL), paymentsExportGuard, withAuditLog(
  {
    entity: 'DataExport',
    action: 'EXPORT',
    captureBefore: false,
    captureAfter: false,
    getNewValue: ({ req }) => ({ type: req.params.type, format: 'csv', query: req.query }),
  },
  systemController.exportData
));

module.exports = router;
