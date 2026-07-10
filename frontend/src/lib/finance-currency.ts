/**
 * Input: USD 应收、CNY 应付与结算汇率
 * Output: 统一 CNY 口径的趋势和现金流预测
 * Pos: 财务图表的币种换算 Module
 */

export interface PaymentTrendPoint {
  label: string;
  receivables: number;
  payables: number;
}

export interface CnyPaymentTrendPoint {
  label: string;
  receivablesCny: number;
  payablesCny: number;
  netCashFlowCny: number;
}

export interface CashFlowForecastPoint {
  label: string;
  value: number;
  type: 'actual' | 'forecast';
}

export const convertPaymentTrendsToCny = (
  trends: PaymentTrendPoint[],
  usdToCnyRate: number,
): CnyPaymentTrendPoint[] => {
  if (!Number.isFinite(usdToCnyRate) || usdToCnyRate <= 0) return [];
  const roundMoney = (value: number) => Math.round(value * 100) / 100;

  return trends.map((point) => {
    const receivablesCny = roundMoney((Number(point.receivables) || 0) * usdToCnyRate);
    const payablesCny = roundMoney(Number(point.payables) || 0);
    return {
      label: point.label,
      receivablesCny,
      payablesCny,
      netCashFlowCny: roundMoney(receivablesCny - payablesCny),
    };
  });
};

export const buildCnyCashFlowForecast = (
  trends: CnyPaymentTrendPoint[],
): CashFlowForecastPoint[] => {
  if (trends.length < 2) return [];
  const last = trends[trends.length - 1];
  const previous = trends[trends.length - 2];
  const delta = last.netCashFlowCny - previous.netCashFlowCny;
  const roundMoney = (value: number) => Math.round(value * 100) / 100;

  return [
    { label: `${last.label} (实际)`, value: last.netCashFlowCny, type: 'actual' },
    { label: '预测 +1期', value: roundMoney(last.netCashFlowCny + delta), type: 'forecast' },
    { label: '预测 +2期', value: roundMoney(last.netCashFlowCny + delta * 2), type: 'forecast' },
    { label: '预测 +3期', value: roundMoney(last.netCashFlowCny + delta * 3), type: 'forecast' },
  ];
};
