/**
 * Input: 出口合同 ID、报关单数据
 * Output: 一键生成三张表（报关单、外汇核销单、出口退税单）及 Excel 导出
 * Pos: 出口退税模块服务层，负责三表联动生成
 */

const ExcelJS = require('exceljs');
const prisma = require('../utils/prisma');
const { buildWhere } = require('./customsDeclarationService');
const { createError } = require('../middleware/errorHandler');

/**
 * 生成报关单
 * @param {Object} params
 * @param {string} params.salesContractId - 出口合同 ID
 * @param {Array} params.items - 商品明细列表
 * @param {Object} params.extraData - 额外数据（发货人、收货人等）
 */
const generateCustomsDeclaration = async ({ salesContractId, items, extraData = {} }) => {
  const tx = await prisma.$transaction(async (tx) => {
    // 获取出口合同详情
    const contract = await tx.salesContract.findUnique({
      where: { id: salesContractId },
      include: {
        packingItems: {
          include: {
            product: true,
          },
        },
        port: true,
      },
    });

    if (!contract) {
      throw new Error('出口合同不存在');
    }

    // 生成报关单号（追加序号避免重复）
    // 思路：查询同合同已有报关单数量，序号从 1 开始递增
    const existingCount = await tx.customsDeclaration.count({ where: { salesContractId } });
    const seq = existingCount > 0 ? `-${existingCount + 1}` : '';
    const declarationNo = `BG${contract.contractNo.slice(2)}${seq}`;

    // 计算总额
    const totalAmount = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

    // 创建报关单（仅写入 schema 中存在的字段）
    const customsDeclaration = await tx.customsDeclaration.create({
      data: {
        declarationNo,
        salesContractId,
        status: 'DRAFT',
        currency: 'USD',
        exchangeRate: contract.exchangeRate || null,
        totalAmount,
        totalQuantity,
        totalNetWeight: contract.netWeight || 0,
        totalGrossWeight: contract.grossWeight || 0,
        note: extraData.note || null,
      },
    });

    // 创建报关单明细
    if (items && items.length > 0) {
      // 过滤掉缺少 productId 的项，避免 FK 约束异常
      const validItems = items.filter((item) => item.productId && typeof item.productId === 'string');
      const customsItems = validItems.map((item, index) => ({
        customsDeclarationId: customsDeclaration.id,
        productId: item.productId,
        packingItemId: item.packingItemId || null,
        itemNo: index + 1,
        customsName: item.productName,
        hsCode: item.hsCode,
        declarationElements: item.declarationElements || '',
        quantity: item.quantity,
        unit: item.unit || '',
        unitPrice: item.unitPrice || 0,
        totalPrice: item.totalPrice || 0,
      }));

      if (customsItems.length > 0) {
        await tx.customsDeclarationItem.createMany({
          data: customsItems,
        });
      }
    }

    return customsDeclaration;
  });

  return tx;
};

/**
 * 生成外汇核销单
 * @param {Object} params
 * @param {string} params.salesContractId - 出口合同 ID
 * @param {string} params.customsDeclarationId - 报关单 ID
 * @param {Object} params.extraData - 额外数据（银行名称等）
 */
const generateForexVerification = async ({ salesContractId, customsDeclarationId, extraData = {} }) => {
  const tx = await prisma.$transaction(async (tx) => {
    // 获取出口合同详情
    const contract = await tx.salesContract.findUnique({
      where: { id: salesContractId },
    });

    if (!contract) {
      throw new Error('出口合同不存在');
    }

    // 获取报关单详情
    const customsDeclaration = await tx.customsDeclaration.findUnique({
      where: { id: customsDeclarationId },
    });

    if (!customsDeclaration) {
      throw new Error('报关单不存在');
    }

    // 生成核销单号（追加序号避免重复）
    const existingForexCount = await tx.forexVerification.count({ where: { salesContractId } });
    const forexSeq = existingForexCount > 0 ? `-${existingForexCount + 1}` : '';
    const verificationNo = `WH${contract.contractNo.slice(2)}${forexSeq}`;

    // 创建外汇核销单
    const forexVerification = await tx.forexVerification.create({
      data: {
        verificationNo,
        salesContractId,
        customsDeclarationId,
        status: 'PENDING',
        bankName: extraData.bankName || '',
        currency: 'USD',
        receivedAmount: contract.totalAmount || 0,
        settledAmount: 0,
        exchangeRate: contract.exchangeRate || 1,
        note: extraData.note || '',
      },
    });

    return forexVerification;
  });

  return tx;
};

