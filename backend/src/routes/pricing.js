/**
 * Input: 订单编辑器的报价预览请求
 * Output: POST /api/v1/pricing/preview（ADMIN/SALES/PURCHASE）；只读计算，不写库
 * Pos: 报价规则的订单侧预览入口；规则文件的读写仍只在 /system/pricing-config（ADMIN）
 */
const { Router } = require('express');
const { authenticate, roleAuth } = require('../middleware/auth');
const { previewLines } = require('../controllers/pricingPreviewController');

const router = Router();

router.use(authenticate);

router.post('/preview', roleAuth('ADMIN', 'SALES', 'PURCHASE'), previewLines);

module.exports = router;
