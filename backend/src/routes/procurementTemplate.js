/**
 * Input: procurementTemplateService（CSV解析与聚合）
 * Output: 三个需认证的REST端点：门店列表、通用模板、指定门店采购清单
 * Pos: 路由层，将采购模板服务暴露为HTTP API
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getStoreList,
  getUniversalTemplate,
  getStoreTemplate,
} = require('../services/procurementTemplateService');

const router = Router();
router.use(authenticate);

/**
 * 职责：返回CSV中所有门店的去重列表
 * GET /api/v1/procurement-template/stores
 */
router.get('/stores', (req, res, next) => {
  try {
    const stores = getStoreList();
    res.json({ success: true, data: stores });
  } catch (err) {
    console.error('[procurementTemplate] getStoreList error:', err);
    next(err);
  }
});

/**
 * 职责：返回跨所有门店的通用开业采购模板（含优先级、品类分组）
 * GET /api/v1/procurement-template/universal
 */
router.get('/universal', (req, res, next) => {
  try {
    const template = getUniversalTemplate();
    res.json({ success: true, data: template });
  } catch (err) {
    console.error('[procurementTemplate] getUniversalTemplate error:', err);
    next(err);
  }
});

/**
 * 职责：返回指定门店的历史采购明细（按品类分组）
 * GET /api/v1/procurement-template/stores/:storeName
 * @param storeName URL编码的门店名称
 */
router.get('/stores/:storeName', (req, res, next) => {
  try {
    // Express already decodes req.params; decoding again throws URIError on '%' store names.
    const storeName = req.params.storeName;
    const template = getStoreTemplate(storeName);
    res.json({ success: true, data: template });
  } catch (err) {
    console.error('[procurementTemplate] getStoreTemplate error:', err);
    next(err);
  }
});

module.exports = router;
