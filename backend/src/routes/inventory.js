/**
 * Input: 库存控制器
 * Output: 库存管理路由
 * Pos: 库存路由，处理库存查询和状态变更
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const inventoryController = require('../controllers/inventoryController');
const { authenticate } = require('../middleware/auth');
const { validateId, validatePagination, handleValidation } = require('../utils/validators');

const router = Router();

router.use(authenticate);

// GET /api/v1/inventory - 获取库存列表
router.get('/', validatePagination, handleValidation, inventoryController.list);

// GET /api/v1/inventory/stats - 获取库存统计（放在/:id前面避免被匹配）
router.get('/stats', inventoryController.getStats);

// GET /api/v1/inventory/product/:productId - 按商品查询库存
router.get('/product/:productId', inventoryController.getByProduct);

// GET /api/v1/inventory/container/:containerId - 按货柜查询库存
router.get('/container/:containerId', inventoryController.getByContainer);

// GET /api/v1/inventory/:id - 获取库存详情（通配路由放最后）
router.get('/:id', validateId, handleValidation, inventoryController.getById);

// PUT /api/v1/inventory/:id/status - 更新库存状态
router.put('/:id/status', validateId, handleValidation, inventoryController.updateStatus);

module.exports = router;
