/**
 * Input: 客户控制器
 * Output: 客户路由（读：所有已登录角色，BOSS 经白名单只读；写：ADMIN、SALES）
 * Pos: 客户 API。没有 DELETE：客户归档用 PUT isActive:false，永不物理删除。
 *      客户下门店的写入沿用 /stores（需 customerId，见 storeController）；读取用 GET /:id/stores。
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const { Router } = require('express');
const customerController = require('../controllers/customerController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withIdValidation, withPaginationValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();

router.use(authenticate);

router.get('/', withPaginationValidation, customerController.list);
router.get('/:id', withIdValidation, customerController.getById);
router.get('/:id/stores', withIdValidation, withPaginationValidation, customerController.listStores);

router.post('/', roleAuth('ADMIN', 'SALES'), withAuditLog(
  { entity: 'Customer', action: 'CREATE', model: 'customer' },
  customerController.create
));

router.put('/:id', roleAuth('ADMIN', 'SALES'), withIdValidation, withAuditLog(
  { entity: 'Customer', action: 'UPDATE', model: 'customer' },
  customerController.update
));

module.exports = router;
