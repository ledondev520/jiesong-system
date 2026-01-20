/**
 * Input: 销售控制器
 * Output: 出口合同管理路由（含装箱管理）
 * Pos: 销售路由，处理出口合同CRUD操作
 * 
 * 2026-01-20 重构：合并货柜功能，EXP号即货柜号
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const salesController = require('../controllers/salesController');
const { authenticate } = require('../middleware/auth');
const { validateId, validatePagination, handleValidation, body } = require('../utils/validators');

const router = Router();

router.use(authenticate);

// ==================== 出口合同 CRUD ====================

// GET /api/v1/sales - 获取出口合同列表
router.get('/', validatePagination, handleValidation, salesController.list);

// GET /api/v1/sales/:id - 获取出口合同详情（包含装箱明细）
router.get('/:id', validateId, handleValidation, salesController.getById);

// POST /api/v1/sales - 创建出口合同
router.post('/', [
  body('exchangeRate').notEmpty().withMessage('汇率不能为空'),
], handleValidation, salesController.create);

// PUT /api/v1/sales/:id - 更新出口合同
router.put('/:id', validateId, handleValidation, salesController.update);

// DELETE /api/v1/sales/:id - 删除出口合同
router.delete('/:id', validateId, handleValidation, salesController.remove);

// ==================== 销售明细 ====================

// POST /api/v1/sales/:id/items - 添加销售明细
router.post('/:id/items', validateId, handleValidation, salesController.addItem);

// ==================== 装箱明细 ====================

// POST /api/v1/sales/:id/packing-items - 添加装箱明细
router.post('/:id/packing-items', validateId, handleValidation, salesController.addPackingItem);

// PUT /api/v1/sales/:id/packing-items/:itemId - 更新装箱明细
router.put('/:id/packing-items/:itemId', validateId, handleValidation, salesController.updatePackingItem);

// DELETE /api/v1/sales/:id/packing-items/:itemId - 删除装箱明细
router.delete('/:id/packing-items/:itemId', validateId, handleValidation, salesController.removePackingItem);

// ==================== 其他功能 ====================

// PUT /api/v1/sales/:id/status - 更新合同状态
router.put('/:id/status', validateId, handleValidation, salesController.updateStatus);

// GET /api/v1/sales/next-no - 获取下一个合同编号
router.get('/options/next-no', salesController.getNextContractNo);

// POST /api/v1/sales/calculate-price - 计算销售价格
router.post('/calculate-price', salesController.calculatePrice);

module.exports = router;
