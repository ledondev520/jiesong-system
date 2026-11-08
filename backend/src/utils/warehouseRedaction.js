/**
 * Input: 登录角色与任意响应数据
 * Output: WAREHOUSE 看不到供应商发票号和金额类字段的数据副本（其他角色原样返回）
 * Pos: OD-2/OD-3 的唯一 WAREHOUSE 红线 helper，采购/销售/AI 面共用，服务端剥离，不依赖前端隐藏
 */

// 金额类：合同总额/已付/明细单价与行额/付款额/催票金额/历史价/库存成本/应付汇总
const MONEY_KEYS = new Set([
  'totalAmount', 'paidAmount', 'unpaidAmount', 'receivedAmount', 'unitPrice', 'totalPrice', 'netUnitPrice', 'netAmount',
  'taxAmount', 'grossAmount', 'amount', 'averagePrice', 'minPrice', 'maxPrice', 'lastPrice', 'price', 'totalCost',
  'totalPayable', 'overduePayable', 'totalReceivable',
]);

const isPlain = (node) => node && typeof node === 'object' && !(node instanceof Date) && !Buffer.isBuffer(node);

const countInvoices = (value) => (Array.isArray(value) ? value : String(value ?? '').split(/[\s,，;；]+/)).filter(Boolean).length;

const walk = (node) => {
  if (Array.isArray(node)) return node.map(walk);
  if (!isPlain(node)) return node;
  const copy = {};
  // OD-6：库存快照行（totalCost 与 averageCost 成对出现）的成本对 WAREHOUSE 保持可见；其他 totalCost 仍剥离
  const inventoryCost = 'totalCost' in node && 'averageCost' in node;
  Object.keys(node).forEach((key) => {
    if (MONEY_KEYS.has(key) && !(inventoryCost && key === 'totalCost')) return;
    if (key === 'invoiceNo') { copy.invoiceCount = countInvoices(node[key]); return; }
    if (key === 'invoiceNumbers') { copy.invoiceNumberCount = countInvoices(node[key]); return; }
    // 付款记录只保留条数/编号，金额不外泄；"已付过款"用布尔状态代替 paidAmount
    if (key === 'payments' && Array.isArray(node[key])) { copy[key] = node[key].map((p) => ({ id: p?.id })); return; }
    copy[key] = walk(node[key]);
  });
  if ('paidAmount' in node) copy.hasPaidAmount = Number(node.paidAmount) > 0;
  // OVERPAID 等 issue 文案内嵌金额：只留代码，文案改为通用说明
  if (copy.code === 'OVERPAID' && typeof copy.message === 'string') copy.message = '付款金额异常，请联系采购或财务核对';
  return copy;
};

const redactWarehouseMoney = (role, data) => (role === 'WAREHOUSE' ? walk(data) : data);

/** Express 中间件：在 res.json 处统一剥离；req.user 由各路由器自己的 authenticate 稍后写入，故按需读取。 */
const warehouseMoneyRedaction = (req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => json(redactWarehouseMoney(req.user?.role, body));
  next();
};

// P2-B：装箱明细的供应商发票号与采购成本（CNY）属同一数据类；销售面不挂 key 中间件，以免剥掉 OD-6 保留的 USD 行价。
const PACKING_SECRET_KEYS = ['invoiceNo', 'purchaseCost'];
const stripPacking = (node) => {
  if (Array.isArray(node)) return node.map(stripPacking);
  if (!isPlain(node)) return node;
  const copy = {};
  Object.keys(node).forEach((key) => { if (!PACKING_SECRET_KEYS.includes(key)) copy[key] = stripPacking(node[key]); });
  return copy;
};
const redactPackingSecrets = (role, data) => (role === 'WAREHOUSE' ? stripPacking(data) : data);

// OD-3/OD-7：销售合同行（读与写响应共用）对 WAREHOUSE 只留状态，去掉合同总额、已收金额与收款记录。
const redactSalesContract = (role, contract) => {
  if (role !== 'WAREHOUSE' || !contract || typeof contract !== 'object') return contract;
  const { totalAmount, receivedAmount, payments, ...rest } = contract;
  return stripPacking(rest);
};

module.exports = { MONEY_KEYS, redactWarehouseMoney, redactPackingSecrets, redactSalesContract, warehouseMoneyRedaction };
