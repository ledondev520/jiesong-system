/**
 * Input: bankFlowService、invoiceRecordService
 * Output: 银行流水与发票查询 HTTP handler
 * Pos: 财务模块-银行流水/发票控制器
 */

const bankFlowService = require('../services/bankFlowService');
const invoiceRecordService = require('../services/invoiceRecordService');
const { success, paginated, error } = require('../utils/response');
const { normalizePagination } = require('../utils/pagination');

/**
 * 职责：获取银行流水列表
 */
async function listTransactions(req, res, next) {
  try {
    const { page, pageSize } = normalizePagination(req.query);
    const { search, direction, dateFrom, dateTo, batchId, currency = 'CNY', accountNoMasked, amountMin, amountMax } = req.query;
    const result = await bankFlowService.listTransactions({
      search, direction, dateFrom, dateTo, batchId, currency, accountNoMasked, amountMin, amountMax, page, pageSize,
    });
    paginated(res, result.items, result.total, page, pageSize);
  } catch (err) { next(err); }
}

/**
 * 职责：获取银行流水统计（支持全部筛选条件）
 */
async function getTransactionStats(req, res, next) {
  try {
    const { search, direction, dateFrom, dateTo, batchId, currency = 'CNY', accountNoMasked, amountMin, amountMax } = req.query;
    const stats = await bankFlowService.getStats({ search, direction, dateFrom, dateTo, batchId, currency, accountNoMasked, amountMin, amountMax });
    success(res, stats);
  } catch (err) { next(err); }
}

/**
 * 职责：获取发票记录列表
 */
async function listInvoices(req, res, next) {
  try {
    const { page, pageSize } = normalizePagination(req.query);
    const { search, status, isPositive, dateFrom, dateTo, batchId } = req.query;
    const result = await invoiceRecordService.listInvoices({
      search, status, isPositive, dateFrom, dateTo, batchId, page, pageSize,
    });
    paginated(res, result.items, result.total, page, pageSize);
  } catch (err) { next(err); }
}

/**
 * 职责：获取发票统计（支持全部筛选条件）
 */
async function getInvoiceStats(req, res, next) {
  try {
    const { search, status, isPositive, dateFrom, dateTo, batchId } = req.query;
    const stats = await invoiceRecordService.getStats({ search, status, isPositive, dateFrom, dateTo, batchId });
    success(res, stats);
  } catch (err) { next(err); }
}

/**
 * 职责：获取导入批次列表
 */
async function listBatches(req, res, next) {
  try {
    const { type } = req.query;
    const batches = await bankFlowService.listBatches(type);
    success(res, batches);
  } catch (err) { next(err); }
}

/**
 * 职责：获取全量对账分析
 * 思路：调用 runReconciliation 返回流水-发票匹配、缺票、多开票分类
 */
async function getFullReconciliation(req, res, next) {
  try {
    const data = await bankFlowService.runReconciliation();
    success(res, data);
  } catch (err) { next(err); }
}

/**
 * 职责：获取银行收入按对手方汇总（应收 fallback）
 */
async function getIncomingSummary(req, res, next) {
  try {
    const data = await bankFlowService.getIncomingSummary();
    success(res, data);
  } catch (err) { next(err); }
}

module.exports = {
  listTransactions,
  getTransactionStats,
  listInvoices,
  getInvoiceStats,
  listBatches,
  getFullReconciliation,
  getIncomingSummary,
};
