/**
 * Input: Prisma客户端、数据库数据
 * Output: 带 UTF-8 BOM 的 CSV 导出数据（收付款 CSV 类型沿用既有财务应付分组）
 * Pos: 数据导出服务；出口单证（合同/发票/装箱单/报关预录）只由 exportPacketService 生成
 */

const { withUtf8Bom, csvSafeText } = require('../utils/csvExport');
const prisma = require('../utils/prisma');
const { outstandingOf } = require('./payablesService');
const { getOwnedReceivableUsd, getEffectiveSalesReceived, getOutstandingReceivableUsd, SALES_OWNED_AMOUNT_SELECT } = require('./salesContractAmount');

/**
 * 职责：导出数据
 * 思路：根据类型查询数据，转换为CSV格式
 * @param {string} type - 导出类型
 * @param {Object} query - 查询参数
 * @returns {Object} { data, filename, contentType }
 */
const exportData = async (type, query = {}, { includeBank = false, includeMoney = false } = {}) => {
  switch (type) {
    case 'suppliers':
      return exportSuppliers(query, includeBank);
    case 'stores':
      return exportStores(query);
    case 'products':
      return exportProducts(query);
    case 'purchases':
      return exportPurchases(query, includeMoney);
    case 'sales':
      return exportSales(query, includeMoney);
    case 'containers':
      return exportContainers(query);
    case 'inventory':
      return exportInventory(query);
    case 'payments':
      return exportPayments(query);
    default:
      throw new Error(`不支持的导出类型: ${type}`);
  }
};

/**
 * 职责：将数据转换为CSV格式
 * @param {Array} headers - 表头
 * @param {Array} rows - 数据行
 * @returns {string} CSV内容
 */
const toCSV = (headers, rows) => {
  const headerLine = headers.map(h => `"${h}"`).join(',');
  const dataLines = rows.map(row => 
    row.map(cell => `"${csvSafeText(cell).replace(/"/g, '""')}"`).join(',')
  );
  return withUtf8Bom([headerLine, ...dataLines].join('\n'));
};

/**
 * 职责：导出供应商数据
 */
const exportSuppliers = async (query, includeBank = false) => {
  const suppliers = await prisma.supplier.findMany({
    include: { aliases: true },
    orderBy: { name: 'asc' },
  });
  
  const headers = ['ID', '名称', '简称', '联系人', '电话', '邮箱', '地址', ...(includeBank ? ['银行账户'] : []), '质量问题', '昵称'];
  const rows = suppliers.map(s => [
    s.id,
    s.name,
    s.shortName || '',
    s.contactName || '',
    s.contactPhone || '',
    s.contactEmail || '',
    s.address || '',
    ...(includeBank ? [s.bankAccount || ''] : []),
    s.hasQualityIssue ? '是' : '否',
    s.aliases.map(a => a.alias).join('; '),
  ]);
  
  return {
    data: toCSV(headers, rows),
    filename: `suppliers_${formatDate()}.csv`,
    contentType: 'text/csv; charset=utf-8',
  };
};

/**
 * 职责：导出门店数据
 */
const exportStores = async (query) => {
  const stores = await prisma.store.findMany({
    include: { port: true },
    orderBy: { name: 'asc' },
  });
  
  const headers = ['ID', '名称', '港口', '联系人', '电话', '邮箱', '地址'];
  const rows = stores.map(s => [
    s.id,
    s.name,
    s.port?.name || '',
    s.contactName || '',
    s.contactPhone || '',
    s.contactEmail || '',
    s.address || '',
  ]);
  
  return {
    data: toCSV(headers, rows),
    filename: `stores_${formatDate()}.csv`,
    contentType: 'text/csv; charset=utf-8',
  };
};

/**
 * 职责：导出商品数据
 */
const exportProducts = async (query) => {
  const products = await prisma.product.findMany({
    include: { category: true },
    orderBy: { customsName: 'asc' },
  });
  
  const headers = ['ID', '报关名', '描述', '规格', '单位', '分类'];
  const rows = products.map(p => [
    p.id,
    p.customsName,
    p.description || '',
    p.specification || '',
    p.unit || '',
    p.category?.name || '',
  ]);
  
  return {
    data: toCSV(headers, rows),
    filename: `products_${formatDate()}.csv`,
    contentType: 'text/csv; charset=utf-8',
  };
};

/**
 * 职责：导出采购合同数据
 */
