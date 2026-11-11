/**
 * Input: 登录角色（ROLES）、Prisma；应付统一取 payablesService
 * Output: 首页待办：每个列表的总数 + 前 5 条；ADMIN 另有应收/应付/本月毛利三个数字（OD-8 前属 BOSS）
 * Pos: GET /dashboard/todos 的只读聚合（规格 §4.9）；不写库，只算当前角色可见的列表
 *
 * 口径说明（当前库结构下的最小可靠定义）：
 *   ordersToPurchase  已确认订单中，至少一条订单行未被覆盖：既无未取消采购单行（同订单、商品+门店，与「生成采购单」重复规则一致），
 *                     库存分配到该行的数量也不足订单行数量（全额库存分配视为已覆盖；部分分配仍待采购）
 *   paymentsDue       已生效采购合同应付>0（payablesService 同一口径，草稿不计）
 *   receiptsToInspect 采购合同已发货、尚未收货
 *   toLoad / toShip   出口合同 CONFIRMED（待装柜）/ PACKING（待发运）
 *   missingInvoice    货已出（SHIPPED/RECEIVED/COMPLETED）、未登记发票号且没有有效的已关联（MATCHED/PURCHASE，正常且非红冲）发票记录的采购合同
 *   overdueReceivables 沿用 financeService.getOverdueReceivables
 *   paymentsDue / missingInvoice 仅首页口径：只计 signedAt 不早于 DASHBOARD_TODO_CUTOFF 的合同（signedAt 为空视为当前，不隐藏），
 *                     更早的历史合同只给出 historical.count；不写库，应付页面（payablesService）口径不变
 *   refundable        退税工作台（上海当月申报月份）里材料核验通过的出口；pending 为工作台「待处理出口」总数，两个数字都取自工作台同一次汇总
 *   quotesToSend      报价 DRAFT（待发送）；quotesAwaitingCustomer 报价 SENT（待客户确认）；仅 SALES/ADMIN
 */
const prisma = require('../utils/prisma');
const { ROLES, PURCHASE_STATUS, SALES_STATUS } = require('../config/constants');
const { PAYABLE_SELECT, payableWhere, outstandingOf, getPayablesSummary } = require('./payablesService');
const { findInvoicedPurchaseContractIds } = require('./invoiceRecordService');
const { roundMoney } = require('../utils/money');
const { isStockCovered } = require('../utils/stockAllocation');

const TOP = 5;
// 决策 A（BL-1d）：首页「待付款/缺进项发票」只计该日期及之后签约的合同；改日期改这一处和 CUTOFF_LABEL。
// 合同日期按北京时间零点存储，故截止点取北京零点（UTC 前一日 16:00）。
const DASHBOARD_TODO_CUTOFF = new Date('2026-01-01T00:00:00+08:00');
const CUTOFF_LABEL = '2026-01-01'; // toISOString 会给出 UTC 日期（12-31），所以单独写死展示用日期
const isCurrent = (r) => !r.signedAt || r.signedAt >= DASHBOARD_TODO_CUTOFF;
// 把候选拆成「计入」与「历史未计入」，历史只返回条数和截止日期，让首页能链到完整列表。
const withHistorical = (rows, build) => {
  const current = rows.filter(isCurrent);
  return {
    ...asList(current.length, build(current)),
    historical: { count: rows.length - current.length, before: CUTOFF_LABEL },
  };
};
// shortcut: CONFIRMED orders are scanned oldest-first up to this cap (count undercounts beyond it); upgrade to SQL NOT EXISTS if volumes reach it.
const CONFIRMED_SCAN_CAP = 500;
const { ADMIN, SALES } = ROLES;

const item = (id, contractNo, party, amount, date) => ({
  id, contractNo, party: party ?? null, amount: amount ?? null, date: date ?? null,
});
const asList = (count, rows) => ({ count, items: rows.slice(0, TOP) });
const byDateAsc = (a, b) => (a.date ? new Date(a.date).getTime() : Infinity) - (b.date ? new Date(b.date).getTime() : Infinity);

