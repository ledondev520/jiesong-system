/**
 * Input: 月度趋势（analytics.trends，旧→新）
 * Output: 「支出分类占比」图的数据：用哪个账期、哪几项、哪些为负未画入、没有数据时的具体原因
 * Pos: 利润表页占比图的纯逻辑；只做取数与说明，不改任何金额
 *
 * 口径：取「最新一个有正数费用」的账期；最新账期本身没有时回退到更早的账期，并说明回退，
 *       不再让空图伪装成空白卡片。负的费用（如财务费用为净利息收入）画不进占比，单独列出。
 */

export interface ExpenseTrendPoint {
  label: string;
  costOfSales: number;
  adminExpenses: number;
  financialExpenses: number;
  sellingExpenses: number;
  expenseReported?: boolean;
}

export interface ExpenseSlice {
  name: string;
  value: number;
}

export interface ExpenseShare {
  /** 实际用于占比图的账期；全部账期都没有正数费用时为 null */
  periodLabel: string | null;
  slices: ExpenseSlice[];
  /** 该账期为负、未画入占比的费用项 */
  negatives: ExpenseSlice[];
  /** 最新账期没有可画的费用、已回退到更早账期时，最新账期的标签 */
  skippedLatestLabel: string | null;
  /** slices 为空时的具体原因 */
  emptyReason: string | null;
}

const itemsOf = (trend: ExpenseTrendPoint): ExpenseSlice[] => [
  { name: "营业成本", value: trend.costOfSales },
  { name: "管理费用", value: trend.adminExpenses },
  { name: "财务费用", value: trend.financialExpenses },
  { name: "销售费用", value: trend.sellingExpenses },
];

export function buildExpenseShare(trends: ExpenseTrendPoint[]): ExpenseShare {
  const latest = trends[trends.length - 1];
  if (!latest) {
    return {
      periodLabel: null,
      slices: [],
      negatives: [],
      skippedLatestLabel: null,
      emptyReason: "还没有导入任何账期。",
    };
  }
  for (let index = trends.length - 1; index >= 0; index -= 1) {
    const trend = trends[index];
    const slices = itemsOf(trend).filter((item) => item.value > 0);
    if (slices.length === 0) continue;
    return {
      periodLabel: trend.label,
      slices,
      negatives: itemsOf(trend).filter((item) => item.value < 0),
      skippedLatestLabel: trend === latest ? null : latest.label,
      emptyReason: null,
    };
  }
  return {
    periodLabel: null,
    slices: [],
    negatives: itemsOf(latest).filter((item) => item.value < 0),
    skippedLatestLabel: null,
    emptyReason:
      latest.expenseReported === false
        ? `${latest.label}利润表的营业成本、管理费用、财务费用、销售费用都没有录入数据（空值），所有已导入账期也没有可画的费用。`
        : `${latest.label}的营业成本、管理费用、财务费用、销售费用都是 0 或负数，所有已导入账期也没有正数费用可画。`,
  };
}
