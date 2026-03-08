/**
 * Input: hsCodeService
 * Output: HSCode 查询路由
 * Pos: 提供本地 HSCode 搜索与详情接口
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
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

module.exports = router;
