/**
 * BOSS只能读取明确的业务查询；新增GET默认拒绝，避免生成文件/AI调用伪装成读取。
 * 自身通知/密码例外仍由原Controller使用req.user.id校验，不允许用户管理端点。
 */
const { createError } = require('./errorHandler');
const READ_PATHS = [
  /^\/auth\/me$/,
  /^\/dashboard\/(wps-sync|stats|analytics|trade-workflows|track-product)$/,
  /^\/reports\/business-overview$/,
  /^\/(suppliers|stores|products|sales|containers|inventory|customs-declarations|forex-verifications|tax-refunds)(\/[^/]+)?$/,
  /^\/purchases(\/(?!export$)[^/]+)?$/,
  /^\/purchases\/[^/]+\/(files|invoice-preparation|receipts)$/,
  /^\/purchases\/[^/]+\/receipts\/[^/]+\/inspections$/,
  /^\/purchases\/files\/[^/]+\/download$/,
  /^\/purchases\/price-history\/[^/]+$/,
  /^\/products\/[^/]+\/(suppliers|price-history|price-trend)$/,
  /^\/products\/options\/categories$/,
  /^\/stores\/options\/ports$/,
  /^\/sales\/[^/]+\/(files|packing-list-checks|finance-summary)$/,
  /^\/sales\/files\/[^/]+\/download$/,
  /^\/inventory\/(product|contract)\/[^/]+$/,
  /^\/containers\/[^/]+\/(items(\/summary)?|products|visualization)$/,
  /^\/contracts\/[^/]+\/files$/,
  /^\/files\/[^/]+\/download$/,
  /^\/finance\/(payments|payables|receivables|stats|payment-trends|overdue-receivables|unallocated-payments|receivable-reconciliation|unmatched|contracts-for-match)$/,
  /^\/finance\/statements(\/analytics|\/\d{4}\/\d{1,2})?$/,
  /^\/bank-flow\/(transactions(\/stats)?|invoices(\/stats|\/by-seller)?|batches|reconciliation(\/full)?|incoming-summary)$/,
  /^\/tax-refunds\/workbench$/,
  /^\/hs-codes(\/(search|hsciq-usage|\d+))?$/,
  /^\/system\/(notifications|exchange-rate|ports|categories|customs-brokers)$/,
  /^\/notifications(\/unread-count)?$/,
  /^\/search$/,
];
const SELF_WRITES = [
  ['POST', /^\/auth\/change-password$/],
  ['POST', /^\/notifications\/(read-all|[^/]+\/read)$/],
  ['PUT', /^\/system\/notifications\/[^/]+\/read$/],
];
const enforceBossReadOnly = (req) => {
  if (req.user?.role !== 'BOSS') return;
  const path = String(req.originalUrl || req.url || '').split('?')[0].replace(/^\/api\/v1(?=\/|$)/, '').replace(/\/$/, '') || '/';
  const method = req.method?.toUpperCase();
  const allowed = ['GET', 'HEAD'].includes(method)
    ? READ_PATHS.some((pattern) => pattern.test(path))
    : SELF_WRITES.some(([verb, pattern]) => verb === method && pattern.test(path));
  if (!allowed) throw createError('老板角色仅可查看业务，不能执行此操作', 403);
};
module.exports = { enforceBossReadOnly };
