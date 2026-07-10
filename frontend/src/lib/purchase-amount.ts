/**
 * Input: 采购合同明细、不含税单价、含税总额与已付金额
 * Output: 页面统一使用的价税、待付、超付和历史数据诊断
 * Pos: 采购详情、付款和催票展示的金额 Module；契约与后端 purchaseAmountService 一致
 */

export interface PurchaseAmountIssue {
  code:
    | 'LEGACY_TAX_RATE_ENCODING'
    | 'LINE_GROSS_MISMATCH'
    | 'MISSING_CONTRACT_TOTAL'
    | 'CONTRACT_LINE_MISMATCH'
    | 'OVERPAID';
  message: string;
}

type AmountLine = {
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  totalPrice?: number | string | null;
};

type AmountSource = {
  items?: AmountLine[] | null;
  taxRate?: number | string | null;
  totalAmount?: number | string | null;
  paidAmount?: number | string | null;
};

const EPSILON = 0.02;
const LEGACY_LINE_ROUNDING_TOLERANCE = 1;
const toNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const roundMoney = (value: unknown) => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

export const normalizePurchaseTaxRate = (value: unknown) => {
  const rate = toNumber(value, 13);
  if (rate === 100) return 1;
  return Math.max(0, Math.min(rate, 100));
};

export const calculatePurchaseLineAmounts = (item: AmountLine, taxRateValue: unknown) => {
  const taxRate = normalizePurchaseTaxRate(taxRateValue);
  const netAmount = roundMoney(Math.max(0, toNumber(item.quantity)) * Math.max(0, toNumber(item.unitPrice)));
  const expectedTaxAmount = roundMoney(netAmount * (taxRate / 100));
  const expectedGrossAmount = roundMoney(netAmount + expectedTaxAmount);
  const storedGross = toNumber(item.totalPrice);
  const hasStoredGross = storedGross > 0 || (netAmount === 0 && storedGross === 0);
  return {
    netAmount,
    expectedTaxAmount,
    expectedGrossAmount,
    grossAmount: hasStoredGross ? roundMoney(storedGross) : expectedGrossAmount,
    hasStoredGross,
  };
};

export const summarizePurchaseAmounts = (source: AmountSource) => {
  const rawTaxRate = toNumber(source.taxRate, 13);
  const taxRate = normalizePurchaseTaxRate(rawTaxRate);
  const issues: PurchaseAmountIssue[] = [];
  if (rawTaxRate === 100) {
    issues.push({
      code: 'LEGACY_TAX_RATE_ENCODING',
      message: '历史税率 100 已按 1% 兼容计算，请复核供应商发票税点',
    });
  }

  let lineMismatch = false;
  const lines = (source.items || []).map((item) => {
    const { netAmount, expectedTaxAmount, expectedGrossAmount, grossAmount, hasStoredGross } = (
      calculatePurchaseLineAmounts(item, taxRate)
    );
    if (hasStoredGross && Math.abs(grossAmount - expectedGrossAmount) > LEGACY_LINE_ROUNDING_TOLERANCE) {
      lineMismatch = true;
    }
    return { netAmount, expectedTaxAmount, grossAmount };
  });

  if (lineMismatch) {
    issues.push({
      code: 'LINE_GROSS_MISMATCH',
      message: '部分历史明细含税金额与数量×不含税单价×税率不一致，请按原合同复核',
    });
  }

  const netAmount = roundMoney(lines.reduce((sum, line) => sum + line.netAmount, 0));
  const lineGrossAmount = roundMoney(lines.reduce((sum, line) => sum + line.grossAmount, 0));
  const taxAmount = roundMoney(lineGrossAmount - netAmount);
  const contractTotal = roundMoney(source.totalAmount);
  const grossAmount = contractTotal > 0 ? contractTotal : lineGrossAmount;
  const paidAmount = roundMoney(Math.max(0, toNumber(source.paidAmount)));

  if (contractTotal <= 0 && lineGrossAmount > 0) {
    issues.push({ code: 'MISSING_CONTRACT_TOTAL', message: '合同总额缺失，当前仅按明细含税合计展示' });
  }
  if (contractTotal > 0 && lineGrossAmount > 0 && Math.abs(contractTotal - lineGrossAmount) > EPSILON) {
    issues.push({ code: 'CONTRACT_LINE_MISMATCH', message: '合同含税总额与明细含税合计不一致，请按原合同复核' });
  }

  const overpaidAmount = roundMoney(Math.max(paidAmount - grossAmount, 0));
  if (overpaidAmount > EPSILON) {
    issues.push({ code: 'OVERPAID', message: `已付金额超过合同含税总额 ¥${overpaidAmount.toFixed(2)}` });
  }

  return {
    taxRate,
    netAmount,
    taxAmount,
    lineGrossAmount,
    grossAmount,
    paidAmount,
    remainingAmount: roundMoney(Math.max(grossAmount - paidAmount, 0)),
    overpaidAmount,
    lines,
    issues,
  };
};
