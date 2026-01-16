/**
 * Input: 销售控制器
 * Output: 出口合同管理路由
 * Pos: 销售路由，处理出口合同CRUD操作
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const salesController = require('../controllers/salesController');
const { authenticate } = require('../middleware/auth');
const { validateId, validatePagination, handleValidation, body } = require('../utils/validators');

const router = Router();

router.use(authenticate);

// GET /api/v1/sales - 获取出口合同列表
router.get('/', validatePagination, handleValidation, salesController.list);

// GET /api/v1/sales/:id - 获取出口合同详情
router.get('/:id', validateId, handleValidation, salesController.getById);

// POST /api/v1/sales - 创建出口合同
router.post('/', [
  body('exchangeRate').notEmpty().withMessage('汇率不能为空'),
], handleValidation, salesController.create);

// PUT /api/v1/sales/:id - 更新出口合同
router.put('/:id', validateId, handleValidation, salesController.update);

// DELETE /api/v1/sales/:id - 删除出口合同
router.delete('/:id', validateId, handleValidation, salesController.remove);

// POST /api/v1/sales/:id/items - 添加销售明细
router.post('/:id/items', validateId, handleValidation, salesController.addItem);

// PUT /api/v1/sales/:id/status - 更新合同状态
router.put('/:id/status', validateId, handleValidation, salesController.updateStatus);

// GET /api/v1/sales/next-no - 获取下一个合同编号
router.get('/options/next-no', salesController.getNextContractNo);

// POST /api/v1/sales/calculate-price - 计算销售价格
router.post('/calculate-price', salesController.calculatePrice);

module.exports = router;
