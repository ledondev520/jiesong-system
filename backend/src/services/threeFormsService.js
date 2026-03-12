/**
 * Input: 出口合同 ID、报关单数据
 * Output: 一键生成三张表（报关单、外汇核销单、出口退税单）
 * Pos: 出口退税模块服务层，负责三表联动生成
 */

const prisma = require('../utils/prisma');
const { buildWhere } = require('./customsDeclarationService');

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

    // 生成报关单号
    const declarationNo = `BG${contract.contractNo.slice(2)}`;

    // 计算总额
    const totalAmount = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

    // 创建报关单
    const customsDeclaration = await tx.customsDeclaration.create({
      data: {
        declarationNo,
        salesContractId,
        status: 'DRAFT',
        exporter: extraData.exporter || '',
        consignee: extraData.consignee || '',
        destinationCountry: extraData.destinationCountry || '',
        portOfLoading: extraData.portOfLoading || '',
        portOfDestination: extraData.portOfDestination || contract.port?.name || '',
        transportMode: extraData.transportMode || '',
        declarationDate: new Date(),
        currency: 'USD',
        exchangeRate: contract.exchangeRate || 1,
        totalAmount,
        totalQuantity,
        totalNetWeight: contract.netWeight || 0,
        totalGrossWeight: contract.grossWeight || 0,
        note: extraData.note || '',
      },
    });

    // 创建报关单明细
    if (items && items.length > 0) {
      const customsItems = items.map((item, index) => ({
        customsDeclarationId: customsDeclaration.id,
        productId: item.productId || '',
        packingItemId: item.packingItemId || '',
        itemNo: index + 1,
        customsName: item.productName,
        hsCode: item.hsCode,
        declarationElements: item.declarationElements || '',
        quantity: item.quantity,
        unit: item.unit || '',
        unitPrice: item.unitPrice || 0,
        totalPrice: item.totalPrice || 0,
      }));

      await tx.customsDeclarationItem.createMany({
        data: customsItems,
      });
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

    // 生成核销单号
    const verificationNo = `WH${contract.contractNo.slice(2)}`;

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

    // 生成退税单号
    const refundNo = `TX${contract.contractNo.slice(2)}`;

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

    // 创建出口退税单
    const taxRefund = await tx.taxRefund.create({
      data: {
        refundNo,
        salesContractId,
        customsDeclarationId,
        forexVerificationId,
        status: 'DRAFT',
        matchStatus: 'pending',
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
  generateTaxRefund = true,
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
  if (generateTaxRefund && customsDeclarationId && forexVerificationId) {
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

module.exports = {
  generateCustomsDeclaration,
  generateForexVerification,
  generateTaxRefund,
  generateThreeForms,
};
