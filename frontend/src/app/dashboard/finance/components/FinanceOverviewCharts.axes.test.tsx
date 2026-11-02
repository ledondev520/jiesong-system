/**
 * Input: 合成周度收付趋势、记录坐标轴 props 的 recharts 替身
 * Output: 收支对比图坐标轴可读性回归（金额万/亿缩写、点多时斜排、周起始日说明）
 * Pos: B22 图表可读性测试（jsdom 不排版刻度文本，故直接断言传给 recharts 的轴参数）
 */
import { cloneElement, type ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import FinanceOverviewCharts from "./FinanceOverviewCharts";

const axes = vi.hoisted(() => ({
  x: [] as Record<string, unknown>[],
  y: [] as Record<string, unknown>[],
}));

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 700, height: 260 } as never),
    XAxis: (props: Record<string, unknown>) => {
      axes.x.push(props);
      return null;
    },
    YAxis: (props: Record<string, unknown>) => {
      axes.y.push(props);
      return null;
    },
  };
});

const trends = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    label: `${i + 1}/1`,
    receivablesCny: 1_250_000,
    payablesCny: 800_000,
    netCashFlowCny: 450_000,
  }));

const renderCharts = (count: number) =>
  render(
    <FinanceOverviewCharts
      cnyTrends={trends(count)}
      cashFlowForecast={[]}
      trendDays={90}
      effectiveRate={7.1}
      onTrendDaysChange={() => {}}
    />,
  );

beforeEach(() => {
  axes.x.length = 0;
  axes.y.length = 0;
});

it("Y 轴金额用万缩写，说明横轴为每周起始日；点多时 X 轴斜排 (B22)", () => {
  renderCharts(12);
  expect(screen.getByText(/横轴为每周起始日/)).toBeInTheDocument();
  const y = axes.y[0].tickFormatter as (v: number) => string;
  expect(y(1_250_000)).toBe("125万");
  expect(axes.y[0].width).toBe(56);
  expect(axes.x[0]).toMatchObject({
    angle: -35,
    textAnchor: "end",
    minTickGap: 12,
  });
});

it("点数少时 X 轴保持水平", () => {
  renderCharts(5);
  expect(axes.x[0]).toMatchObject({ angle: 0, textAnchor: "middle" });
});

it("近期没有收付款时给出明确空状态和原因，汇率不可用时说明无法折算 (B41)", () => {
  const { rerender } = render(
    <FinanceOverviewCharts
      cnyTrends={[]}
      cashFlowForecast={[]}
      trendDays={90}
      effectiveRate={7.1}
      onTrendDaysChange={() => {}}
    />,
  );
  expect(screen.getByText("近期没有收付款记录")).toBeInTheDocument();
  expect(screen.getByText(/近 90 天内没有登记收付款/)).toBeInTheDocument();
  rerender(
    <FinanceOverviewCharts
      cnyTrends={[]}
      cashFlowForecast={[]}
      trendDays={30}
      effectiveRate={null}
      onTrendDaysChange={() => {}}
    />,
  );
  expect(screen.getByText("结算汇率不可用")).toBeInTheDocument();
  expect(screen.getByText(/汇率暂不可用/)).toBeInTheDocument();
});
