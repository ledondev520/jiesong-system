/**
 * Input: 商品控制器
 * Output: 商品管理路由
 * Pos: 商品路由，处理商品CRUD操作
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const productController = require('../controllers/productController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withIdValidation, withPaginationValidation, body, handleValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();

router.use(authenticate);

// GET /api/v1/products - 获取商品列表
router.get('/', withPaginationValidation, productController.list);

// GET /api/v1/products/:id - 获取商品详情
router.get('/:id', withIdValidation, productController.getById);

// POST /api/v1/products - 创建商品
router.post('/', [
  body('customsName').notEmpty().withMessage('报关名不能为空'),
], roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), handleValidation, withAuditLog(
  { entity: 'Product', action: 'CREATE', model: 'product' },
  productController.create
));

// PUT /api/v1/products/:id - 更新商品
router.put('/:id', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'Product', action: 'UPDATE', model: 'product' },
  productController.update
));

// DELETE /api/v1/products/:id - 删除商品
router.delete('/:id', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'Product', action: 'DELETE', model: 'product' },
  productController.remove
));

// GET /api/v1/products/:id/suppliers - 获取商品供应商列表
router.get('/:id/suppliers', withIdValidation, productController.getSuppliers);

// POST /api/v1/products/:id/suppliers - 关联供应商
router.post('/:id/suppliers', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'ProductSupplier', action: 'CREATE', model: 'productSupplier' },
  productController.addSupplier
));

// GET /api/v1/products/categories - 获取商品分类
router.get('/options/categories', productController.getCategories);

// GET /api/v1/products/:id/price-history - 获取商品历史价格
router.get('/:id/price-history', withIdValidation, productController.getPriceHistory);

// POST /api/v1/products/:id/price-history - 记录商品价格
router.post('/:id/price-history', [
  withIdValidation,
  body('price').isFloat({ min: 0 }).withMessage('价格必须为正数'),
], roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), handleValidation, withAuditLog(
  { entity: 'PriceHistory', action: 'CREATE', model: 'priceHistory' },
  productController.recordPrice
));

// GET /api/v1/products/:id/price-trend - 获取价格趋势
router.get('/:id/price-trend', withIdValidation, productController.getPriceTrend);

module.exports = router;