const quotesByStatus = (status, dateField) => async (db) => {
  const where = { status };
  const [count, rows] = await Promise.all([
    db.quote.count({ where }),
    db.quote.findMany({
      where, take: TOP, orderBy: { [dateField]: 'asc' }, // list order = the date shown (SENT by sentAt)
      select: { id: true, quoteNo: true, totalAmount: true, createdAt: true, sentAt: true, customer: { select: { name: true } } },
    }),
  ]);
  return asList(count, rows.map((r) => item(r.id, r.quoteNo, r.customer?.name, r.totalAmount, r[dateField])));
};

const LISTS = {
  ordersToPurchase: {
    label: '订单待采购', roles: [SALES, ADMIN],
    async load(db) {
      const orders = await db.salesContract.findMany({
        where: { status: SALES_STATUS.CONFIRMED }, orderBy: { createdAt: 'asc' }, take: CONFIRMED_SCAN_CAP,
        select: { id: true, contractNo: true, totalAmount: true, signedAt: true, items: { select: { productId: true, storeId: true, quantity: true, inventories: { select: { quantity: true } } } } },
      });
      const purchased = await db.purchaseItem.findMany({
        where: { purchaseContract: { salesContractId: { in: orders.map((o) => o.id) }, status: { not: PURCHASE_STATUS.CANCELLED } } },
        select: { productId: true, storeId: true, purchaseContract: { select: { salesContractId: true } } },
      });
      const covered = new Set(purchased.map((p) => `${p.purchaseContract.salesContractId}/${p.productId}/${p.storeId}`));
      // shortcut: list shows the whole order, not the uncovered remainder per line; upgrade if purchasers need remaining quantities.
      const rows = orders.filter((o) => o.items.some((i) => !covered.has(`${o.id}/${i.productId}/${i.storeId}`) && !isStockCovered(i)));
      return asList(rows.length, rows.map((r) => item(r.id, r.contractNo, null, r.totalAmount, r.signedAt)));
    },
  },
  quotesToSend: { label: '报价待发送', roles: [SALES, ADMIN], load: quotesByStatus('DRAFT', 'createdAt') },
  quotesAwaitingCustomer: { label: '报价待客户确认', roles: [SALES, ADMIN], load: quotesByStatus('SENT', 'sentAt') },
  paymentsDue: {
    label: '待付款', roles: [ADMIN],
    async load(db) {
      const rows = (await db.purchaseContract.findMany({
        where: payableWhere(),
        select: { ...PAYABLE_SELECT, contractNo: true, signedAt: true, supplier: { select: { name: true } } },
      }))
        .map((r) => ({ ...r, outstanding: outstandingOf(r) }))
        .filter((r) => r.outstanding > 0);
      return withHistorical(rows, (list) => list.map((r) => item(r.id, r.contractNo, r.supplier?.name, r.outstanding, r.expectedDate)).sort(byDateAsc));
    },
  },
  receiptsToInspect: {
    label: '待收货验货', roles: [SALES, ADMIN],
    async load(db) {
      const where = { status: PURCHASE_STATUS.SHIPPED };
      const [count, rows] = await Promise.all([
        db.purchaseContract.count({ where }),
        db.purchaseContract.findMany({
          where, take: TOP, orderBy: [{ expectedDate: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, contractNo: true, totalAmount: true, expectedDate: true, supplier: { select: { name: true } } },
        }),
      ]);
      return asList(count, rows.map((r) => item(r.id, r.contractNo, r.supplier?.name, r.totalAmount, r.expectedDate)));
    },
  },
  toLoad: { label: '待装柜', roles: [SALES, ADMIN], load: (db) => salesByStatus(db, SALES_STATUS.CONFIRMED) },
  toShip: { label: '待发运', roles: [SALES, ADMIN], load: (db) => salesByStatus(db, SALES_STATUS.PACKING) },
  missingInvoice: {
    label: '缺进项发票', roles: [ADMIN],
    async load(db) {
      const candidates = (await db.purchaseContract.findMany({
        where: { status: { in: [PURCHASE_STATUS.SHIPPED, PURCHASE_STATUS.RECEIVED, PURCHASE_STATUS.COMPLETED] } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, contractNo: true, invoiceNo: true, totalAmount: true, signedAt: true, supplier: { select: { name: true } } },
      })).filter((r) => !String(r.invoiceNo || '').trim());
      // 发票关联引擎已把有效发票记录对上合同时，同样算已开票（invoiceNo 只在手工登记时才有）。
      const matched = await findInvoicedPurchaseContractIds(db, candidates.map((r) => r.id));
      const rows = candidates.filter((r) => !matched.has(r.id));
      return withHistorical(rows, (list) => list.map((r) => item(r.id, r.contractNo, r.supplier?.name, r.totalAmount, null)));
    },
  },
  overdueReceivables: {
    label: '逾期未收款', roles: [ADMIN],
    async load() {
      const { getOverdueReceivables } = require('./financeService');
      const rows = await getOverdueReceivables();
      return asList(rows.length, rows.map((r) => item(r.id, r.contractNo, null, r.unreceived, r.shippedAt)));
    },
  },
  refundable: {
    label: '可申报退税', roles: [ADMIN],
    async load(db, now) {
      // 与退税工作台同源：同一服务、同一申报月份（上海当月，页面默认值）。count = 材料核验通过的出口，pending = 工作台「待处理出口」。
      // shortcut: 每次打开首页都会跑一遍工作台汇总（含发票核验）；慢了就缓存或拆出只数不核验的汇总。
      const { getTaxRefundWorkbench } = require('./taxRefundWorkbenchService');
      const filingMonth = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 7);
      const workbench = await getTaxRefundWorkbench({ filingMonth, pageSize: 100 }, db);
      const ready = workbench.items.filter((r) => r.materialReady);
      return {
        ...asList(workbench.summary.materialReadyCount, ready.map((r) => item(r.salesContractId, r.contractNo, null, null, r.shippedAt))),
        pending: { count: workbench.summary.contracts, label: '待处理出口' },
      };
    },
  },
};

