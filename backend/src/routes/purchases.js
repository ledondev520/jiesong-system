/**
 * Input: 采购控制器
 * Output: 采购合同管理路由
 * Pos: 采购路由，处理采购合同CRUD操作
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const purchaseController = require('../controllers/purchaseController');
const { authenticate } = require('../middleware/auth');
const { validateId, validatePagination, handleValidation, body } = require('../utils/validators');
const { upload } = require('../utils/upload');

const router = Router();

router.use(authenticate);

// GET /api/v1/purchases - 获取采购合同列表
router.get('/', validatePagination, handleValidation, purchaseController.list);

// GET /api/v1/purchases/options/next-no - 获取下一个合同编号（必须位于 /:id 之前）
router.get('/options/next-no', purchaseController.getNextContractNo);

// GET /api/v1/purchases/:id - 获取采购合同详情
router.get('/:id', validateId, handleValidation, purchaseController.getById);

// POST /api/v1/purchases - 创建采购合同
router.post('/', [
  body('supplierId').notEmpty().withMessage('供应商ID不能为空'),
], handleValidation, purchaseController.create);

// PUT /api/v1/purchases/:id - 更新采购合同
router.put('/:id', validateId, handleValidation, purchaseController.update);

// DELETE /api/v1/purchases/:id - 删除采购合同
router.delete('/:id', validateId, handleValidation, purchaseController.remove);

// POST /api/v1/purchases/:id/items - 添加采购明细
router.post('/:id/items', validateId, handleValidation, purchaseController.addItem);

// PUT /api/v1/purchases/:id/status - 更新合同状态
router.put('/:id/status', validateId, handleValidation, purchaseController.updateStatus);

// POST /api/v1/purchases/:id/files - 上传合同文件
router.post('/:id/files', validateId, handleValidation, upload.single('file'), purchaseController.uploadFile);

// GET /api/v1/purchases/:id/files - 获取合同文件列表
router.get('/:id/files', validateId, handleValidation, purchaseController.getFiles);

// DELETE /api/v1/purchases/files/:fileId - 删除合同文件
router.delete('/files/:fileId', purchaseController.deleteFile);

// POST /api/v1/purchases/suppliers-by-products - 根据商品获取曾供应过的供应商
router.post('/suppliers-by-products', purchaseController.getSuppliersByProducts);

module.exports = router;
