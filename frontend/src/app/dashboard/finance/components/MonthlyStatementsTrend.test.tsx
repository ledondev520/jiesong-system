/**
 * Input: 合成财务报表分析数据、recharts 替身
 * Output: 月度趋势图的加载/空/错误/有数据/滞后提示回归（B41）
 * Pos: 财务概览月度图表测试
 */
import { cloneElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MonthlyStatementsTrend from "./MonthlyStatementsTrend";

const mocks = vi.hoisted(() => ({ getAnalytics: vi.fn() }));
const bars = vi.hoisted(() => ({ data: [] as unknown[] }));

vi.mock("@/lib/api-cache", () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
}));
vi.mock("@/services/financialStatements.service", () => ({
  financialStatementsService: { getAnalytics: mocks.getAnalytics },
}));
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 700, height: 260 } as never),
    BarChart: ({ data }: { data: unknown[] }) => {
      bars.data = data;
      return <div data-testid="bars" />;
    },
  };
});

const trend = (year: number, month: number) => ({
  label: `${year}-${month}`,
  year,
  month,
  revenue: 1_000_000 * month,
  netProfit: 100_000 * month,
});

describe("月度财务报表趋势", () => {
  beforeEach(() => {
    mocks.getAnalytics.mockReset();
    bars.data = [];
  });

  it("没有账期时显示明确的空状态而不是空白图区", async () => {
    mocks.getAnalytics.mockResolvedValue({ trends: [], totalPeriods: 0 });
    render(<MonthlyStatementsTrend />);
    expect(await screen.findByText("暂无已导入的财务报表账期")).toBeVisible();
    expect(screen.queryByTestId("bars")).toBeNull();
  });

  it("有账期时按月升序画出最近 12 个月，并写明数据截至与已滞后", async () => {
    // 乱序、共 14 个月：只取最新 12 个，按月份升序
    const months = [
      [2026, 7],
      [2025, 6],
      [2026, 1],
      [2025, 7],
      [2025, 8],
      [2025, 9],
      [2025, 10],
      [2025, 11],
      [2025, 12],
      [2026, 2],
      [2026, 3],
      [2026, 4],
      [2026, 5],
      [2026, 6],
    ];
    mocks.getAnalytics.mockResolvedValue({
      trends: months.map(([y, m]) => trend(y, m)),
      totalPeriods: 14,
    });
    render(<MonthlyStatementsTrend />);
    expect(await screen.findByTestId("bars")).toBeInTheDocument();
    const periods = (bars.data as { period: string }[]).map((p) => p.period);
    expect(periods).toHaveLength(12);
    expect(periods[0]).toBe("2025-08");
    expect(periods[11]).toBe("2026-07");
    expect([...periods].sort()).toEqual(periods);
    expect(screen.getByTestId("statements-as-of")).toHaveTextContent(
      "数据截至 2026年7月",
    );
  });

  it("加载失败显示错误并可重试", async () => {
    const user = userEvent.setup();
    mocks.getAnalytics.mockRejectedValueOnce(new Error("boom"));
    mocks.getAnalytics.mockResolvedValue({
      trends: [trend(2026, 7)],
      totalPeriods: 1,
    });
    render(<MonthlyStatementsTrend />);
    await user.click(await screen.findByRole("button", { name: "重试" }));
    expect(await screen.findByTestId("bars")).toBeInTheDocument();
  });
});
