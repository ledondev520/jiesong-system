/**
 * Input: USD 应收、CNY 应付与结算汇率
 * Output: 可比较的 CNY 趋势和现金流预测
 * Pos: 财务币种换算契约测试
 */

import { describe, expect, it } from 'vitest';
import { buildCnyCashFlowForecast, convertPaymentTrendsToCny } from './finance-currency';

describe('convertPaymentTrendsToCny', () => {
  it('只换算 USD 应收，CNY 应付保持原值', () => {
    const result = convertPaymentTrendsToCny([
      { label: '6/1', receivables: 100, payables: 500 },
    ], 6.64);

    expect(result).toEqual([
      {
        label: '6/1',
        receivablesCny: 664,
        payablesCny: 500,
        netCashFlowCny: 164,
      },
    ]);
  });

  it('无有效汇率时不生成伪可比数据', () => {
    expect(convertPaymentTrendsToCny([{ label: '6/1', receivables: 100, payables: 500 }], 0)).toEqual([]);
  });
});

describe('buildCnyCashFlowForecast', () => {
  it('用最近两期净现金流的变化量做 CNY 线性外推', () => {
    const result = buildCnyCashFlowForecast([
      { label: '6/1', receivablesCny: 600, payablesCny: 500, netCashFlowCny: 100 },
      { label: '6/8', receivablesCny: 900, payablesCny: 600, netCashFlowCny: 300 },
    ]);

    expect(result.map((point) => point.value)).toEqual([300, 500, 700, 900]);
    expect(result[0].label).toBe('6/8 (实际)');
  });
});
