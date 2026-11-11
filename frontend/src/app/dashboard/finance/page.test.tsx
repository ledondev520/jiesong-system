/**
 * Input: 财务概览页面、finance stats、汇率、银行流水和发票统计 Interface
 * Output: 财务概览页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { clearAllCache } from "@/lib/api-cache";
import FinancePage from "./page";
import { useAuthStore } from "@/store/auth.store";
import { Role, type User } from "@/types";

const asRole = (role: Role) =>
  useAuthStore.setState({ user: { id: "u1", role } as User });

const mockGetStats = vi.fn();
const mockApiGet = vi.fn();
const mockGetTransactionStats = vi.fn();
const mockGetInvoiceStats = vi.fn();
const mockClearApiGetCache = vi.fn();

vi.mock("@/services/finance.service", () => ({
  financeService: {
    getStats: (...args: unknown[]) => mockGetStats(...args),
  },
}));

vi.mock("@/lib/axios", () => ({
  clearApiGetCache: () => mockClearApiGetCache(),
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

vi.mock("@/services/bankFlow.service", () => ({
  getTransactionStats: (...args: unknown[]) => mockGetTransactionStats(...args),
  getInvoiceStats: (...args: unknown[]) => mockGetInvoiceStats(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/dashboard/finance",
}));

vi.mock("./components/FinanceOverviewCharts", () => ({
  default: () => (
    <div data-testid="finance-overview-charts">
      <span>收支对比</span>
      <span>现金流预测</span>
    </div>
  ),
}));

vi.mock("./components/MonthlyStatementsTrend", () => ({
  default: () => <div data-testid="monthly-statements-trend-stub" />,
}));

describe("FinancePage 交互逻辑", () => {
  beforeEach(() => {
    asRole(Role.FINANCE);
    clearAllCache();
    mockClearApiGetCache.mockReset();
    mockGetStats.mockReset();
    mockApiGet.mockReset();
    mockGetTransactionStats.mockReset();
    mockGetInvoiceStats.mockReset();
    mockGetTransactionStats.mockResolvedValue({
      totalIn: 0,
      totalOut: 0,
      netFlow: 0,
      txnCount: 0,
    });
    mockGetInvoiceStats.mockResolvedValue({
      validTotal: 0,
      validTax: 0,
      validAmount: 0,
      validCount: 0,
      reversedCount: 0,
      totalCount: 0,
    });
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes("/system/exchange-rate")) {
        return Promise.resolve({
          data: { rate: 6.8, buffer: 0.2, effectiveRate: 6.6 },
        });
      }
      if (url.includes("/finance/payment-trends")) {
        return Promise.resolve({
          data: [
            { label: "上期", receivables: 800, payables: 300 },
            { label: "本期", receivables: 1000, payables: 400 },
          ],
        });
      }
      if (url.includes("/finance/overdue-receivables")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: null });
    });
  });

  it("图表库通过延迟加载的内部 Module 隔离", () => {
    const pageSource = readFileSync(
      "src/app/dashboard/finance/page.tsx",
      "utf8",
    );

    // Quote-agnostic: Prettier owns the quote style of page.tsx.
    expect(pageSource).not.toMatch(/from ["']recharts["']/);
    expect(pageSource).toMatch(
      /import\(["']\.\/components\/FinanceOverviewCharts["']\)/,
    );
  });

  it("概览页同时渲染月度财务报表趋势，且图表库只经延迟加载的内部 Module 引入 (B41)", async () => {
    mockGetStats.mockResolvedValue({
      payable: { total: 1200, paid: 400, unpaid: 800 },
      receivable: { total: 3200, received: 1000, unreceived: 2200 },
    });
    render(<FinancePage />);
    expect(
      await screen.findByTestId("monthly-statements-trend-stub"),
    ).toBeInTheDocument();
    const pageSource = readFileSync(
      "src/app/dashboard/finance/page.tsx",
      "utf8",
    );
    expect(pageSource).toMatch(
      /import\(["']\.\/components\/MonthlyStatementsTrend["']\)/,
    );
  });

  it("只有一个月数据时写「无上期数据」而不是「环比持平」，并解释结算汇率 (B44)", async () => {
    mockGetStats.mockResolvedValue({
      payable: { total: 400, paid: 0, unpaid: 400 },
      receivable: { total: 1000, received: 0, unreceived: 1000 },
    });
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes("/system/exchange-rate"))
        return Promise.resolve({
          data: { rate: 6.8, buffer: 0.2, effectiveRate: 6.6 },
        });
      if (url.includes("/finance/payment-trends"))
        return Promise.resolve({
          data: [{ label: "本期", receivables: 1000, payables: 400 }],
        });
      return Promise.resolve({ data: url.includes("overdue") ? [] : null });
    });
    render(<FinancePage />);
    expect((await screen.findAllByText("无上期数据")).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText("环比持平")).toBeNull();
    expect(
      screen.getByText(/结算汇率 = 市场汇率 − 风险缓冲/),
    ).toBeInTheDocument();
  });

  it("金额统一两位小数：整数/一位小数的金额也补齐到 .00/.30 (B41)", async () => {
    mockGetStats.mockResolvedValue({
      payable: { total: 306482.3, paid: 1000, unpaid: 305482.3 },
      receivable: {
        total: 2161308.3,
        received: 780309.38,
        unreceived: 1380998.92,
      },
    });
    render(<FinancePage />);
    expect((await screen.findAllByText(/306,482\.30/)).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(/2,161,308\.30/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,000\.00/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/306,482\.3(?!\d)/)).toBeNull();
  });

  it("加载完成后展示统计信息", async () => {
    mockGetStats.mockResolvedValue({
      payable: { total: 1200, paid: 400, unpaid: 800 },
      receivable: { total: 3200, received: 1000, unreceived: 2200 },
    });

    render(<FinancePage />);

    await waitFor(
      () => {
        expect(
          screen.getByRole("heading", { name: "财务概览" }),
        ).toBeInTheDocument();
        expect(screen.getByText("应付账款总额")).toBeInTheDocument();
        expect(screen.getByText("待收账款")).toBeInTheDocument();
        expect(screen.getByText(/当前客户剩余欠款/)).toBeInTheDocument();
        // OD-5：两个应收口径并存，概览页的数字按合同表头口径，必须写明
        expect(screen.getByText(/合同表头口径 · 完成率/)).toBeInTheDocument();
        expect(
          screen.getByText(/合同表头口径 · 当前客户剩余欠款/),
        ).toBeInTheDocument();
        expect(screen.getByText("财务报表分析")).toBeInTheDocument();
        expect(
          screen.getByRole("link", { name: /查看报表分析/ }),
        ).toHaveAttribute("href", "/dashboard/finance/statements");
        expect(
          screen.queryByTestId("financial-statements-section"),
        ).not.toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    expect(
      await screen.findByTestId("finance-overview-charts", undefined, {
        timeout: 15000,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("收支对比")).toBeInTheDocument();
    expect(screen.getByText("现金流预测")).toBeInTheDocument();
  });

  it("待收账款未超过50%时走正常分支：不显示「需跟进」与催办文案 (A62-F1)", async () => {
    mockGetStats.mockResolvedValue({
      payable: { total: 1200, paid: 400, unpaid: 800 },
      receivable: { total: 3200, received: 2000, unreceived: 1200 },
    });

    render(<FinancePage />);

    expect(
      await screen.findByText("合同表头口径 · 当前客户剩余欠款", undefined, {
        timeout: 5000,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/建议优先跟进/)).not.toBeInTheDocument();
    expect(screen.queryByText("需跟进")).not.toBeInTheDocument();
  });

  it("SALES 不请求银行/发票统计，也看不到会得到 403 的报表/流水/发票入口", async () => {
    asRole(Role.SALES);
    mockGetStats.mockResolvedValue({
      payable: { total: 1200, paid: 400, unpaid: 800 },
      receivable: { total: 3200, received: 1000, unreceived: 2200 },
    });
    render(<FinancePage />);
    await screen.findByText("应付账款总额");
    expect(mockGetTransactionStats).not.toHaveBeenCalled();
    expect(mockGetInvoiceStats).not.toHaveBeenCalled();
    for (const href of ["statements", "bank-flow", "invoices"]) {
      expect(
        document.querySelector(`a[href="/dashboard/finance/${href}"]`),
      ).toBeNull();
    }
    expect(
      mockApiGet.mock.calls.some(([url]) => String(url).includes("statements")),
    ).toBe(false);
  });

  it.each([Role.SALES, Role.PURCHASE])(
    "%s 看不到会得到 403 的月度趋势卡片",
    async (role) => {
      asRole(role);
      mockGetStats.mockResolvedValue({
        payable: { total: 1200, paid: 400, unpaid: 800 },
        receivable: { total: 3200, received: 1000, unreceived: 2200 },
      });
      render(<FinancePage />);
      await screen.findByText("应付账款总额");
      expect(screen.queryByTestId("monthly-statements-trend-stub")).toBeNull();
    },
  );

  it("初始加载中会显示加载文案", () => {
    mockGetStats.mockReturnValue(new Promise(() => {}));
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<FinancePage />);
    expect(screen.getByText("加载中...")).toBeInTheDocument();
  });

  it("手动刷新失效两层缓存并重新读取财务统计", async () => {
    mockGetStats.mockResolvedValue({
      payable: { total: 0, paid: 0, unpaid: 0 },
      receivable: { total: 0, received: 0, unreceived: 0 },
    });
    const user = userEvent.setup();
    render(<FinancePage />);
    await user.click(await screen.findByRole("button", { name: "刷新" }));

    await waitFor(() => expect(mockGetStats).toHaveBeenCalledTimes(2));
    expect(mockClearApiGetCache).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledTimes(6);
  });
});
