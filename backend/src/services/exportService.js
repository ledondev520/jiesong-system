/**
 * Input: Prisma客户端、数据库数据
 * Output: CSV/Excel格式的导出数据
 * Pos: 数据导出服务，生成各种格式的导出文件（含销售合同三 Sheet Excel 标准出口模板）
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const ExcelJS = require('exceljs');
const prisma = require('../utils/prisma');
const { calculateTaxSummary } = require('./taxCalculationEngine');

/**
 * 职责：导出数据
 * 思路：根据类型查询数据，转换为CSV格式
 * @param {string} type - 导出类型
 * @param {Object} query - 查询参数
 * @returns {Object} { data, filename, contentType }
 */
const exportData = async (type, query = {}) => {
  switch (type) {
    case 'suppliers':
      return exportSuppliers(query);
    case 'stores':
      return exportStores(query);
    case 'products':
      return exportProducts(query);
    case 'purchases':
      return exportPurchases(query);
    case 'sales':
      return exportSales(query);
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
    row.map(cell => `"${(cell ?? '').toString().replace(/"/g, '""')}"`).join(',')
  );
  return [headerLine, ...dataLines].join('\n');
};

/**
 * 职责：导出供应商数据
 */
const exportSuppliers = async (query) => {
  const suppliers = await prisma.supplier.findMany({
    include: { aliases: true },
    orderBy: { name: 'asc' },
  });
  
  const headers = ['ID', '名称', '简称', '联系人', '电话', '邮箱', '地址', '银行账户', '质量问题', '昵称'];
  const rows = suppliers.map(s => [
    s.id,
    s.name,
    s.shortName || '',
    s.contactName || '',
    s.contactPhone || '',
    s.contactEmail || '',
    s.address || '',
    s.bankAccount || '',
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
const exportPurchases = async (query) => {
  const contracts = await prisma.purchaseContract.findMany({
    include: {
      supplier: true,
      items: { include: { product: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  
  const headers = ['合同号', '供应商', '总金额', '已付金额', '未付金额', '状态', '签订日期', '预计交货', '发票号'];
  const rows = contracts.map(c => [
    c.contractNo,
    c.supplier?.name || '',
    c.totalAmount,
    c.paidAmount,
    c.totalAmount - c.paidAmount,
    c.status,
    c.signedAt ? formatDate(c.signedAt) : '',
    c.expectedDate ? formatDate(c.expectedDate) : '',
    c.invoiceNo || '',
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
const exportSales = async (query) => {
  const contracts = await prisma.salesContract.findMany({
    include: {
      items: { include: { product: true, store: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  
  const headers = ['合同号', '总金额(USD)', '已收金额', '未收金额', '汇率', '状态', '签订日期'];
  const rows = contracts.map(c => [
    c.contractNo,
    c.totalAmount,
    c.receivedAmount,
    c.totalAmount - c.receivedAmount,
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
    p.type === 'PAYABLE' ? '应付' : '应收',
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

/**
 * 职责：为工作表设置统一的标题行样式（加粗、填充背景色）
 * @param {import('exceljs').Worksheet} worksheet - 工作表对象
 */
const applyHeaderStyle = (worksheet) => {
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1F2D3D' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFADC0D8' } },
    };
  });
  headerRow.height = 22;
};

/**
 * 职责：生成单份销售合同的标准出口 Excel（合同信息 + 商品明细 + 装箱清单 + 税务测算）
 * 思路：
 *   1. 查询销售合同及其关联的销售明细（items）与装箱明细（packingItems）
 *   2. Sheet 1 输出合同基本信息（键值对形式）
 *   3. Sheet 2 输出商品明细列表（每行一个明细条目）
 *   4. Sheet 3 输出装箱清单（Packing List）
 *   5. Sheet 4 输出税务测算摘要与逐行退税结果
 *   6. 写入 Buffer 返回，供路由层设置响应头并下载
 * @param {string} contractId - 销售合同 ID
 * @returns {{ buffer: Buffer, filename: string }}
 */
const exportSalesContractExcel = async (contractId) => {
  // 1. 查询合同数据
  const contract = await prisma.salesContract.findUnique({
    where: { id: contractId },
    include: {
      port: true,
      items: {
        include: {
          product: true,
          store: true,
        },
      },
      packingItems: {
        include: {
          product: true,
          store: true,
        },
      },
    },
  });

  if (!contract) {
    throw new Error(`合同不存在: ${contractId}`);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = '捷淞进销存系统';
  workbook.created = new Date();

  // ==================== Sheet 1: 合同基本信息 ====================
  const sheet1 = workbook.addWorksheet('合同信息');
  sheet1.columns = [
    { header: '字段', key: 'field', width: 20 },
    { header: '值', key: 'value', width: 40 },
  ];
  applyHeaderStyle(sheet1);

  const statusLabels = {
    DRAFT: '草稿',
    CONFIRMED: '已确认',
    PACKING: '装柜中',
    SHIPPED: '已发运',
    ARRIVED: '已到达',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
  };

  const infoRows = [
    ['合同编号', contract.contractNo],
    ['签订日期', contract.signedAt ? formatDate(contract.signedAt) : '-'],
    ['合同状态', statusLabels[contract.status] || contract.status],
    ['目的港口', contract.port?.name || '-'],
    ['总金额 (USD)', `$${contract.totalAmount.toFixed(2)}`],
    ['已收金额 (USD)', `$${contract.receivedAmount.toFixed(2)}`],
    ['未收金额 (USD)', `$${(contract.totalAmount - contract.receivedAmount).toFixed(2)}`],
    ['汇率 (USD/CNY)', contract.exchangeRate],
    ['总箱数', contract.totalBoxes || 0],
    ['毛重 (kg)', contract.grossWeight || 0],
    ['净重 (kg)', contract.netWeight || 0],
    ['体积 (CBM)', contract.volume || 0],
    ['发运日期', contract.shippedAt ? formatDate(contract.shippedAt) : '-'],
    ['预计到达', contract.estimatedArrival ? formatDate(contract.estimatedArrival) : '-'],
    ['报关公司', contract.customsBroker || '-'],
    ['是否熏蒸', contract.isFumigated ? '是' : '否'],
    ['是否退税', contract.hasTaxRefund ? '是' : '否'],
    ['备注', contract.note || '-'],
  ];

  infoRows.forEach(([field, value]) => {
    sheet1.addRow({ field, value });
  });

  // ==================== Sheet 2: 商品明细 ====================
  const sheet2 = workbook.addWorksheet('商品明细');
  sheet2.columns = [
    { header: '序号', key: 'index', width: 8 },
    { header: '商品名称', key: 'productName', width: 28 },
    { header: '规格', key: 'specification', width: 20 },
    { header: '数量', key: 'quantity', width: 10 },
    { header: '单位', key: 'unit', width: 8 },
    { header: '成本价 (CNY)', key: 'costPrice', width: 16 },
    { header: '售价 (USD)', key: 'sellingPrice', width: 14 },
    { header: '门店/客户', key: 'store', width: 20 },
    { header: '备注', key: 'note', width: 24 },
  ];
  applyHeaderStyle(sheet2);

  contract.items.forEach((item, idx) => {
    sheet2.addRow({
      index: idx + 1,
      productName: item.product?.customsName || '-',
      specification: item.specification || item.product?.specification || '-',
      quantity: item.quantity,
      unit: item.unit || item.product?.unit || '-',
      costPrice: item.costPrice,
      sellingPrice: item.sellingPrice,
      store: item.store?.name || '-',
      note: item.note || '',
    });
  });

  // 若商品明细为空，补一行说明
  if (contract.items.length === 0) {
    sheet2.addRow({ index: '-', productName: '（暂无商品明细）' });
  }

  // ==================== Sheet 3: 装箱清单（Packing List） ====================
  const sheet3 = workbook.addWorksheet('装箱清单');
  sheet3.columns = [
    { header: '序号', key: 'index', width: 8 },
    { header: '货柜号 / 合同号', key: 'containerNo', width: 22 },
    { header: '商品名称', key: 'productName', width: 28 },
    { header: '箱数', key: 'boxes', width: 10 },
    { header: '数量', key: 'quantity', width: 10 },
    { header: '单位', key: 'unit', width: 8 },
    { header: '单价 (USD)', key: 'unitPrice', width: 14 },
    { header: '总价 (USD)', key: 'totalPrice', width: 14 },
    { header: '毛重 (kg)', key: 'grossWeight', width: 12 },
    { header: '净重 (kg)', key: 'netWeight', width: 12 },
    { header: '体积 (CBM)', key: 'volume', width: 12 },
    { header: '门店/客户', key: 'store', width: 20 },
    { header: '备注', key: 'note', width: 20 },
  ];
  applyHeaderStyle(sheet3);

  contract.packingItems.forEach((item, idx) => {
    sheet3.addRow({
      index: idx + 1,
      containerNo: contract.contractNo,
      productName: item.product?.customsName || '-',
      boxes: item.boxes || 0,
      quantity: item.quantity,
      unit: item.unit || item.product?.unit || '-',
      unitPrice: item.unitPrice ?? '-',
      totalPrice: item.totalPrice ?? '-',
      grossWeight: item.grossWeight ?? '-',
      netWeight: item.netWeight ?? '-',
      volume: item.volume ?? '-',
      store: item.store?.name || '-',
      note: item.note || '',
    });
  });

  // 若装箱明细为空，补一行说明
  if (contract.packingItems.length === 0) {
    sheet3.addRow({ index: '-', containerNo: contract.contractNo, productName: '（暂无装箱明细）' });
  }

  // ==================== Sheet 4: 税务测算 ====================
  const taxResult = calculateTaxSummary(contract);
  const sheet4 = workbook.addWorksheet('税务测算');
  sheet4.columns = [
    { header: '字段/商品', key: 'field', width: 22 },
    { header: '值/HS编码', key: 'value', width: 18 },
    { header: '退税额(CNY)', key: 'refund', width: 14 },
    { header: '不可退税额(CNY)', key: 'nonRefund', width: 16 },
    { header: '说明', key: 'description', width: 30 },
  ];
  applyHeaderStyle(sheet4);

  [
    ['合同编号', contract.contractNo, '', '', '税务测算基于当前销售明细/装箱明细'],
    ['汇率', taxResult.summary.exchangeRate, '', '', 'USD -> CNY'],
    ['销售金额(USD)', taxResult.summary.totalSalesUsd, '', '', '按明细汇总'],
    ['销售金额(CNY)', taxResult.summary.totalSalesCny, '', '', '按汇率折算'],
    ['预计退税额(CNY)', taxResult.summary.totalRefundAmountCny, '', '', '按 HS 规则估算'],
    ['不可退税额(CNY)', taxResult.summary.totalNonRefundableTaxCny, '', '', '税负差额'],
    ['待确认行数', taxResult.summary.fallbackLineCount, '', '', '未匹配税则需人工复核'],
  ].forEach(([field, value, refund, nonRefund, description]) => {
    sheet4.addRow({ field, value, refund, nonRefund, description });
  });

  if (!taxResult.lines.length) {
    sheet4.addRow({
      field: '（暂无可测算明细）',
      value: '-',
      refund: 0,
      nonRefund: 0,
      description: '请先补充销售明细或装箱明细',
    });
  } else {
    taxResult.lines.forEach((line) => {
      sheet4.addRow({
        field: line.productName,
        value: line.hsCode || '-',
        refund: line.estimatedRefundCny,
        nonRefund: line.nonRefundableTaxCny,
        description: `${line.hsDescription} / 退税率${line.refundRate}% / ${line.matchType}`,
      });
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${contract.contractNo}_出口模板_${formatDate()}.xlsx`;
  return { buffer, filename };
};

module.exports = {
  exportData,
  exportSalesContractExcel,
};
