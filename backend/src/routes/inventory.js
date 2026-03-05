/**
 * Input: 库存控制器
 * Output: 库存管理路由
 * Pos: 库存路由，处理库存查询和状态变更
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const inventoryController = require('../controllers/inventoryController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withIdValidation, withPaginationValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();

router.use(authenticate);

// GET /api/v1/inventory - 获取库存列表
router.get('/', withPaginationValidation, inventoryController.list);

// GET /api/v1/inventory/stats - 获取库存统计（放在/:id前面避免被匹配）
router.get('/stats', inventoryController.getStats);

// GET /api/v1/inventory/snapshot - 按商品聚合库存快照
router.get('/snapshot', inventoryController.getSnapshot);

// GET /api/v1/inventory/alerts - 低库存预警
router.get('/alerts', withPaginationValidation, inventoryController.getAlerts);

// GET /api/v1/inventory/product/:productId - 按商品查询库存
router.get('/product/:productId', inventoryController.getByProduct);

// GET /api/v1/inventory/contract/:contractId - 按出口合同查询库存
router.get('/contract/:contractId', inventoryController.getByContract);

// PUT /api/v1/inventory/batch-status - 批量更新库存状态（静态路由优先）
router.put('/batch-status', roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  {
    entity: 'Inventory',
    action: 'BATCH_UPDATE',
    captureBefore: false,
    captureAfter: false,
    getNewValue: ({ req, responseData }) => ({
      ids: req.body?.ids || [],
      status: req.body?.status || null,
      result: responseData || null,
    }),
  },
  inventoryController.batchUpdateStatus
));

// GET /api/v1/inventory/:id - 获取库存详情（通配路由放最后）
router.get('/:id', withIdValidation, inventoryController.getById);

// PUT /api/v1/inventory/:id/status - 更新库存状态
router.put('/:id/status', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'Inventory', action: 'UPDATE', model: 'inventory' },
  inventoryController.updateStatus
));

module.exports = router;
