/**
 * Input: 库存控制器
 * Output: 库存管理路由
 * Pos: 库存路由，处理库存查询和状态变更
 */

const { Router } = require('express');
const inventoryController = require('../controllers/inventoryController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { ROLE_SETS } = require('../middleware/roleAuth');
const { withIdValidation, withPaginationValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();

router.use(authenticate);

// GET /api/v1/inventory - 获取库存列表
router.get('/', withPaginationValidation, inventoryController.list);

// PUT /api/v1/inventory/batch-status - 批量更新库存状态（静态路由优先）
router.put('/batch-status', roleAuth(ROLE_SETS.ALL), withAuditLog(
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
router.put('/:id/status', withIdValidation, roleAuth(ROLE_SETS.ALL), withAuditLog(
  { entity: 'Inventory', action: 'UPDATE', model: 'inventory' },
  inventoryController.updateStatus
));

module.exports = router;
