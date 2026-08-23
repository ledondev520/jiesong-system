/**
 * Input: bankFlowService、invoiceRecordService
 * Output: 银行流水与发票查询 HTTP handler
 * Pos: 财务模块-银行流水/发票控制器
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
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
    const { search, direction, dateFrom, dateTo, batchId, currency = 'CNY', accountNoMasked } = req.query;
    const result = await bankFlowService.listTransactions({
      search, direction, dateFrom, dateTo, batchId, currency, accountNoMasked, page, pageSize,
    });
    paginated(res, result.items, result.total, page, pageSize);
  } catch (err) { next(err); }
}

/**
 * 职责：获取银行流水统计（支持全部筛选条件）
 */
async function getTransactionStats(req, res, next) {
  try {
    const { search, direction, dateFrom, dateTo, batchId, currency = 'CNY', accountNoMasked } = req.query;
    const stats = await bankFlowService.getStats({ search, direction, dateFrom, dateTo, batchId, currency, accountNoMasked });
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
 * 职责：按销方汇总发票
 */
async function getInvoicesBySeller(req, res, next) {
  try {
    const { dateFrom, dateTo, limit } = req.query;
    const data = await invoiceRecordService.groupBySeller({
      dateFrom, dateTo, limit: limit ? parseInt(limit) : 50,
    });
    success(res, data);
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
 * 职责：获取指定对方名称的银行流水 + 发票关联汇总
 * 思路：按 counterpart 查银行流水，按 seller 查发票，返回汇总对比
 */
async function getReconciliation(req, res, next) {
  try {
    const { counterpart } = req.query;
    if (!counterpart) return error(res, '缺少 counterpart 参数', 400);

    // 0. 查银行流水
    const txns = await bankFlowService.listTransactions({
      search: counterpart, currency: 'CNY', page: 1, pageSize: 200,
    });

    // 1. 查发票
    const invs = await invoiceRecordService.listInvoices({
      search: counterpart, page: 1, pageSize: 200,
    });

    // 2. 汇总
    let totalPaid = 0;
    let totalReceived = 0;
    for (const t of txns.items) {
      if (t.direction === 'OUT') totalPaid += Math.abs(t.amount);
      else totalReceived += t.amount;
    }

    let totalInvoice = 0;
    let validInvoiceCount = 0;
    for (const inv of invs.items) {
      if (inv.status === '正常' && inv.isPositive === '是') {
        totalInvoice += inv.total;
        validInvoiceCount++;
      }
    }

    success(res, {
      counterpart,
      bankFlow: {
        items: txns.items.slice(0, 50),
        totalPaid,
        totalReceived,
        netPaid: totalPaid - totalReceived,
        txnCount: txns.total,
      },
      invoices: {
        items: invs.items.slice(0, 50),
        totalInvoice,
        validInvoiceCount,
        totalRecords: invs.total,
      },
      gap: totalPaid - totalReceived - totalInvoice,
    });
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
  getInvoicesBySeller,
  listBatches,
  getReconciliation,
  getFullReconciliation,
  getIncomingSummary,
};
