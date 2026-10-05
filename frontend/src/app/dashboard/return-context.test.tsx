/**
 * Input: 工作台/经营执行真实组件、原生历史与合成只读服务
 * Output: 明细返回、重新挂载、历史查询、日期草稿及晚到请求回归
 * Pos: 经营中台返回上下文的组件路由验收
 */
import { useSyncExternalStore, type ComponentProps } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import DashboardPage from "./page";
import BusinessReportsPage from "./reports/page";
import type { BusinessOverview } from "@/services/reports.service";

const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    notify,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      window.addEventListener("popstate", listener);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("popstate", listener);
      };
    },
    nextQuery: null as string | null,
    push: vi.fn((href: string) => window.history.pushState(null, "", href)),
    workflows: vi.fn(),
    overview: vi.fn(),
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, back: () => window.history.back() }),
  useSearchParams: () => {
    const href = useSyncExternalStore(
      mocks.subscribe,
      () => window.location.href,
    );
    return new URLSearchParams(mocks.nextQuery ?? new URL(href).search);
  },
  usePathname: () =>
    useSyncExternalStore(mocks.subscribe, () => window.location.pathname),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        mocks.push(String(href));
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/store/auth.store", () => ({
  useAuthStore: () => ({
    user: { id: "qa-admin", role: "ADMIN", name: "合成管理员" },
  }),
}));
vi.mock("@/services/ai.service", () => ({
  aiService: {
    getDashboardAnalytics: async () => ({
      data: {
        contracts: { sales: { receivable: 0 }, purchase: { unpaidAmount: 0 } },
        inventory: { recordCount: 0 },
      },
    }),
  },
}));
vi.mock("@/services/financialStatements.service", () => ({
  financialStatementsService: { listStatements: async () => [] },
}));
vi.mock("@/services/tradeWorkflow.service", () => ({
  tradeWorkflowService: {
    syncStatus: async () => ({ data: { state: "current", conflicts: 0 } }),
    list: mocks.workflows,
  },
}));
vi.mock("@/services/reports.service", () => ({
  reportsService: { getBusinessOverview: mocks.overview },
}));
vi.mock("recharts", () => {
  const Container = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Bar: () => null,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
    ResponsiveContainer: Container,
    ComposedChart: Container,
  };
});