async function salesByStatus(db, status) {
  const [count, rows] = await Promise.all([
    db.salesContract.count({ where: { status } }),
    db.salesContract.findMany({
      where: { status }, take: TOP, orderBy: { createdAt: 'asc' },
      select: { id: true, contractNo: true, totalAmount: true, estimatedArrival: true },
    }),
  ]);
  return asList(count, rows.map((r) => item(r.id, r.contractNo, null, r.totalAmount, r.estimatedArrival)));
}

/** ADMIN 的三个数字（OD-8 前属 BOSS）；应付走共享函数，毛利复用经营概览同一计算（本月 = 上海自然月至今发运）。 */
async function loadBossFigures(db, now) {
  const { getStats } = require('./financeService');
  const { getBusinessOverview } = require('../controllers/dashboardController');
  const day = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  // shortcut: 通过控制器取毛利以免复制口径；经营概览拆出纯函数后改为直接调用。
  let overview = null;
  await getBusinessOverview(
    { query: { startDate: `${day.slice(0, 8)}01`, endDate: day } },
    { status() { return this; }, json(body) { overview = body?.data; } },
    (error) => { throw error; },
  );
  const [stats, payables] = await Promise.all([getStats(), getPayablesSummary(db, now)]);
  return {
    receivable: stats.receivable.unreceived,
    payable: payables.unpaid,
    monthGrossProfit: overview?.overview?.grossProfit ?? null,
    definitions: {
      receivable: '未取消出口合同的应收减已收（美元，与财务概览同一函数）',
      payable: '已生效采购合同未付余额，草稿/已取消不计',
      monthGrossProfit: '上海自然月内已发运自有商品的预计毛利（人民币），资料不全时为空',
    },
  };
}

async function getDashboardTodos(role, { db = prisma, now = new Date() } = {}) {
  const visible = Object.entries(LISTS).filter(([, def]) => def.roles.includes(role));
  const lists = {};
  await Promise.all(visible.map(async ([key, def]) => {
    lists[key] = { label: def.label, ...(await def.load(db, now)) };
  }));
  return { role, lists, ...(role === ADMIN ? { figures: await loadBossFigures(db, now) } : {}) };
}

module.exports = { getDashboardTodos, LISTS, DASHBOARD_TODO_CUTOFF };
