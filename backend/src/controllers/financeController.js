/**
 * Input: finance service 层
 * Output: 财务相关的HTTP响应
 * Pos: 财务控制器，委托 service 完成业务逻辑
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { success, created, paginated } = require('../utils/response');
const { normalizePagination } = require('../utils/pagination');
const financeService = require('../services/financeService');
const { createError } = require('../middleware/errorHandler');

/**
 * 职责：获取付款记录列表
 */
const listPayments = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const { type } = req.query;

    const { payments, total } = await financeService.listPayments({
      page,
      pageSize,
      skip,
      type,
    });

    paginated(res, payments, total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：创建付款记录
 */
const createPayment = async (req, res, next) => {
  try {
    const idempotencyKey = req.get('X-Idempotency-Key');
    const { payment, reused } = await financeService.createPayment(req.body || {}, { idempotencyKey });

    if (reused) {
      success(res, payment, '付款记录已存在，返回幂等结果');
      return;
    }

    created(res, payment, '付款记录创建成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取应付账款
 */
const getPayables = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });

    const { payables, total } = await financeService.getPayables({
      page,
      pageSize,
      skip,
    });

    paginated(res, payables, total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取应收账款
 * 思路：
 *   1. 从 packingItems 获取门店信息（去重后）
 *   2. 如果没有门店信息，尝试从目的港口获取
 *   3. 按合同号倒序排列（EXP26 > EXP25 > EXP24）
 */
const getReceivables = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });

    const { receivables, total } = await financeService.getReceivables({
      page,
      pageSize,
      skip,
    });

    paginated(res, receivables, total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取财务统计
 */
const getStats = async (req, res, next) => {
  try {
    const stats = await financeService.getStats();
    success(res, stats);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取近 N 天收付款趋势（按周聚合）
 * @param {Request} req - query.days: 30 | 90，默认 90
 */
const getPaymentTrends = async (req, res, next) => {
  try {
    const days = Number(req.query.days) || 90;
    if (![30, 90, 180].includes(days)) {
      return next(createError('days 参数只允许 30/90/180', 400));
    }
    const trends = await financeService.getPaymentTrends(days);
    success(res, trends);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取应收逾期预警列表
 * @param {Request} req - query.days: 逾期判断天数，默认 30
 */
const getOverdueReceivables = async (req, res, next) => {
  try {
    const overdueDays = Number(req.query.days) || 30;
    const list = await financeService.getOverdueReceivables(overdueDays);
    success(res, list);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listPayments,
  createPayment,
  getPayables,
  getReceivables,
  getStats,
  getPaymentTrends,
  getOverdueReceivables,
};
