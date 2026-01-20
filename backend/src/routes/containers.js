/**
 * Input: 货柜控制器
 * Output: 货柜管理路由
 * Pos: 货柜路由，处理货柜CRUD操作
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const containerController = require('../controllers/containerController');
const { authenticate } = require('../middleware/auth');
const { validateId, validatePagination, handleValidation, body } = require('../utils/validators');

const router = Router();

router.use(authenticate);

// GET /api/v1/containers - 获取货柜列表
router.get('/', validatePagination, handleValidation, containerController.list);

// GET /api/v1/containers/:id - 获取货柜详情
router.get('/:id', validateId, handleValidation, containerController.getById);

// POST /api/v1/containers - 创建货柜
router.post('/', [
  body('portId').notEmpty().withMessage('港口ID不能为空'),
], handleValidation, containerController.create);

// PUT /api/v1/containers/:id - 更新货柜
router.put('/:id', validateId, handleValidation, containerController.update);

// DELETE /api/v1/containers/:id - 删除货柜
router.delete('/:id', validateId, handleValidation, containerController.remove);

// POST /api/v1/containers/:id/items - 添加装箱明细
router.post('/:id/items', validateId, handleValidation, containerController.addItem);

// PUT /api/v1/containers/:id/items/:itemId - 更新装箱明细
router.put('/:id/items/:itemId', validateId, handleValidation, containerController.updateItem);

// DELETE /api/v1/containers/:id/items/:itemId - 删除装箱明细
router.delete('/:id/items/:itemId', validateId, handleValidation, containerController.removeItem);

// PUT /api/v1/containers/:id/status - 更新货柜状态
router.put('/:id/status', validateId, handleValidation, containerController.updateStatus);

// GET /api/v1/containers/next-no/:portId - 获取下一个货柜编号
router.get('/next-no/:portId', containerController.getNextContainerNo);

// GET /api/v1/containers/:id/products - 查询货柜中的商品
router.get('/:id/products', validateId, handleValidation, containerController.getProducts);

module.exports = router;
