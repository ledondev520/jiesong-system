/**
 * 批量导入路由
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const batchImportService = require('../services/batchImportService');

/**
 * POST /api/batch-import/sales
 * 批量导入销售合同
 */
router.post('/sales', authenticate, async (req, res, next) => {
  try {
    const { data } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        code: 400,
        message: '导入数据不能为空',
      });
    }

    // 限制单次导入数量
    if (data.length > 1000) {
      return res.status(400).json({
        code: 400,
        message: '单次导入不能超过 1000 条',
      });
    }

    const results = await batchImportService.batchImportSalesContracts(data, userId);

    res.json({
      code: 200,
      message: '导入完成',
      data: results,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/batch-import/purchase
 * 批量导入采购合同
 */
router.post('/purchase', authenticate, async (req, res, next) => {
  try {
    const { data } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        code: 400,
        message: '导入数据不能为空',
      });
    }

    if (data.length > 1000) {
      return res.status(400).json({
        code: 400,
        message: '单次导入不能超过 1000 条',
      });
    }

    const results = await batchImportService.batchImportPurchaseContracts(data, userId);

    res.json({
      code: 200,
      message: '导入完成',
      data: results,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
