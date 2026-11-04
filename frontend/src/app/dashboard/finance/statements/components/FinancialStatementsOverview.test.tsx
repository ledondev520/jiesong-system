import { render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FinancialStatementsOverview } from "./FinancialStatementsOverview";

type Props = Parameters<typeof FinancialStatementsOverview>[0];
const props = (trends: object[]) =>
  ({
    analytics: { latestPeriod: { periodLabel: "2026年3月" }, trends },
    currentDetail: { year: 2026, month: 1, periodLabel: "2026年1月" },
    currentPeriod: null,
    dangerAlerts: [],
    warningAlerts: [],
    debtRatioVal: 0.5,
    detailLoading: false,
    hasData: true,
    latestBalanceSheet: {
      totalEquity: 100,
      totalAssets: 200,
      totalLiabilities: 100,
    },
    latestIncomeStatement: {
      revenueMonth: 200,
      revenueYTD: 200,
      netProfitMonth: 20,
      netProfitYTD: 20,
    },
    onOpenUploadDialog: () => {},
    onSelectPeriod: () => {},
    periods: [],
    selectedPeriod: "2026-1",
    showHeader: false,
  }) as unknown as Props;
it("历史1月与上一自然年12月比较，健康提示标出最新账期", () => {
  render(
    <FinancialStatementsOverview
      {...props([
        { year: 2025, month: 12, revenue: 100, netProfit: 10 },
        { year: 2026, month: 1, revenue: 200, netProfit: 20 },
        { year: 2026, month: 2, revenue: 999, netProfit: 999 },
        { year: 2026, month: 3, revenue: 999, netProfit: 999 },
      ])}
    />,
  );
  const title = screen.getByText("本期营业收入（2026年1月）");
  expect(
    within(title.closest('[data-slot="card"]') as HTMLElement).getByText(
      "环比 +100.0%",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText("健康提示与预警基于最新账期：2026年3月"),
  ).toBeInTheDocument();
});
it("缺失紧前月份时不能用其他历史期冒充环比", () => {
  render(
    <FinancialStatementsOverview
      {...props([
        { year: 2025, month: 11, revenue: 100 },
        { year: 2026, month: 1, revenue: 200 },
      ])}
    />,
  );
  expect(screen.getAllByText("无上期数据")).toHaveLength(4);
});

afterEach(() => vi.useRealTimers());

it("最新账期滞后超过 1 个月时不宣布「财务状况良好」，并说明滞后", () => {
  vi.useFakeTimers({ now: new Date("2026-11-04T00:00:00Z"), toFake: ["Date"] });
  render(
    <FinancialStatementsOverview
      {...props([])}
      periods={[{ year: 2026, month: 7 }] as never}
    />,
  );
  expect(screen.queryByText("财务状况良好")).not.toBeInTheDocument();
  const note = screen.getByTestId("stale-health-note");
  expect(note).toHaveTextContent("2026年7月 账期内未触发预警");
  expect(note).toHaveTextContent("已滞后 4 个月");
});

it("账期只滞后 1 个月属正常，仍显示「财务状况良好」", () => {
  vi.useFakeTimers({ now: new Date("2026-11-04T00:00:00Z"), toFake: ["Date"] });
  render(
    <FinancialStatementsOverview
      {...props([])}
      periods={[{ year: 2026, month: 10 }] as never}
    />,
  );
  expect(screen.getByText("财务状况良好")).toBeInTheDocument();
  expect(screen.queryByTestId("stale-health-note")).not.toBeInTheDocument();
});

it("KPI 组统一用万元：货币资金不再用元，避免与资产合计差 100 倍的错觉", () => {
  const balance = {
    totalEquity: 2000000,
    totalAssets: 2100000,
    totalLiabilities: 100000,
    cashAndEquivalents: 123456.78,
  };
  render(
    <FinancialStatementsOverview
      {...props([])}
      latestBalanceSheet={balance as never}
    />,
  );
  expect(screen.getByText("货币资金：¥12.35万")).toBeInTheDocument();
  expect(screen.getByText(/下列金额统一以「万元」为单位/)).toBeInTheDocument();
  expect(screen.queryByText(/123,456\.78/)).not.toBeInTheDocument();
});