const report = (
  period: { startDate?: string; endDate?: string } = {},
  count = 1,
): { data: BusinessOverview } => ({
  data: {
    period: {
      startDate: period.startDate || null,
      endDate: period.endDate || null,
      dateField: "shippedAt",
    },
    overview: {
      totalSales: 700,
      totalPurchases: 500,
      grossProfit: 200,
      profitMargin: 2 / 7,
      marginReady: true,
      cashReady: true,
      currency: "CNY",
      contractCount: count,
      netCashCny: 0,
      scope: "合成商品口径",
      unavailableContracts: [],
    },
    funds: {
      totalReceivable: 0,
      totalPayable: 0,
      overdueReceivable: 0,
      overduePayable: 0,
      overdueRule: "合成风险口径",
    },
    inventory: { totalItems: 0, lowStockItems: 0, inTransitContainers: 0 },
    trends: { monthlySales: [] },
  },
});
const workflows = (name: string) => ({
  data: [
    {
      id: name,
      contractNo: name,
      purchaseContractNos: [],
      completedStageCount: 0,
      stageCount: 1,
      stages: [
        { key: "qa", label: "合成阶段", status: "blocked", reason: "合成阻塞" },
      ],
      nextAction: { label: "查看合成详情", href: "/dashboard/sales/qa" },
      issues: [],
    },
  ],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function Routes() {
  const path = useSyncExternalStore(
    mocks.subscribe,
    () => window.location.pathname,
  );
  if (path === "/dashboard") return <DashboardPage />;
  if (path === "/dashboard/reports") return <BusinessReportsPage />;
  return <h1>合成销售明细</h1>;
}
const replace = window.history.replaceState.bind(window.history);
const push = window.history.pushState.bind(window.history);
beforeAll(() => {
  // 模拟 Next 原生 history 补丁；查询快照可故意延迟，浏览器地址仍立即更新。
  window.history.replaceState = (...args) => {
    replace(...args);
    mocks.notify();
  };
  window.history.pushState = (...args) => {
    push(...args);
    mocks.notify();
  };
});
afterAll(() => {
  window.history.replaceState = replace;
  window.history.pushState = push;
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.nextQuery = null;
  window.history.replaceState(null, "", "/dashboard");
  mocks.workflows.mockImplementation(async (_limit, scope) =>
    workflows(`QA-${scope}`),
  );
  mocks.overview.mockImplementation(async (period) =>
    report(period, period.startDate || period.endDate ? 1 : 46),
  );
});
const selectScope = (name: string) => screen.getByRole("button", { name });
const apply = () => screen.getByRole("button", { name: "应用期间" });
const reset = () => screen.getByRole("button", { name: "全部期间" });
const start = () => screen.getByLabelText("发运开始日期");
const end = () => screen.getByLabelText("发运结束日期");
const editDates = (from: string, to: string) => {
  fireEvent.change(start(), { target: { value: from } });
  fireEvent.change(end(), { target: { value: to } });
};
const summary = () => screen.getByText(/^发运期间：/);

describe("工作台范围返回上下文", () => {
  it("阻塞→查看全部→Back/Forward保留范围，重新挂载仍恢复", async () => {
    window.history.replaceState(null, "", "/dashboard?source=qa#tasks");
    const view = render(<Routes />);
    await screen.findByText("QA-recent");
    await userEvent.click(selectScope("阻塞"));
    await screen.findByText("QA-blocked");
    await userEvent.click(screen.getByRole("button", { name: "查看全部" }));
    expect(
      await screen.findByRole("heading", { name: "合成销售明细" }),
    ).toBeInTheDocument();
    act(() => window.history.back());
    await screen.findByText("QA-blocked");
    expect(selectScope("阻塞")).toHaveAttribute("aria-pressed", "true");
    expect(
      new URLSearchParams(window.location.search).get("workflowView"),
    ).toBe("blocked");
    expect(window.location.hash).toBe("#tasks");
    expect(new URLSearchParams(window.location.search).get("source")).toBe(
      "qa",
    );

    act(() => window.history.forward());
    await screen.findByRole("heading", { name: "合成销售明细" });
    act(() => window.history.back());
    await screen.findByText("QA-blocked");
    view.unmount();
    render(<Routes />);
    await screen.findByText("QA-blocked");
  });
  it.each(["pending", "blocked", "risk"])(
    "有效深链接 %s 首次查询采用所选范围",
    async (scope) => {
      window.history.replaceState(null, "", `/dashboard?workflowView=${scope}`);
      render(<Routes />);
      await screen.findByText(`QA-${scope}`);
      expect(mocks.workflows).toHaveBeenCalledTimes(1);
      expect(mocks.workflows).toHaveBeenCalledWith(6, scope);
    },
  );
  it("无效范围安全回到最近更新，选择最近更新清除参数而保留来源", async () => {
    window.history.replaceState(
      null,
      "",
      "/dashboard?source=qa&workflowView=invalid",
    );
    render(<Routes />);
    await screen.findByText("QA-recent");
    expect(window.location.search).toContain("workflowView=invalid");
    await userEvent.click(selectScope("阻塞"));
    await screen.findByText("QA-blocked");
    await userEvent.click(selectScope("最近更新"));
    await screen.findByText("QA-recent");
    expect(window.location.search).toBe("?source=qa");
  });
  it("实际历史查询优先于延迟Next快照，快速选择后晚到结果不覆盖当前范围", async () => {
    const old = deferred<ReturnType<typeof workflows>>();
    mocks.workflows.mockImplementation((_limit, scope) =>
      scope === "blocked"
        ? old.promise
        : Promise.resolve(workflows(`QA-${scope}`)),
    );
    mocks.nextQuery = "?workflowView=recent";
    render(<Routes />);
    await screen.findByText("QA-recent");
    await userEvent.click(selectScope("阻塞"));
    await userEvent.click(selectScope("风险优先"));
    await screen.findByText("QA-risk");
    await act(async () => old.resolve(workflows("QA-old-blocked")));
    expect(screen.queryByText("QA-old-blocked")).not.toBeInTheDocument();
    act(() =>
      window.history.pushState(null, "", "/dashboard?workflowView=pending"),
    );
    await screen.findByText("QA-pending");
    act(() => window.history.back());
    await screen.findByText("QA-risk");
    act(() => window.history.forward());
    await screen.findByText("QA-pending");
    expect(window.location.search).toBe("?workflowView=pending");
  });
});

describe("经营执行应用期间返回上下文", () => {
  it("草稿不应用；已应用期间→销售明细→Back/Forward和重新挂载保持日期/报表", async () => {
    window.history.replaceState(
      null,
      "",
      "/dashboard/reports?source=qa#report",
    );
    const view = render(<Routes />);
    await screen.findByText("¥200.00");
    editDates("2026-10-05", "2026-10-05");
    expect(mocks.overview).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?source=qa");
    expect(summary()).toHaveTextContent("共 46 笔");
    await userEvent.click(apply());
    await waitFor(() =>
      expect(summary()).toHaveTextContent("2026-10-05 至 2026-10-05，共 1 笔"),
    );
    editDates("2026-11-01", "2026-11-30");
    const detail = screen.getByRole("link", {
      name: "查看发运销售明细",
    });
    expect(detail).toHaveAttribute(
      "href",
      "/dashboard/sales?shipped=true&shippedFrom=2026-10-05&shippedTo=2026-10-05",
    );
    await userEvent.click(detail);
    await screen.findByRole("heading", { name: "合成销售明细" });
    act(() => window.history.back());
    await screen.findByText("¥200.00");
    expect(start()).toHaveValue("2026-10-05");
    expect(end()).toHaveValue("2026-10-05");
    expect(summary()).toHaveTextContent("共 1 笔");
    expect(window.location.search).toBe(
      "?source=qa&startDate=2026-10-05&endDate=2026-10-05",
    );
    expect(window.location.hash).toBe("#report");

    act(() => window.history.forward());
    await screen.findByRole("heading", { name: "合成销售明细" });
    act(() => window.history.back());
    await screen.findByText("¥200.00");
    view.unmount();
    render(<Routes />);
    await screen.findByText("¥200.00");
    expect(start()).toHaveValue("2026-10-05");
    expect(summary()).toHaveTextContent("共 1 笔");
    await userEvent.click(reset());
    await waitFor(() => expect(summary()).toHaveTextContent("共 46 笔"));
    expect(start()).toHaveValue("");
    expect(end()).toHaveValue("");
    expect(window.location.search).toBe("?source=qa");
    expect(window.location.hash).toBe("#report");
  });
  it.each([
    ["?startDate=2024-02-29", { startDate: "2024-02-29" }],
    ["?endDate=2026-10-05", { endDate: "2026-10-05" }],
    ["?startDate=2026-02-29&endDate=2026-10-05", {}],
    ["?startDate=not-a-date", {}],
    ["?startDate=2026-10-06&endDate=2026-10-05", {}],
  ])("日期查询 %s 只提交有效日期范围", async (query, period) => {
    window.history.replaceState(null, "", "/dashboard/reports" + query);
    render(<Routes />);
    await screen.findByText("¥200.00");
    expect(mocks.overview).toHaveBeenCalledTimes(1);
    expect(mocks.overview).toHaveBeenCalledWith(period);
    expect(start()).toHaveValue("startDate" in period ? period.startDate : "");
    expect(end()).toHaveValue("endDate" in period ? period.endDate : "");
    expect(window.location.search).toBe(query);
  });
  it("历史切换恢复期间及草稿，延迟Next快照不回写旧日期", async () => {
    window.history.replaceState(
      null,
      "",
      "/dashboard/reports?startDate=2026-10-05&endDate=2026-10-05",
    );
    mocks.nextQuery = "?startDate=2026-10-05&endDate=2026-10-05";
    render(<Routes />);
    await screen.findByText("¥200.00");
    editDates("2026-11-01", "2026-11-30");
    act(() =>
      window.history.pushState(
        null,
        "",
        "/dashboard/reports?endDate=2026-12-31",
      ),
    );
    await waitFor(() =>
      expect(summary()).toHaveTextContent("最早 至 2026-12-31"),
    );
    expect(start()).toHaveValue("");
    expect(end()).toHaveValue("2026-12-31");
    act(() => window.history.back());
    await waitFor(() =>
      expect(summary()).toHaveTextContent("2026-10-05 至 2026-10-05"),
    );
    expect(start()).toHaveValue("2026-10-05");
    expect(end()).toHaveValue("2026-10-05");
    act(() => window.history.forward());
    await waitFor(() => expect(end()).toHaveValue("2026-12-31"));
    expect(window.location.search).toBe("?endDate=2026-12-31");
  });
  it.each(["success", "failure"])(
    "应用后立即重置，晚到 %s 不覆盖最新期间/状态",
    async (outcome) => {
      const old = deferred<ReturnType<typeof report>>();
      mocks.overview.mockImplementation((period) =>
        period.startDate ? old.promise : Promise.resolve(report({}, 46)),
      );
      window.history.replaceState(null, "", "/dashboard/reports");
      render(<Routes />);
      await screen.findByText("¥200.00");
      editDates("2026-10-05", "2026-10-05");
      await userEvent.click(apply());
      await waitFor(() =>
        expect(mocks.overview).toHaveBeenCalledWith({
          startDate: "2026-10-05",
          endDate: "2026-10-05",
        }),
      );
      await userEvent.click(reset());
      await waitFor(() => expect(apply()).toBeEnabled());
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      await act(async () =>
        outcome === "success"
          ? old.resolve(
              report({ startDate: "2026-10-05", endDate: "2026-10-05" }),
            )
          : old.reject(new Error("synthetic stale failure")),
      );
      expect(summary()).toHaveTextContent("最早 至 当前，共 46 笔");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(apply()).toBeEnabled();
      expect(log).not.toHaveBeenCalled();
      log.mockRestore();
    },
  );
  it("日期草稿倒序时禁用应用，重置后恢复", async () => {
    window.history.replaceState(null, "", "/dashboard/reports");
    render(<Routes />);
    await screen.findByText("¥200.00");
    editDates("2026-10-06", "2026-10-05");
    expect(apply()).toBeDisabled();
    expect(mocks.overview).toHaveBeenCalledTimes(1);
    await userEvent.click(reset());
    expect(apply()).toBeEnabled();
    expect(start()).toHaveValue("");
  });
});
