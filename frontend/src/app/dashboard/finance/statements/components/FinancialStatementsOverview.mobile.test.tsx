/**
 * Input: FinancialStatementsOverview（showHeader）
 * Output: 手机端财务报表只读：上传按钮仅 md 以上显示，手机显示只读说明
 * Pos: 财务报表页手机端回归
 */
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/dashboard/finance/statements",
  useSearchParams: () => new URLSearchParams(),
}));

import { FinancialStatementsOverview } from "./FinancialStatementsOverview";

type Props = Parameters<typeof FinancialStatementsOverview>[0];
const props = {
  analytics: { latestPeriod: { periodLabel: "2026年1月" }, trends: [] },
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
  showHeader: true,
} as unknown as Props;

it("上传按钮在手机宽度隐藏（hidden md:inline-flex），并给出只读说明", () => {
  render(<FinancialStatementsOverview {...props} />);
  const upload = screen.getByRole("button", { name: "上传月度会计报表" });
  expect(upload.className).toContain("hidden");
  expect(upload.className).toContain("md:inline-flex");
  const note = screen.getByText("手机端仅查看报表摘要，上传请在电脑上操作");
  expect(note.className).toContain("md:hidden");
});
