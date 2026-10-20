/**
 * Input: financeMatchService
 * Output: 智能关联引擎 HTTP 响应
 * Pos: 财务模块-智能关联控制器
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { success, paginated } = require('../utils/response');
const { normalizePagination } = require('../utils/pagination');
const financeMatchService = require('../services/financeMatchService');
const { createError } = require('../middleware/errorHandler');

/**
 * 职责：触发自动匹配
 */
const autoMatch = async (req, res, next) => {
  try {
    const result = await financeMatchService.runAutoMatch();
    success(res, result, `自动匹配完成：银行流水 ${result.bankMatched}/${result.bankTotal}，发票 ${result.invoiceMatched}/${result.invoiceTotal}`);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取未匹配项列表
 */
const getUnmatched = async (req, res, next) => {
  try {
    const { page, pageSize } = normalizePagination(req.query);
    const { type, search } = req.query;

    const result = await financeMatchService.getUnmatchedItems({ page, pageSize, type, search });

    success(res, {
      bankItems: result.bankItems,
      invoiceItems: result.invoiceItems,
      bankTotal: result.bankTotal,
      invoiceTotal: result.invoiceTotal,
      page,
      pageSize,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：人工确认关联
 */
const manualMatch = async (req, res, next) => {
  try {
    const { entityType, entityId, contractId, contractType } = req.body;

    if (!entityType || !entityId || !contractId || !contractType) {
      return next(createError('entityType、entityId、contractId、contractType 均为必填', 400));
    }

    if (!['BANK', 'INVOICE'].includes(entityType)) {
      return next(createError('entityType 必须是 BANK 或 INVOICE', 400));
    }

    if (!['PURCHASE', 'SALES'].includes(contractType)) {
      return next(createError('contractType 必须是 PURCHASE 或 SALES', 400));
    }

    const result = await financeMatchService.manualMatch(entityType, entityId, contractId, contractType);
    success(res, result, '关联成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：解除关联
 */
const unmatch = async (req, res, next) => {
  try {
    const { entityType, entityId } = req.body;

    if (!entityType || !entityId) {
      return next(createError('entityType、entityId 均为必填', 400));
    }

    if (!['BANK', 'INVOICE'].includes(entityType)) {
      return next(createError('entityType 必须是 BANK 或 INVOICE', 400));
    }

    const result = await financeMatchService.unmatch(entityType, entityId);
    success(res, result, '已解除关联');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：忽略该项
 */
const ignore = async (req, res, next) => {
  try {
    const { entityType, entityId } = req.body;

    if (!entityType || !entityId) {
      return next(createError('entityType、entityId 均为必填', 400));
    }

    if (!['BANK', 'INVOICE'].includes(entityType)) {
      return next(createError('entityType 必须是 BANK 或 INVOICE', 400));
    }

    const result = await financeMatchService.ignore(entityType, entityId);
    success(res, result, '已忽略');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取可用于匹配的合同列表
 */
const listContracts = async (req, res, next) => {
  try {
    const { contractType, search } = req.query;

    if (!contractType || !['PURCHASE', 'SALES'].includes(contractType)) {
      return next(createError('contractType 必须是 PURCHASE 或 SALES', 400));
    }

    const contracts = await financeMatchService.listContractsForMatch(contractType, search);
    success(res, contracts);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  autoMatch,
  getUnmatched,
  manualMatch,
  unmatch,
  ignore,
  listContracts,
};
