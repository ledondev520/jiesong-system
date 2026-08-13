/**
 * Input: 销售控制器、exportService
 * Output: 出口合同管理路由（含装箱、出口三单、单证核对、退税准备与单柜财务结算）
 * Pos: 销售路由，处理出口合同CRUD操作
 * 
 * 2026-01-20 重构：合并货柜功能，EXP号即货柜号
 * 2026-02-21 新增：GET /:id/export-excel 生成三 Sheet 标准出口 Excel
 * 2026-06-03 新增：/:id/files 出口源文件附件上传、列表、下载、删除
 * 2026-07-10 升级：船司装箱单 PDF 原件、差异、历史和人工结论持久化
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const salesController = require('../controllers/salesController');
const { exportSalesContractExcel } = require('../services/exportService');
const { exportSalesContractPdf } = require('../services/pdfExportService');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withIdValidation, withPaginationValidation, body, param, handleValidation } = require('../utils/validators');
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

const exportPacketValidation = [
  body('spotRate').isFloat({ gt: 0.2, lt: 20 }).withMessage('现汇必须大于 0.2 且小于 20'),
  body('sellerName').trim().notEmpty().withMessage('卖方名称不能为空').isLength({ max: 200 }).withMessage('卖方名称不能超过 200 字'),
  body('buyerName').trim().notEmpty().withMessage('买方名称不能为空').isLength({ max: 200 }).withMessage('买方名称不能超过 200 字'),
  body('packageKind').trim().notEmpty().withMessage('包装种类不能为空').isLength({ max: 80 }).withMessage('包装种类不能超过 80 字'),
  body('tradeTerm').trim().notEmpty().withMessage('贸易术语不能为空').isLength({ max: 40 }).withMessage('贸易术语不能超过 40 字'),
  body('documentDate').isISO8601({ strict: true }).withMessage('单证日期格式无效'),
  body('priceOverrides').optional().isArray({ max: 1000 }).withMessage('人工价格覆盖格式无效'),
  body('priceOverrides.*.packingItemId').notEmpty().withMessage('装箱明细 ID 不能为空'),
  body('priceOverrides.*.unitPriceUsd').isFloat({ gt: 0 }).withMessage('人工单价必须大于 0'),
  handleValidation,
];

// POST /api/v1/sales/:id/export-packet/preview - 只读预检和定价草案
router.post('/:id/export-packet/preview', withIdValidation, roleAuth(...WRITE_ROLES), exportPacketValidation, salesController.previewExportPacket);

// POST /api/v1/sales/:id/export-packet/generate - 确认价格后生成、归档出口三单
router.post('/:id/export-packet/generate', withIdValidation, roleAuth(...WRITE_ROLES), exportPacketValidation, salesController.generateExportPacket);

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

// POST /api/v1/sales/:id/packing-list-check - 比对、归档并保存一次船司装箱单核对
router.post(
  '/:id/packing-list-check',
  withIdValidation,
  roleAuth(...WRITE_ROLES),
  pdfCheckUpload.single('file'),
  withAuditLog({
    entity: 'PackingListCheck',
    action: 'CREATE',
    model: 'packingListCheck',
    captureAfter: false,
    getEntityId: ({ responseData }) => responseData?.id,
    getNewValue: ({ responseData }) => ({
      id: responseData?.id,
      status: responseData?.status,
      automaticStatus: responseData?.automaticStatus,
      fieldMismatched: responseData?.fieldMismatched,
      itemCheckMismatched: responseData?.itemCheckMismatched,
      salesContractFileId: responseData?.salesContractFileId,
    }),
  }, salesController.checkPackingList),
);

// GET /api/v1/sales/:id/packing-list-checks - 历史核对记录
router.get('/:id/packing-list-checks', withIdValidation, salesController.listPackingListChecks);

// GET /api/v1/sales/:id/tax-refund-preparation - 退税申报/备案/收汇内部准备清单
router.get('/:id/tax-refund-preparation', withIdValidation, salesController.getTaxRefundPreparation);

// GET /api/v1/sales/:id/tax-refund-preparation/export - 导出内部准备清单 Excel
router.get('/:id/tax-refund-preparation/export', withIdValidation, salesController.exportTaxRefundPreparation);

// GET /api/v1/sales/:id/finance-summary - 单柜收入、成本、退税与现金流统一口径
router.get('/:id/finance-summary', withIdValidation, salesController.getFinanceSummary);

// PUT /api/v1/sales/:id/packing-list-checks/:checkId/review - 人工通过/驳回
router.put(
  '/:id/packing-list-checks/:checkId/review',
  [
    param('id').notEmpty().withMessage('ID不能为空').isString().withMessage('ID格式无效'),
    param('checkId').notEmpty().withMessage('核对记录 ID 不能为空'),
    body('decision').isIn(['APPROVED', 'REJECTED']).withMessage('核对结论无效'),
    body('note').trim().notEmpty().withMessage('请填写人工核对说明').isLength({ max: 1000 }).withMessage('人工核对说明不能超过 1000 字'),
    handleValidation,
  ],
  roleAuth(...WRITE_ROLES),
  withAuditLog({
    entity: 'PackingListCheck',
    action: 'UPDATE',
    model: 'packingListCheck',
    idParam: 'checkId',
    captureBefore: false,
    captureAfter: false,
    getNewValue: ({ responseData }) => ({
      id: responseData?.id,
      status: responseData?.status,
      reviewedAt: responseData?.reviewedAt,
      hasReviewNote: Boolean(responseData?.reviewNote),
    }),
  }, salesController.reviewPackingListCheck),
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
