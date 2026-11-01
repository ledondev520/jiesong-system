/**
 * Input: 合成月度趋势（旧→新）
 * Output: 占比图取哪个账期、为什么回退、负数怎么交代、为空时的具体原因
 * Pos: expenseShare 纯逻辑测试
 */
import { describe, expect, it } from "vitest";
import { buildExpenseShare, type ExpenseTrendPoint } from "./expenseShare";

const month = (
  label: string,
  values: Partial<ExpenseTrendPoint> = {},
): ExpenseTrendPoint => ({
  label,
  costOfSales: 0,
  adminExpenses: 0,
  financialExpenses: 0,
  sellingExpenses: 0,
  ...values,
});

describe("buildExpenseShare", () => {
  it("uses the newest period when it has positive expenses", () => {
    const share = buildExpenseShare([
      month("2026年6月", { costOfSales: 5 }),
      month("2026年7月", { costOfSales: 100, adminExpenses: 20 }),
    ]);
    expect(share.periodLabel).toBe("2026年7月");
    expect(share.slices.map((s) => s.name)).toEqual(["营业成本", "管理费用"]);
    expect(share.skippedLatestLabel).toBeNull();
    expect(share.emptyReason).toBeNull();
  });

  it("falls back to the latest period that has expenses and says so (the blank-card case)", () => {
    const share = buildExpenseShare([
      month("2026年6月", { costOfSales: 80, sellingExpenses: 10 }),
      month("2026年7月", { expenseReported: false }),
    ]);
    expect(share.periodLabel).toBe("2026年6月");
    expect(share.skippedLatestLabel).toBe("2026年7月");
    expect(share.slices).toHaveLength(2);
  });

  it("lists negative items instead of silently dropping them", () => {
    const share = buildExpenseShare([
      month("2026年7月", { costOfSales: 50, financialExpenses: -3 }),
    ]);
    expect(share.slices.map((s) => s.name)).toEqual(["营业成本"]);
    expect(share.negatives).toEqual([{ name: "财务费用", value: -3 }]);
  });

  it("explains an empty chart: not entered vs zero or negative", () => {
    expect(
      buildExpenseShare([month("2026年7月", { expenseReported: false })])
        .emptyReason,
    ).toContain("没有录入数据（空值）");
    expect(
      buildExpenseShare([
        month("2026年7月", { expenseReported: true, financialExpenses: -1 }),
      ]).emptyReason,
    ).toContain("都是 0 或负数");
    expect(buildExpenseShare([]).emptyReason).toContain("还没有导入");
  });
});
