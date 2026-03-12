/**
 * Input: 一键生成三张表请求参数
 * Output: 报关单、外汇核销单、出口退税单生成结果
 * Pos: 出口退税模块路由，提供三表联动生成接口
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { createError, wrapAsync } = require('../middleware/errorHandler');
const { success } = require('../utils/response');
const threeFormsService = require('../services/threeFormsService');

const router = Router();

router.use(authenticate);

/**
 * POST /api/three-forms/generate
 * 一键生成三张表（报关单、外汇核销单、出口退税单）
 */
router.post('/generate', wrapAsync(async (req, res) => {
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
router.post('/customs-declaration', wrapAsync(async (req, res) => {
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
router.post('/forex-verification', wrapAsync(async (req, res) => {
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
router.post('/tax-refund', wrapAsync(async (req, res) => {
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

module.exports = router;
