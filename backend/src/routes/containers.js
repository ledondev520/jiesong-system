/**
 * Input: containerController（货柜控制器）、auth/auditLog 中间件
 * Output: /api/v1/containers 路由，含货柜 CRUD 和装箱明细（PackingItem）增删改查汇总
 * Pos: 货柜路由层，将 HTTP 请求分发到 containerController
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const containerController = require('../controllers/containerController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withIdValidation, withPaginationValidation, body, handleValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();

router.use(authenticate);

// GET /api/v1/containers - 获取货柜列表
router.get('/', withPaginationValidation, containerController.list);

// GET /api/v1/containers/next-no/:portId - 获取下一个货柜编号
router.get('/next-no/:portId', containerController.getNextContainerNo);

// GET /api/v1/containers/:id - 获取货柜详情
router.get('/:id', withIdValidation, containerController.getById);

// POST /api/v1/containers - 创建货柜
router.post('/', [
  body('portId').notEmpty().withMessage('港口ID不能为空'),
], roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), handleValidation, withAuditLog(
  { entity: 'Container', action: 'CREATE', model: 'salesContract' },
  containerController.create
));

// PUT /api/v1/containers/:id - 更新货柜
router.put('/:id', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'Container', action: 'UPDATE', model: 'salesContract' },
  containerController.update
));

// DELETE /api/v1/containers/:id - 删除货柜
router.delete('/:id', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'Container', action: 'DELETE', model: 'salesContract' },
  containerController.remove
));

// GET /api/v1/containers/:id/items - 获取装箱明细列表（含商品和门店信息）
router.get('/:id/items', withIdValidation, containerController.listItems);

// GET /api/v1/containers/:id/items/summary - 获取装箱明细汇总（totalBoxes/totalGrossWeight/totalVolume/itemCount）
router.get('/:id/items/summary', withIdValidation, containerController.getItemsSummary);

// POST /api/v1/containers/:id/items - 添加装箱明细
router.post('/:id/items', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'ContainerItem', action: 'CREATE', model: 'packingItem' },
  containerController.addItem
));

// PUT /api/v1/containers/:id/items/:itemId - 更新装箱明细
router.put('/:id/items/:itemId', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'ContainerItem', action: 'UPDATE', model: 'packingItem', idParam: 'itemId' },
  containerController.updateItem
));

// DELETE /api/v1/containers/:id/items/:itemId - 删除装箱明细
router.delete('/:id/items/:itemId', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'ContainerItem', action: 'DELETE', model: 'packingItem', idParam: 'itemId' },
  containerController.removeItem
));

// PUT /api/v1/containers/:id/status - 更新货柜状态
router.put('/:id/status', withIdValidation, roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  { entity: 'Container', action: 'UPDATE', model: 'salesContract' },
  containerController.updateStatus
));

// GET /api/v1/containers/:id/products - 查询货柜中的商品
router.get('/:id/products', withIdValidation, containerController.getProducts);

// GET /api/v1/containers/:id/visualization - 查询货柜装箱可视化
router.get('/:id/visualization', withIdValidation, containerController.getVisualization);

module.exports = router;
