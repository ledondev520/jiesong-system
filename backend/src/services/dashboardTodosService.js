/**
 * Input: 登录角色（ROLES）、Prisma；应付统一取 payablesService
 * Output: 首页待办：每个列表的总数 + 前 5 条；BOSS 另有应收/应付/本月毛利三个数字
 * Pos: GET /dashboard/todos 的只读聚合（规格 §4.9）；不写库，只算当前角色可见的列表
 *
 * 口径说明（当前库结构下的最小可靠定义）：
 *   ordersToPurchase  已确认订单中，至少一条订单行尚无库存/采购分配记录（SalesItem 无 Inventory）
 *   paymentsDue       已生效采购合同应付>0（payablesService 同一口径，草稿不计）
 *   receiptsToInspect 采购合同已发货、尚未收货
 *   toLoad / toShip   出口合同 CONFIRMED（待装柜）/ PACKING（待发运）
 *   missingInvoice    货已出（SHIPPED/RECEIVED/COMPLETED）但未登记发票号的采购合同（同催票提醒）
 *   overdueReceivables 沿用 financeService.getOverdueReceivables
 *   refundable        退税单 DRAFT 且单证匹配 passed
 *   报价待发送/待客户确认：Quote 表由数据模型 B2 迁移引入，当前库尚无，随 B2 合入后再加。
 */
const prisma = require('../utils/prisma');
const { ROLES, PURCHASE_STATUS, SALES_STATUS } = require('../config/constants');
const { PAYABLE_SELECT, payableWhere, outstandingOf, getPayablesSummary } = require('./payablesService');

const TOP = 5;
const { ADMIN, BOSS, PURCHASE, SALES, FINANCE, WAREHOUSE } = ROLES;

const item = (id, contractNo, party, amount, date) => ({
  id, contractNo, party: party ?? null, amount: amount ?? null, date: date ?? null,
});
const asList = (count, rows) => ({ count, items: rows.slice(0, TOP) });
const byDateAsc = (a, b) => (a.date ? new Date(a.date).getTime() : Infinity) - (b.date ? new Date(b.date).getTime() : Infinity);

const LISTS = {
  ordersToPurchase: {
    label: '订单待采购', roles: [PURCHASE, ADMIN],
    async load(db) {
      const where = { status: SALES_STATUS.CONFIRMED, items: { some: { inventories: { none: {} } } } };
      const [count, rows] = await Promise.all([
        db.salesContract.count({ where }),
        db.salesContract.findMany({ where, take: TOP, orderBy: { createdAt: 'asc' }, select: { id: true, contractNo: true, totalAmount: true, signedAt: true } }),
      ]);
      return asList(count, rows.map((r) => item(r.id, r.contractNo, null, r.totalAmount, r.signedAt)));
    },
  },
  paymentsDue: {
    label: '待付款', roles: [FINANCE, PURCHASE, ADMIN],
    async load(db) {
      const rows = (await db.purchaseContract.findMany({
        where: payableWhere(),
        select: { ...PAYABLE_SELECT, contractNo: true, supplier: { select: { name: true } } },
      }))
        .map((r) => ({ ...r, outstanding: outstandingOf(r) }))
        .filter((r) => r.outstanding > 0);
      const mapped = rows.map((r) => item(r.id, r.contractNo, r.supplier?.name, r.outstanding, r.expectedDate)).sort(byDateAsc);
      return asList(mapped.length, mapped);
    },
  },
  receiptsToInspect: {
    label: '待收货验货', roles: [WAREHOUSE, PURCHASE, ADMIN],
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
  toLoad: { label: '待装柜', roles: [WAREHOUSE, SALES, ADMIN], load: (db) => salesByStatus(db, SALES_STATUS.CONFIRMED) },
  toShip: { label: '待发运', roles: [WAREHOUSE, SALES, ADMIN], load: (db) => salesByStatus(db, SALES_STATUS.PACKING) },
  missingInvoice: {
    label: '缺进项发票', roles: [FINANCE, ADMIN],
    async load(db) {
      const rows = (await db.purchaseContract.findMany({
        where: { status: { in: [PURCHASE_STATUS.SHIPPED, PURCHASE_STATUS.RECEIVED, PURCHASE_STATUS.COMPLETED] } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, contractNo: true, invoiceNo: true, totalAmount: true, supplier: { select: { name: true } } },
      })).filter((r) => !String(r.invoiceNo || '').trim());
      return asList(rows.length, rows.map((r) => item(r.id, r.contractNo, r.supplier?.name, r.totalAmount, null)));
    },
  },
  overdueReceivables: {
    label: '逾期未收款', roles: [FINANCE, SALES, BOSS, ADMIN],
    async load() {
      const { getOverdueReceivables } = require('./financeService');
      const rows = await getOverdueReceivables();
      return asList(rows.length, rows.map((r) => item(r.id, r.contractNo, null, Number((r.totalAmount - r.receivedAmount).toFixed(2)), r.shippedAt)));
    },
  },
  refundable: {
    label: '可申报退税', roles: [FINANCE, ADMIN],
    async load(db) {
      const where = { status: 'DRAFT', match_status: 'passed' };
      const [count, rows] = await Promise.all([
        db.taxRefund.count({ where }),
        db.taxRefund.findMany({
          where, take: TOP, orderBy: { createdAt: 'asc' },
          select: { id: true, refundNo: true, refundableAmount: true, createdAt: true },
        }),
      ]);
      return asList(count, rows.map((r) => item(r.id, r.refundNo, null, r.refundableAmount, r.createdAt)));
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

/** BOSS 的三个数字；应付走共享函数，毛利复用经营概览同一计算（本月 = 上海自然月至今发运）。 */
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
      receivable: '未取消出口合同的应收减已收（美元口径以财务概览为准）',
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
  return { role, lists, ...(role === BOSS ? { figures: await loadBossFigures(db, now) } : {}) };
}

module.exports = { getDashboardTodos, LISTS };
