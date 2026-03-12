/**
 * Input: hsCodeService
 * Output: HSCode 查询路由
 * Pos: 提供本地 HSCode 搜索与详情接口
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { roleAuth } = require('../middleware/roleAuth');
const hsCodeService = require('../services/hsCodeService');
const { success } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');

const router = Router();

router.use(authenticate);

router.get('/search', async (req, res, next) => {
  try {
    const results = await hsCodeService.searchByProductName(req.query.keyword);
    success(res, results);
  } catch (error) {
    next(error);
  }
});

router.get('/:code', async (req, res, next) => {
  try {
    const record = await hsCodeService.searchByHsCode(req.params.code);

    if (!record) {
      throw createError('HSCode 不存在', 404);
    }

    success(res, record);
  } catch (error) {
    next(error);
  }
});

/**
 * 批量 HSCode 匹配接口
 * POST /api/hs-codes/batch-match
 * Body: { productNames: string[] }
 */
router.post('/batch-match', authenticate, roleAuth('ADMIN'), async (req, res, next) => {
  try {
    const { productNames } = req.body;

    if (!Array.isArray(productNames)) {
      throw createError('productNames 必须是数组', 400);
    }

    if (productNames.length > 100) {
      throw createError('单次最多匹配 100 个商品', 400);
    }

    const results = await hsCodeService.batchMatchHsCodes(productNames);
    success(res, results);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
