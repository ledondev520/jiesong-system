/**
 * Input: 销售控制器、exportService
 * Output: 出口合同管理路由（含装箱管理、Excel 导出）
 * Pos: 销售路由，处理出口合同CRUD操作
 * 
 * 2026-01-20 重构：合并货柜功能，EXP号即货柜号
 * 2026-02-21 新增：GET /:id/export-excel 生成三 Sheet 标准出口 Excel
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const salesController = require('../controllers/salesController');
const { exportSalesContractExcel } = require('../services/exportService');
const { authenticate } = require('../middleware/auth');
const { validateId, validatePagination, handleValidation, body } = require('../utils/validators');

const router = Router();

router.use(authenticate);

// ==================== 出口合同 CRUD ====================

// GET /api/v1/sales - 获取出口合同列表
router.get('/', validatePagination, handleValidation, salesController.list);

// GET /api/v1/sales/options/next-no - 获取下一个合同编号（必须位于 /:id 之前）
router.get('/options/next-no', salesController.getNextContractNo);

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

// POST /api/v1/sales/calculate-price - 计算销售价格
router.post('/calculate-price', salesController.calculatePrice);

// GET /api/v1/sales/:id/export-excel - 导出单份合同标准出口 Excel（三 Sheet）
router.get('/:id/export-excel', validateId, handleValidation, async (req, res) => {
  try {
    const { buffer, filename } = await exportSalesContractExcel(req.params.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);
  } catch (err) {
    if (err.message && err.message.includes('合同不存在')) {
      return res.status(404).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: '导出 Excel 失败', error: err.message });
  }
});

module.exports = router;
