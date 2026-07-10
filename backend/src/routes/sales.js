/**
 * Input: 销售控制器、exportService
 * Output: 出口合同管理路由（含装箱管理、Excel/PDF 导出、源文件附件和船司装箱单核对）
 * Pos: 销售路由，处理出口合同CRUD操作
 * 
 * 2026-01-20 重构：合并货柜功能，EXP号即货柜号
 * 2026-02-21 新增：GET /:id/export-excel 生成三 Sheet 标准出口 Excel
 * 2026-06-03 新增：/:id/files 出口源文件附件上传、列表、下载、删除
 * 2026-07-04 新增：POST /:id/packing-list-check 船司装箱单 PDF 比对核对
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const salesController = require('../controllers/salesController');
const { exportSalesContractExcel } = require('../services/exportService');
const { exportSalesContractPdf } = require('../services/pdfExportService');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withIdValidation, withPaginationValidation, body, handleValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');
const { upload, pdfCheckUpload } = require('../utils/upload');

const router = Router();
const WRITE_ROLES = ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'];

router.use(authenticate);

// ==================== 出口合同 CRUD ====================

// GET /api/v1/sales - 获取出口合同列表
router.get('/', withPaginationValidation, salesController.list);

// GET /api/v1/sales/options/next-no - 获取下一个合同编号（必须位于 /:id 之前）
router.get('/options/next-no', salesController.getNextContractNo);

// GET /api/v1/sales/:id - 获取出口合同详情（包含装箱明细）
router.get('/:id', withIdValidation, salesController.getById);

// POST /api/v1/sales - 创建出口合同
router.post('/', [
  body('exchangeRate').notEmpty().withMessage('汇率不能为空'),
], roleAuth(...WRITE_ROLES), handleValidation, withAuditLog(
  { entity: 'SalesContract', action: 'CREATE', model: 'salesContract' },
  salesController.create
));

// PUT /api/v1/sales/:id - 更新出口合同
router.put('/:id', withIdValidation, roleAuth(...WRITE_ROLES), withAuditLog(
  { entity: 'SalesContract', action: 'UPDATE', model: 'salesContract' },
  salesController.update
));

// DELETE /api/v1/sales/:id - 删除出口合同
router.delete('/:id', withIdValidation, roleAuth(...WRITE_ROLES), withAuditLog(
  { entity: 'SalesContract', action: 'DELETE', model: 'salesContract' },
  salesController.remove
));

// ==================== 销售明细 ====================

// POST /api/v1/sales/:id/items - 添加销售明细
router.post('/:id/items', withIdValidation, roleAuth(...WRITE_ROLES), withAuditLog(
  { entity: 'SalesItem', action: 'CREATE', model: 'salesItem' },
  salesController.addItem
));

// ==================== 装箱明细 ====================

// GET /api/v1/sales/:id/available-purchase-items - 已完工且尚有剩余箱数的采购明细
router.get('/:id/available-purchase-items', withIdValidation, salesController.getAvailablePurchaseItems);

// POST /api/v1/sales/:id/import-purchase-items - 从采购完工资料批量导入装箱明细
router.post('/:id/import-purchase-items', withIdValidation, roleAuth(...WRITE_ROLES), salesController.importPurchasePackingItems);

// POST /api/v1/sales/:id/packing-items - 添加装箱明细
router.post('/:id/packing-items', withIdValidation, roleAuth(...WRITE_ROLES), withAuditLog(
  { entity: 'PackingItem', action: 'CREATE', model: 'packingItem' },
  salesController.addPackingItem
));

// PUT /api/v1/sales/:id/packing-items/:itemId - 更新装箱明细
router.put('/:id/packing-items/:itemId', withIdValidation, roleAuth(...WRITE_ROLES), withAuditLog(
  { entity: 'PackingItem', action: 'UPDATE', model: 'packingItem', idParam: 'itemId' },
  salesController.updatePackingItem
));

// DELETE /api/v1/sales/:id/packing-items/:itemId - 删除装箱明细
router.delete('/:id/packing-items/:itemId', withIdValidation, roleAuth(...WRITE_ROLES), withAuditLog(
  { entity: 'PackingItem', action: 'DELETE', model: 'packingItem', idParam: 'itemId' },
  salesController.removePackingItem
));

// ==================== 其他功能 ====================

// POST /api/v1/sales/:id/files - 上传出口合同附件
router.post('/:id/files', withIdValidation, roleAuth(...WRITE_ROLES), upload.single('file'), withAuditLog(
  { entity: 'SalesContractFile', action: 'CREATE', model: 'salesContractFile' },
  salesController.uploadFile
));

// GET /api/v1/sales/:id/files - 获取出口合同附件列表
router.get('/:id/files', withIdValidation, salesController.getFiles);

// DELETE /api/v1/sales/files/:fileId - 删除出口合同附件
router.delete('/files/:fileId', roleAuth(...WRITE_ROLES), withAuditLog(
  { entity: 'SalesContractFile', action: 'DELETE', model: 'salesContractFile', idParam: 'fileId' },
  salesController.deleteFile
));

// GET /api/v1/sales/files/:fileId/download - 下载出口合同附件
router.get('/files/:fileId/download', salesController.downloadFile);

// POST /api/v1/sales/:id/packing-list-check - 上传船司装箱单 PDF 与系统数据比对（不落盘）
router.post(
  '/:id/packing-list-check',
  withIdValidation,
  roleAuth(...WRITE_ROLES),
  pdfCheckUpload.single('file'),
  salesController.checkPackingList
);

// PUT /api/v1/sales/:id/status - 更新合同状态
router.put('/:id/status', withIdValidation, roleAuth(...WRITE_ROLES), withAuditLog(
  { entity: 'SalesContract', action: 'UPDATE', model: 'salesContract' },
  salesController.updateStatus
));

// POST /api/v1/sales/calculate-price - 计算销售价格
router.post('/calculate-price', roleAuth(...WRITE_ROLES), salesController.calculatePrice);

// GET /api/v1/sales/:id/export-excel - 导出单份合同标准出口 Excel（三 Sheet）
router.get('/:id/export-excel', withIdValidation, async (req, res, next) => {
  try {
    const { buffer, filename } = await exportSalesContractExcel(req.params.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/sales/:id/export-pdf - 导出单份合同 PDF
router.get('/:id/export-pdf', withIdValidation, async (req, res, next) => {
  try {
    const { buffer, filename } = await exportSalesContractPdf(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
