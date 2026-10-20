import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BusinessReportsPage from "./page";
const overview = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn() }),
  usePathname: () => "/dashboard/reports",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/services/reports.service", () => ({
  reportsService: {
    getBusinessOverview: (...args: unknown[]) => overview(...args),
  },
}));
const data = {
  period: { startDate: null, endDate: null, dateField: "shippedAt" },
  overview: {
    totalSales: 700,
    totalPurchases: 500,
    grossProfit: 200,
    profitMargin: 2 / 7,
    marginReady: true,
    cashReady: true,
    currency: "CNY",
    contractCount: 1,
    netCashCny: -100,
    scope: "合成商品口径",
    unavailableContracts: [],
  },
  funds: {
    totalReceivable: 100,
    totalPayable: 400,
    overdueReceivable: 25,
    overduePayable: 50,
    overdueRule: "发运超过30天仍未收齐",
  },
  inventory: { totalItems: 2, lowStockItems: 1, inTransitContainers: 1 },
  trends: { monthlySales: [] },
};
beforeEach(() => {
  window.history.replaceState(null, "", "/dashboard/reports");
  overview.mockReset();
  overview.mockImplementation(async (params) => ({
    data: { ...data, period: { ...data.period, ...params } },
  }));
});
describe("经营报表范围与追溯", () => {
  it("毛利使用CNY，期间保留至销售明细，当前风险连接原业务页面", async () => {
    render(<BusinessReportsPage />);
    expect(await screen.findByText("¥200.00")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "查看低库存商品" }),
    ).toHaveAttribute("href", "/dashboard/products?lowStock=true");
    expect(
      screen.getByRole("link", { name: "查看发运超过30天未收明细" }),
    ).toHaveAttribute(
      "href",
      "/dashboard/payments?tab=receivable&overdue=true",
    );
    fireEvent.change(screen.getByLabelText("发运开始日期"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("发运结束日期"), {
      target: { value: "2026-09-30" },
    });
    await userEvent.click(screen.getByRole("button", { name: "应用期间" }));
    await waitFor(() =>
      expect(overview).toHaveBeenLastCalledWith({
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      }),
    );
    expect(
      screen.getByRole("link", { name: "查看发运销售明细" }),
    ).toHaveAttribute(
      "href",
      "/dashboard/sales?shipped=true&shippedFrom=2026-09-01&shippedTo=2026-09-30",
    );
  });
  it("未知利润显示待核验及单柜修正入口，不显示零", async () => {
    overview.mockResolvedValue({
      data: {
        ...data,
        overview: {
          ...data.overview,
          totalSales: null,
          grossProfit: null,
          profitMargin: null,
          marginReady: false,
          unavailableContracts: [
            { id: "synthetic-sale", reasons: ["缺少汇率"] },
          ],
        },
      },
    });
    render(<BusinessReportsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("毛利待核验");
    expect(
      screen.getByRole("link", { name: "核验第1笔：缺少汇率" }),
    ).toHaveAttribute("href", "/dashboard/sales/synthetic-sale?tab=finance");
    expect(screen.queryByText("¥0.00")).not.toBeInTheDocument();
  });
});