/**
 * 生成出口退税单
 * @param {Object} params
 * @param {string} params.salesContractId - 出口合同 ID
 * @param {string} params.customsDeclarationId - 报关单 ID
 * @param {string} params.forexVerificationId - 外汇核销单 ID
 * @param {Array} params.items - 商品明细列表（含 HSCode 和退税率）
 */
const generateTaxRefund = async ({ salesContractId, customsDeclarationId, forexVerificationId, items }) => {
  const tx = await prisma.$transaction(async (tx) => {
    // 获取出口合同详情
    const contract = await tx.salesContract.findUnique({
      where: { id: salesContractId },
      include: {
        packingItems: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!contract) {
      throw new Error('出口合同不存在');
    }

    // 生成退税单号（追加序号避免重复）
    const existingTaxCount = await tx.taxRefund.count({ where: { salesContractId } });
    const taxSeq = existingTaxCount > 0 ? `-${existingTaxCount + 1}` : '';
    const refundNo = `TX${contract.contractNo.slice(2)}${taxSeq}`;

    // 计算可退税额
    let refundableAmount = 0;
    if (items && items.length > 0) {
      for (const item of items) {
        if (item.refundRate !== undefined && item.refundRate !== null) {
          // 退税额 = 不含税金额 × 退税率
          const taxExcludedAmount = (item.totalPrice || 0) / (1 + 0.13); // 假设增值税率 13%
          refundableAmount += taxExcludedAmount * (item.refundRate / 100);
        }
      }
    }

    // 创建出口退税单（使用 schema 实际字段名：match_status 为下划线命名）
    const taxRefund = await tx.taxRefund.create({
      data: {
        refundNo,
        salesContractId,
        customsDeclarationId,
        forexVerificationId,
        status: 'DRAFT',
        match_status: 'pending',
        declaredAmount: 0,
        refundableAmount,
        refundedAmount: 0,
        note: `基于报关单 ${customsDeclarationId} 和外汇核销单 ${forexVerificationId} 生成`,
      },
    });

    return taxRefund;
  });

  return tx;
};

/**
 * 一键生成三张表（打包接口）
 * @param {Object} params
 * @param {string} params.salesContractId - 出口合同 ID
 * @param {Array} params.items - 商品明细列表（含 HSCode 和退税率）
 * @param {Object} params.extraData - 额外数据
 * @param {boolean} params.generateCustoms - 是否生成报关单
 * @param {boolean} params.generateForex - 是否生成外汇核销单
 * @param {boolean} params.generateTaxRefund - 是否生成出口退税单
 */
const generateThreeForms = async ({
  salesContractId,
  items,
  extraData = {},
  generateCustoms = true,
  generateForex = true,
  generateTaxRefund: needTaxRefund = true,  // 重命名避免与外层函数 generateTaxRefund 同名冲突
}) => {
  const results = {
    customsDeclarationId: null,
    forexId: null,
    taxRefundId: null,
  };

  let customsDeclarationId = null;
  let forexVerificationId = null;

  // 1. 生成报关单
  if (generateCustoms) {
    const customsDeclaration = await generateCustomsDeclaration({
      salesContractId,
      items,
      extraData: extraData.customs || {},
    });
    customsDeclarationId = customsDeclaration.id;
    results.customsDeclarationId = customsDeclarationId;
  }

  // 2. 生成外汇核销单（依赖报关单）
  if (generateForex && customsDeclarationId) {
    const forexVerification = await generateForexVerification({
      salesContractId,
      customsDeclarationId,
      extraData: extraData.forex || {},
    });
    forexVerificationId = forexVerification.id;
    results.forexId = forexVerificationId;
  }

  // 3. 生成出口退税单（依赖报关单和外汇核销单）
  if (needTaxRefund && customsDeclarationId && forexVerificationId) {
    const taxRefund = await generateTaxRefund({
      salesContractId,
      customsDeclarationId,
      forexVerificationId,
      items,
    });
    results.taxRefundId = taxRefund.id;
  }

  return results;
};

/**
 * 导出出口三张表为 Excel 工作簿
 * 职责：查询合同最新报关单、外汇核销单、退税单，生成三 Sheet Excel 返回 Buffer
 * @param {string} salesContractId - 出口合同 ID
 * @param {Object} [ids] - 可选，精确指定三张表的 ID
 * @returns {{ buffer: Buffer, filename: string }}
 */
const exportThreeFormsExcel = async (salesContractId, ids = {}) => {
  // 1. 获取合同及最新生成的三张表
  const contract = await prisma.salesContract.findUnique({
    where: { id: salesContractId },
    select: { contractNo: true, totalAmount: true },
  });
  if (!contract) throw createError('合同不存在', 404);

  const cdWhere = ids.customsDeclarationId
    ? { id: ids.customsDeclarationId }
    : { salesContractId, ...(buildWhere ? buildWhere({}) : {}) };
  const fvWhere = ids.forexId ? { id: ids.forexId } : { salesContractId };
  const trWhere = ids.taxRefundId ? { id: ids.taxRefundId } : { salesContractId };

  const [customsDeclaration, forexVerification, taxRefund] = await Promise.all([
    prisma.customsDeclaration.findFirst({
      where: cdWhere,
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { product: true } } },
    }),
    prisma.forexVerification.findFirst({
      where: fvWhere,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.taxRefund.findFirst({
      where: trWhere,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // 2. 创建工作簿
  const wb = new ExcelJS.Workbook();
  wb.creator = '捷淞进销存';
  wb.created = new Date();

  // 样式常量
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  const headerFont = { name: '微软雅黑', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  const titleFont = { name: '微软雅黑', bold: true, size: 14 };
  const borderStyle = { style: 'thin', color: { argb: 'FFD1D5DB' } };
  const allBorders = { top: borderStyle, left: borderStyle, bottom: borderStyle, right: borderStyle };

  const applyHeader = (ws, cols) => {
    ws.getRow(1).values = cols.map((c) => c.header);
    ws.getRow(1).eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = allBorders;
    });
    ws.getRow(1).height = 28;
    cols.forEach((c, i) => {
      ws.getColumn(i + 1).width = c.width || 18;
    });
  };

  // --- Sheet 1: 报关单 ---
  {
    const ws = wb.addWorksheet('报关单');
    ws.mergeCells('A1:H1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `出口货物报关单 — ${contract.contractNo}`;
    titleCell.font = titleFont;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    const infoRow = ws.addRow([
      '报关单号', customsDeclaration?.declarationNo || '—',
      '状态', customsDeclaration?.status || '—',
      '货值总额', `${customsDeclaration?.currency || 'USD'} ${(customsDeclaration?.totalAmount || 0).toFixed(2)}`,
      '毛重(kg)', customsDeclaration?.totalGrossWeight ?? '—',
    ]);
    infoRow.font = { name: '微软雅黑', size: 10 };
    ws.getRow(2).height = 22;

    ws.addRow([]);

    const cols = [
      { header: '序号', width: 8 },
      { header: '商品名称', width: 28 },
      { header: 'HS 编码', width: 16 },
      { header: '数量', width: 10 },
      { header: '单位', width: 10 },
      { header: '单价 (USD)', width: 14 },
      { header: '总价 (USD)', width: 14 },
      { header: '申报要素', width: 30 },
    ];
    applyHeader(ws, cols);
    ws.getRow(ws.lastRow.number).values = cols.map((c) => c.header);

    const items = customsDeclaration?.items || [];
    items.forEach((item, idx) => {
      const row = ws.addRow([
        idx + 1,
        item.customsName || item.product?.customsName || item.product?.name || '—',
        item.hsCode || '—',
        item.quantity ?? '—',
        item.unit || '—',
        item.unitPrice ?? 0,
        item.totalPrice ?? 0,
        item.declarationElements || '—',
      ]);
      row.eachCell((cell) => { cell.border = allBorders; cell.font = { name: '微软雅黑', size: 10 }; });
    });

    if (items.length === 0) {
      const emptyRow = ws.addRow(['暂无明细数据', '', '', '', '', '', '', '']);
      emptyRow.getCell(1).font = { name: '微软雅黑', color: { argb: 'FF9CA3AF' }, italic: true };
    }
  }

  // --- Sheet 2: 外汇核销单 ---
  {
    const ws = wb.addWorksheet('外汇核销单');
    ws.mergeCells('A1:F1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `出口收汇核销单 — ${contract.contractNo}`;
    titleCell.font = titleFont;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    const fields = [
      ['核销单号', forexVerification?.verificationNo || '—'],
      ['状态', forexVerification?.status || '—'],
      ['银行名称', forexVerification?.bankName || '—'],
      ['币种', forexVerification?.currency || 'USD'],
      ['收款金额', (forexVerification?.receivedAmount || 0).toFixed(2)],
      ['汇率', forexVerification?.exchangeRate ?? '—'],
      ['已结算金额', (forexVerification?.settledAmount || 0).toFixed(2)],
      ['备注', forexVerification?.note || '—'],
    ];

    fields.forEach(([label, value]) => {
      const row = ws.addRow([label, value]);
      row.getCell(1).font = { name: '微软雅黑', bold: true, size: 11 };
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
      row.getCell(2).font = { name: '微软雅黑', size: 11 };
      row.eachCell((cell) => { cell.border = allBorders; });
      row.height = 22;
    });

    ws.getColumn(1).width = 20;
    ws.getColumn(2).width = 36;
  }

  // --- Sheet 3: 出口退税申报表 ---
  {
    const ws = wb.addWorksheet('出口退税申报表');
    ws.mergeCells('A1:F1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `出口货物退税申报表 — ${contract.contractNo}`;
    titleCell.font = titleFont;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    const fields = [
      ['退税单号', taxRefund?.refundNo || '—'],
      ['状态', taxRefund?.status || '—'],
      ['申报金额 (CNY)', (taxRefund?.declaredAmount || 0).toFixed(2)],
      ['可退税额 (CNY)', (taxRefund?.refundableAmount || 0).toFixed(2)],
      ['已退税额 (CNY)', (taxRefund?.refundedAmount || 0).toFixed(2)],
      ['备注', taxRefund?.note || '—'],
    ];

    fields.forEach(([label, value]) => {
      const row = ws.addRow([label, value]);
      row.getCell(1).font = { name: '微软雅黑', bold: true, size: 11 };
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
      row.getCell(2).font = { name: '微软雅黑', size: 11 };
      row.eachCell((cell) => { cell.border = allBorders; });
      row.height = 22;
    });

    ws.getColumn(1).width = 22;
    ws.getColumn(2).width = 36;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `三张表_${contract.contractNo}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return { buffer, filename };
};

module.exports = {
  generateCustomsDeclaration,
  generateForexVerification,
  generateTaxRefund,
  generateThreeForms,
  exportThreeFormsExcel,
};
