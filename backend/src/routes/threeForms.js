/**
 * Input: 一键生成三张表请求参数
 * Output: 报关单、外汇核销单、出口退税单生成结果
 * Pos: 出口退税模块路由，提供三表联动生成接口
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { roleAuth } = require('../middleware/roleAuth');
const { createError, wrapAsync } = require('../middleware/errorHandler');
const { success } = require('../utils/response');
const threeFormsService = require('../services/threeFormsService');
const { exportThreeFormsExcel } = threeFormsService;

const router = Router();

router.use(authenticate);

/**
 * POST /api/three-forms/preview
 * 返回后端权威的全量装箱行、HS 证据、定价建议与单证阻塞项，不写业务数据。
 */
router.post('/preview', roleAuth('ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'WAREHOUSE'), wrapAsync(async (req, res) => {
  const readiness = await threeFormsService.previewThreeForms({
    salesContractId: req.body?.salesContractId,
    items: req.body?.items || [],
    profitRate: req.body?.profitRate,
  });
  success(res, readiness);
}));

/**
 * POST /api/three-forms/generate
 * 一键生成三张表（报关单、外汇核销单、出口退税单）
 * 思路：SALES/PURCHASE/FINANCE/WAREHOUSE 均可发起，不限 ADMIN
 */
router.post('/generate', roleAuth('ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'WAREHOUSE'), wrapAsync(async (req, res) => {
  const {
    salesContractId,
    items,
    extraData,
    generateCustoms = true,
    generateForex = true,
    generateTaxRefund = true,
  } = req.body;

  if (!salesContractId) {
    throw createError('缺少出口合同 ID', 400);
  }

  if (!items || !Array.isArray(items)) {
    throw createError('商品明细必须为数组', 400);
  }

  const results = await threeFormsService.generateThreeForms({
    salesContractId,
    items,
    extraData: extraData || {},
    generateCustoms,
    generateForex,
    generateTaxRefund,
  });

  success(res, results, '三张表生成成功');
}));

/**
 * POST /api/three-forms/customs-declaration
 * 单独生成报关单
 */
router.post('/customs-declaration', roleAuth('ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'WAREHOUSE'), wrapAsync(async (req, res) => {
  const { salesContractId, items, extraData } = req.body;

  if (!salesContractId) {
    throw createError('缺少出口合同 ID', 400);
  }

  const result = await threeFormsService.generateCustomsDeclaration({
    salesContractId,
    items: items || [],
    extraData: extraData || {},
  });

  success(res, result, '报关单生成成功');
}));

/**
 * POST /api/three-forms/forex-verification
 * 单独生成外汇核销单
 */
router.post('/forex-verification', roleAuth('ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'WAREHOUSE'), wrapAsync(async (req, res) => {
  const { salesContractId, customsDeclarationId, extraData } = req.body;

  if (!salesContractId) {
    throw createError('缺少出口合同 ID', 400);
  }

  if (!customsDeclarationId) {
    throw createError('缺少报关单 ID', 400);
  }

  const result = await threeFormsService.generateForexVerification({
    salesContractId,
    customsDeclarationId,
    extraData: extraData || {},
  });

  success(res, result, '外汇核销单生成成功');
}));

/**
 * POST /api/three-forms/tax-refund
 * 单独生成出口退税单
 */
router.post('/tax-refund', roleAuth('ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'WAREHOUSE'), wrapAsync(async (req, res) => {
  const { salesContractId, customsDeclarationId, forexVerificationId, items } = req.body;

  if (!salesContractId) {
    throw createError('缺少出口合同 ID', 400);
  }

  if (!customsDeclarationId) {
    throw createError('缺少报关单 ID', 400);
  }

  if (!forexVerificationId) {
    throw createError('缺少外汇核销单 ID', 400);
  }

  const result = await threeFormsService.generateTaxRefund({
    salesContractId,
    customsDeclarationId,
    forexVerificationId,
    items: items || [],
  });

  success(res, result, '出口退税单生成成功');
}));

/**
 * GET /api/three-forms/export/:salesContractId
 * 导出三张表为 Excel，可通过 query 参数指定具体单据 ID
 * 思路：查询最新一次生成的三张表，打包为三 Sheet Excel 下载
 */
router.get('/export/:salesContractId', roleAuth('ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'WAREHOUSE'), wrapAsync(async (req, res) => {
  const { salesContractId } = req.params;
  const { customsDeclarationId, forexId, taxRefundId } = req.query;

  const { buffer, filename } = await exportThreeFormsExcel(salesContractId, {
    customsDeclarationId: customsDeclarationId || undefined,
    forexId: forexId || undefined,
    taxRefundId: taxRefundId || undefined,
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
}));

module.exports = router;
