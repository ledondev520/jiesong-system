/**
 * Input: 商品控制器
 * Output: 商品管理路由
 * Pos: 商品路由，处理商品CRUD操作
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const productController = require('../controllers/productController');
const { authenticate } = require('../middleware/auth');
const { validateId, validatePagination, handleValidation, body } = require('../utils/validators');

const router = Router();

router.use(authenticate);

// GET /api/v1/products - 获取商品列表
router.get('/', validatePagination, handleValidation, productController.list);

// GET /api/v1/products/:id - 获取商品详情
router.get('/:id', validateId, handleValidation, productController.getById);

// POST /api/v1/products - 创建商品
router.post('/', [
  body('customsName').notEmpty().withMessage('报关名不能为空'),
], handleValidation, productController.create);

// PUT /api/v1/products/:id - 更新商品
router.put('/:id', validateId, handleValidation, productController.update);

// DELETE /api/v1/products/:id - 删除商品
router.delete('/:id', validateId, handleValidation, productController.remove);

// GET /api/v1/products/:id/suppliers - 获取商品供应商列表
router.get('/:id/suppliers', validateId, handleValidation, productController.getSuppliers);

// POST /api/v1/products/:id/suppliers - 关联供应商
router.post('/:id/suppliers', validateId, handleValidation, productController.addSupplier);

// GET /api/v1/products/categories - 获取商品分类
router.get('/options/categories', productController.getCategories);

module.exports = router;
