/**
 * Input: 前端采购合同与明细金额
 * Output: 详情/付款/催票一致金额口径测试
 * Pos: 采购页面金额展示 Module 测试
 */

import { describe, expect, it } from 'vitest';
import { summarizePurchaseAmounts } from './purchase-amount';

describe('summarizePurchaseAmounts', () => {
  it('不对已含税的明细和合同总额重复加税', () => {
    const result = summarizePurchaseAmounts({
      taxRate: 13,
      totalAmount: 1130,
      paidAmount: 300,
      items: [{ quantity: 10, unitPrice: 100, totalPrice: 1130 }],
    });

    expect(result).toMatchObject({
      taxRate: 13,
      netAmount: 1000,
      taxAmount: 130,
      lineGrossAmount: 1130,
      grossAmount: 1130,
      remainingAmount: 830,
      overpaidAmount: 0,
    });
    expect(result.issues).toEqual([]);
  });

  it('把历史 100 税率解释为 1% 并暴露兼容提示', () => {
    const result = summarizePurchaseAmounts({
      taxRate: 100,
      totalAmount: 101,
      paidAmount: 0,
      items: [{ quantity: 1, unitPrice: 100, totalPrice: 101 }],
    });

    expect(result.taxRate).toBe(1);
    expect(result.taxAmount).toBe(1);
    expect(result.issues.map((issue) => issue.code)).toEqual(['LEGACY_TAX_RATE_ENCODING']);
  });

  it('已付超过合同金额时待付保持 0 并明确标记超付', () => {
    const result = summarizePurchaseAmounts({
      taxRate: 13,
      totalAmount: 1130,
      paidAmount: 1200,
      items: [{ quantity: 10, unitPrice: 100, totalPrice: 1130 }],
    });

    expect(result.remainingAmount).toBe(0);
    expect(result.overpaidAmount).toBe(70);
    expect(result.issues.map((issue) => issue.code)).toEqual(['OVERPAID']);
  });

  it('允许历史合同按整元四舍五入的小差额', () => {
    const result = summarizePurchaseAmounts({
      taxRate: 13,
      totalAmount: 10826,
      paidAmount: 0,
      items: [{ quantity: 2, unitPrice: 4790.5, totalPrice: 10826 }],
    });

    expect(result.issues).toEqual([]);
  });
});
