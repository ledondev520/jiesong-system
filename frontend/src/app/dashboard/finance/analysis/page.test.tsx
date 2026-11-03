import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BusinessReportsPage from "./page";

vi.mock(
  "@/components/ui/date-picker",
  () => import("@/test/date-string-picker-mock"),
);
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
    marginReasonSummary: [],
    cashReasonSummary: [],
    verified: { contractCount: 1, totalPurchases: 500, grossProfit: 200 },
    shippedWithoutDate: 0,
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
    ).toHaveAttribute("href", "/dashboard/finance/receivable?overdue=true");
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
  it("未知利润显示待核验、每笔缺哪项输入、按原因笔数和已核实汇总，不显示零", async () => {
    overview.mockResolvedValue({
      data: {
        ...data,
        overview: {
          ...data.overview,
          totalSales: null,
          grossProfit: null,
          profitMargin: null,
          marginReady: false,
          cashReady: false,
          contractCount: 3,
          unavailableContracts: [
            {
              id: "synthetic-sale",
              contractNo: "EXP-SYN-1",
              reasons: ["缺汇率"],
              reasonCodes: ["MISSING_EXCHANGE_RATE"],
            },
            {
              id: "synthetic-sale-2",
              contractNo: "EXP-SYN-2",
              reasons: ["缺汇率", "缺已售成本（1/1 条自有明细未填成本）"],
              reasonCodes: ["MISSING_EXCHANGE_RATE", "MISSING_PURCHASE_COST"],
            },
          ],
          marginReasonSummary: [
            { code: "MISSING_EXCHANGE_RATE", label: "缺汇率", count: 2 },
            { code: "MISSING_PURCHASE_COST", label: "缺已售成本", count: 1 },
          ],
          cashReasonSummary: [
            { code: "MISSING_EXCHANGE_RATE", label: "缺汇率", count: 2 },
            {
              code: "UNSUPPORTED_RECEIPT_CURRENCY",
              label: "含非美元收款",
              count: 1,
            },
          ],
          verified: { contractCount: 1, totalPurchases: 500, grossProfit: 200 },
          shippedWithoutDate: 2,
        },
      },
    });
    render(<BusinessReportsPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("毛利待核验");
    expect(alert).toHaveTextContent("3 笔发运中有 2 笔缺少资料");
    expect(screen.getByTestId("margin-reason-summary")).toHaveTextContent(
      "缺汇率 2 笔、缺已售成本 1 笔",
    );
    expect(screen.getByTestId("margin-verified")).toHaveTextContent(
      "另外 1 笔已核实：采购成本 ¥500.00，毛利 ¥200.00（仅这几笔，不是整体数字）",
    );
    expect(screen.getByTestId("shipped-without-date")).toHaveTextContent(
      "另有 2 笔状态为已发运但没有发运日期",
    );
    // 不再是笼统的「缺少汇率或已售成本」
    expect(alert).not.toHaveTextContent("缺少汇率或已售成本");
    await userEvent.click(screen.getByText("查看清单（2 笔）"));
    expect(
      screen.getByRole("link", { name: "EXP-SYN-1：缺汇率" }),
    ).toHaveAttribute("href", "/dashboard/sales/synthetic-sale?tab=finance");
    expect(
      screen.getByRole("link", {
        name: "EXP-SYN-2：缺汇率；缺已售成本（1/1 条自有明细未填成本）",
      }),
    ).toBeInTheDocument();
    // 净现金待核验也点名原因
    expect(
      screen.getByText(/现金占用待核验：缺汇率 2 笔、含非美元收款 1 笔/),
    ).toBeInTheDocument();
    expect(screen.queryByText("¥0.00")).not.toBeInTheDocument();
  });
});
