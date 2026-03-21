/**
 * Input: 采购控制器
 * Output: 采购合同管理路由
 * Pos: 采购路由，处理采购合同CRUD操作
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const purchaseController = require('../controllers/purchaseController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withIdValidation, withPaginationValidation, body, handleValidation } = require('../utils/validators');
const { upload } = require('../utils/upload');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();

router.use(authenticate);

// GET /api/v1/purchases - 获取采购合同列表
router.get('/', withPaginationValidation, purchaseController.list);

// GET /api/v1/purchases/options/next-no - 获取下一个合同编号（必须位于 /:id 之前）
router.get('/options/next-no', purchaseController.getNextContractNo);

// GET /api/v1/purchases/:id - 获取采购合同详情
router.get('/:id', withIdValidation, purchaseController.getById);

// POST /api/v1/purchases - 创建采购合同
router.post('/', [
  body('supplierId').notEmpty().withMessage('供应商ID不能为空'),
], roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), handleValidation, withAuditLog(
  { entity: 'PurchaseContract', action: 'CREATE', model: 'purchaseContract' },
  purchaseController.create
));

// PUT /api/v1/purchases/:id - 更新采购合同
router.put('/:id', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'PurchaseContract', action: 'UPDATE', model: 'purchaseContract' },
  purchaseController.update
));

// DELETE /api/v1/purchases/:id - 删除采购合同
router.delete('/:id', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'PurchaseContract', action: 'DELETE', model: 'purchaseContract' },
  purchaseController.remove
));

// POST /api/v1/purchases/:id/items - 添加采购明细
router.post('/:id/items', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'PurchaseItem', action: 'CREATE', model: 'purchaseItem' },
  purchaseController.addItem
));

// PUT /api/v1/purchases/:id/status - 更新合同状态
router.put('/:id/status', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'PurchaseContract', action: 'UPDATE', model: 'purchaseContract' },
  purchaseController.updateStatus
));

// POST /api/v1/purchases/:id/files - 上传合同文件
router.post('/:id/files', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), upload.single('file'), withAuditLog(
  { entity: 'ContractFile', action: 'CREATE', model: 'contractFile' },
  purchaseController.uploadFile
));

// GET /api/v1/purchases/:id/files - 获取合同文件列表
router.get('/:id/files', withIdValidation, purchaseController.getFiles);

// DELETE /api/v1/purchases/files/:fileId - 删除合同文件
router.delete('/files/:fileId', roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'ContractFile', action: 'DELETE', model: 'contractFile', idParam: 'fileId' },
  purchaseController.deleteFile
));

// GET /api/v1/purchases/files/:fileId/download - 下载合同文件
router.get('/files/:fileId/download', purchaseController.downloadFile);

// POST /api/v1/purchases/suppliers-by-products - 根据商品获取曾供应过的供应商
router.post('/suppliers-by-products', roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), purchaseController.getSuppliersByProducts);

module.exports = router;
