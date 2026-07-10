/**
 * Input: 采购数量、不含税单价、含税明细金额、合同总额与已付金额
 * Output: 统一价税摘要、待付/超付金额和历史数据诊断
 * Pos: 采购创建、详情、付款、催票和合同文档共用的权威金额 Module
 */

const MONEY_EPSILON = 0.02;
const LEGACY_LINE_ROUNDING_TOLERANCE = 1;

const toFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const roundMoney = (value) => Math.round((toFiniteNumber(value) + Number.EPSILON) * 100) / 100;

/** 历史导入曾把 1% 写成 100；只在读取兼容，不继续写入该编码。 */
const normalizePurchaseTaxRate = (value) => {
  const rate = toFiniteNumber(value, 13);
  if (rate === 100) return 1;
  return Math.max(0, Math.min(rate, 100));
};

const calculateExpectedLineAmounts = (item, taxRate) => {
  const quantity = Math.max(0, toFiniteNumber(item?.quantity));
  const unitPrice = Math.max(0, toFiniteNumber(item?.unitPrice));
  const netAmount = roundMoney(quantity * unitPrice);
  const taxAmount = roundMoney(netAmount * (normalizePurchaseTaxRate(taxRate) / 100));
  return {
    netAmount,
    taxAmount,
    grossAmount: roundMoney(netAmount + taxAmount),
  };
};

const calculateNewLineTotal = (item, taxRate) => (
  calculateExpectedLineAmounts(item, taxRate).grossAmount
);

const summarizePurchaseAmounts = ({ items = [], taxRate = 13, totalAmount = 0, paidAmount = 0 } = {}) => {
  const normalizedTaxRate = normalizePurchaseTaxRate(taxRate);
  const rawTaxRate = toFiniteNumber(taxRate, 13);
  const issues = [];

  if (rawTaxRate === 100) {
    issues.push({
      code: 'LEGACY_TAX_RATE_ENCODING',
      message: '历史税率 100 已按 1% 兼容计算，请复核供应商发票税点',
    });
  }

  let hasLineMismatch = false;
  const lines = items.map((item) => {
    const expected = calculateExpectedLineAmounts(item, normalizedTaxRate);
    const storedGross = toFiniteNumber(item?.totalPrice);
    const hasStoredGross = storedGross > 0 || (expected.netAmount === 0 && storedGross === 0);
    const grossAmount = hasStoredGross ? roundMoney(storedGross) : expected.grossAmount;
    if (hasStoredGross && Math.abs(grossAmount - expected.grossAmount) > LEGACY_LINE_ROUNDING_TOLERANCE) {
      hasLineMismatch = true;
    }
    return {
      ...expected,
      grossAmount,
      actualTaxAmount: roundMoney(grossAmount - expected.netAmount),
    };
  });

  if (hasLineMismatch) {
    issues.push({
      code: 'LINE_GROSS_MISMATCH',
      message: '部分历史明细含税金额与数量×不含税单价×税率不一致，请按原合同复核',
    });
  }

  const netAmount = roundMoney(lines.reduce((sum, line) => sum + line.netAmount, 0));
  const lineGrossAmount = roundMoney(lines.reduce((sum, line) => sum + line.grossAmount, 0));
  const taxAmount = roundMoney(lineGrossAmount - netAmount);
  const storedContractTotal = roundMoney(totalAmount);
  const grossAmount = storedContractTotal > 0 ? storedContractTotal : lineGrossAmount;
  const safePaidAmount = roundMoney(Math.max(0, toFiniteNumber(paidAmount)));

  if (storedContractTotal <= 0 && lineGrossAmount > 0) {
    issues.push({
      code: 'MISSING_CONTRACT_TOTAL',
      message: '合同总额缺失，当前仅按明细含税合计展示',
    });
  }
  if (
    storedContractTotal > 0
    && lineGrossAmount > 0
    && Math.abs(storedContractTotal - lineGrossAmount) > MONEY_EPSILON
  ) {
    issues.push({
      code: 'CONTRACT_LINE_MISMATCH',
      message: '合同含税总额与明细含税合计不一致，请按原合同复核',
    });
  }

  const overpaidAmount = roundMoney(Math.max(safePaidAmount - grossAmount, 0));
  if (overpaidAmount > MONEY_EPSILON) {
    issues.push({
      code: 'OVERPAID',
      message: `已付金额超过合同含税总额 ¥${overpaidAmount.toFixed(2)}`,
    });
  }

  return {
    taxRate: normalizedTaxRate,
    netAmount,
    taxAmount,
    lineGrossAmount,
    grossAmount,
    paidAmount: safePaidAmount,
    remainingAmount: roundMoney(Math.max(grossAmount - safePaidAmount, 0)),
    overpaidAmount,
    lines,
    issues,
  };
};

module.exports = {
  calculateExpectedLineAmounts,
  calculateNewLineTotal,
  normalizePurchaseTaxRate,
  roundMoney,
  summarizePurchaseAmounts,
};