const exportPurchases = async (query, includeMoney = false) => {
  const contracts = await prisma.purchaseContract.findMany({
    include: {
      supplier: true,
      items: { include: { product: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  
  // OD-2/OD-3：WAREHOUSE 无金额与发票号列（includeMoney=false），状态等保留
  const headers = ['合同号', '供应商', ...(includeMoney ? ['总金额', '已付金额', '未付金额'] : []), '状态', '签订日期', '预计交货', ...(includeMoney ? ['发票号'] : [])];
  const rows = contracts.map(c => [
    c.contractNo,
    c.supplier?.name || '',
    ...(includeMoney ? [c.totalAmount, c.paidAmount, outstandingOf(c)] : []), // 与付款列表同口径：草稿/已取消为 0
    c.status,
    c.signedAt ? formatDate(c.signedAt) : '',
    c.expectedDate ? formatDate(c.expectedDate) : '',
    ...(includeMoney ? [c.invoiceNo || ''] : []),
  ]);
  
  return {
    data: toCSV(headers, rows),
    filename: `purchases_${formatDate()}.csv`,
    contentType: 'text/csv; charset=utf-8',
  };
};

/**
 * 职责：导出出口合同数据
 */
// OD-3：WAREHOUSE 只看状态，不含合同总额/收款金额（includeMoney=false）。
const exportSales = async (query, includeMoney = false) => {
  const contracts = await prisma.salesContract.findMany({
    include: {
      items: { include: { product: true, store: true } },
      packingItems: SALES_OWNED_AMOUNT_SELECT.packingItems, // B87 口径需要装箱归属
    },
    orderBy: { createdAt: 'desc' },
  });
  
  const headers = ['合同号', ...(includeMoney ? ['总金额(USD)', '已收金额', '未收金额'] : []), '汇率', '状态', '签订日期'];
  const rows = contracts.map(c => [
    c.contractNo,
    ...(includeMoney ? [getOwnedReceivableUsd(c), getEffectiveSalesReceived(c), getOutstandingReceivableUsd(c)] : []),
    c.exchangeRate,
    c.status,
    c.signedAt ? formatDate(c.signedAt) : '',
  ]);
  
  return {
    data: toCSV(headers, rows),
    filename: `sales_${formatDate()}.csv`,
    contentType: 'text/csv; charset=utf-8',
  };
};

/**
 * 职责：导出货柜数据
 */
const exportContainers = async (query) => {
  const containers = await prisma.salesContract.findMany({
    include: {
      port: true,
      packingItems: { include: { product: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  
  const headers = ['货柜编号', '港口', '状态', '总箱数', '毛重', '净重', '体积', '发运日期', '预计到达', '报关公司', '是否熏蒸', '是否退税'];
  const rows = containers.map(c => [
    c.contractNo,
    c.port?.name || '',
    c.status,
    c.totalBoxes,
    c.grossWeight,
    c.netWeight,
    c.volume,
    c.shippedAt ? formatDate(c.shippedAt) : '',
    c.estimatedArrival ? formatDate(c.estimatedArrival) : '',
    c.customsBroker || '',
    c.isFumigated ? '是' : '否',
    c.hasTaxRefund ? '是' : '否',
  ]);
  
  return {
    data: toCSV(headers, rows),
    filename: `containers_${formatDate()}.csv`,
    contentType: 'text/csv; charset=utf-8',
  };
};

/**
 * 职责：导出库存数据
 */
const exportInventory = async (query) => {
  const inventories = await prisma.inventory.findMany({
    include: {
      product: true,
      salesContract: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  
  const headers = ['ID', '商品', '数量', '单位', '状态', '货柜', '入库时间', '出库时间'];
  const rows = inventories.map(inv => [
    inv.id,
    inv.product?.customsName || '',
    inv.quantity,
    inv.unit || '',
    inv.status,
    inv.salesContract?.contractNo || '',
    inv.inboundAt ? formatDate(inv.inboundAt) : '',
    inv.outboundAt ? formatDate(inv.outboundAt) : '',
  ]);
  
  return {
    data: toCSV(headers, rows),
    filename: `inventory_${formatDate()}.csv`,
    contentType: 'text/csv; charset=utf-8',
  };
};

/**
 * 职责：导出付款记录
 */
const exportPayments = async (query) => {
  const payments = await prisma.payment.findMany({
    include: {
      purchaseContract: { include: { supplier: true } },
      salesContract: true,
    },
    orderBy: { paymentDate: 'desc' },
  });
  
  const headers = ['ID', '类型', '金额', '币种', '付款方式', '付款日期', '关联合同', '备注'];
  const rows = payments.map(p => [
    p.id,
    // 与 financeService 的既有 PAYABLE_FLOW_TYPES 一致，只转换导出标签。
    ['PAYABLE', 'PAYABLE_PAYMENT', 'EXPENSE'].includes(p.type) ? '应付' : '应收',
    p.amount,
    p.currency,
    p.paymentMethod || '',
    formatDate(p.paymentDate),
    p.purchaseContract?.contractNo || p.salesContract?.contractNo || '',
    p.note || '',
  ]);
  
  return {
    data: toCSV(headers, rows),
    filename: `payments_${formatDate()}.csv`,
    contentType: 'text/csv; charset=utf-8',
  };
};

/**
 * 职责：格式化日期
 * @param {Date} date - 日期对象
 * @returns {string} 格式化的日期字符串
 */
const formatDate = (date) => {
  const d = date ? new Date(date) : new Date();
  return d.toISOString().slice(0, 10);
};

module.exports = {
  exportData,
  toCSV,
};
