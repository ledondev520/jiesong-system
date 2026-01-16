/**
 * Input: 门店控制器
 * Output: 门店管理路由
 * Pos: 门店路由，处理门店CRUD操作
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const storeController = require('../controllers/storeController');
const { authenticate } = require('../middleware/auth');
const { validateId, validatePagination, handleValidation, body } = require('../utils/validators');

const router = Router();

router.use(authenticate);

// GET /api/v1/stores - 获取门店列表
router.get('/', validatePagination, handleValidation, storeController.list);

// GET /api/v1/stores/:id - 获取门店详情
router.get('/:id', validateId, handleValidation, storeController.getById);

// POST /api/v1/stores - 创建门店
router.post('/', [
  body('name').notEmpty().withMessage('门店名称不能为空'),
  body('portId').notEmpty().withMessage('港口ID不能为空'),
], handleValidation, storeController.create);

// PUT /api/v1/stores/:id - 更新门店
router.put('/:id', validateId, handleValidation, storeController.update);

// DELETE /api/v1/stores/:id - 删除门店
router.delete('/:id', validateId, handleValidation, storeController.remove);

// GET /api/v1/stores/ports - 获取港口列表
router.get('/options/ports', storeController.getPorts);

module.exports = router;
