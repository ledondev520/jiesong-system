/** 订单列表：URL 筛选变化时只显示当前 URL 的结果；迟到的旧响应（成功或失败）不覆盖新结果（评审 R1-4，移植自旧 /sales URL 同步测试）。 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import OrdersPage from "./page";

const mocks = vi.hoisted(() => ({ getAll: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/services/sales.service", () => ({
  salesService: { getAll: mocks.getAll },
}));
vi.mock("@/lib/hooks/useBusinessReadOnly", () => ({
  useBusinessReadOnly: () => false,
  BusinessWrite: ({ children }: { children: React.ReactNode }) => children,
}));

const defer = () => {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};
const reply = (contractNo: string) => ({
  data: {
    items: [
      {
        id: contractNo,
        contractNo,
        status: "DRAFT",
        totalAmount: 1,
        receivedAmount: 0,
        customer: { id: "c1", name: "合成客户" },
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ],
    pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/dashboard/orders");
});

describe.each(["success", "failure"] as const)(
  "late response of the old filter (%s)",
  (kind) => {
    it("never replaces the rows of the current URL", async () => {
      const unfiltered = defer();
      mocks.getAll.mockImplementation((params: { keyword?: string }) =>
        params.keyword === "x"
          ? Promise.resolve(reply("SC-NEW"))
          : unfiltered.promise,
      );
      render(<OrdersPage />);
      fireEvent.change(screen.getByPlaceholderText(/搜索订单号/), {
        target: { value: "x" },
      });
      expect((await screen.findAllByText("SC-NEW")).length).toBeGreaterThan(0);
      expect(screen.getAllByText("合成客户").length).toBeGreaterThan(0);
      expect(window.location.search).toContain("q=x");

      await act(async () =>
        kind === "success"
          ? unfiltered.resolve(reply("SC-OLD"))
          : unfiltered.reject(new Error("old failed")),
      );
      expect(screen.queryByText("SC-OLD")).toBeNull();
      expect(screen.getAllByText("SC-NEW").length).toBeGreaterThan(0);
      expect(screen.queryByText(/加载订单失败/)).toBeNull();
      expect(screen.queryByRole("progressbar")).toBeNull();
    });
  },
);

it("browser back/forward to another URL shows only that URL's rows", async () => {
  const first = defer();
  mocks.getAll.mockImplementation((params: { keyword?: string }) =>
    params.keyword === "b" ? Promise.resolve(reply("SC-B")) : first.promise,
  );
  window.history.replaceState({}, "", "/dashboard/orders?q=a");
  render(<OrdersPage />);
  await act(async () => {
    window.history.pushState({}, "", "/dashboard/orders?q=b");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect((await screen.findAllByText("SC-B")).length).toBeGreaterThan(0);
  await act(async () => first.resolve(reply("SC-A")));
  expect(screen.queryByText("SC-A")).toBeNull();
  expect(mocks.getAll).toHaveBeenLastCalledWith(
    expect.objectContaining({ keyword: "b" }),
  );
});

it("发运前订单显示利用率徽章：达标「利用率达标」、未达「未达80%」，已发运不显示（#124）", async () => {
  const util = (ready: boolean, volumePct: number) => ({
    containerType: "40HQ",
    thresholdPct: 80,
    weightPct: 4.5,
    volumePct,
    utilisationReady: ready,
  });
  const row = (id: string, status: string, loadingUtilisation: unknown) => ({
    id,
    contractNo: id,
    status,
    totalAmount: 1,
    receivedAmount: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    loadingUtilisation,
  });
  mocks.getAll.mockResolvedValue({
    data: {
      items: [
        row("EXP-OK", "PACKING", util(true, 88.2)),
        row("EXP-LOW", "CONFIRMED", util(false, 14.7)),
        row("EXP-SHIPPED", "SHIPPED", util(false, 14.7)),
      ],
      pagination: { total: 3, page: 1, pageSize: 20, totalPages: 1 },
    },
  });
  render(<OrdersPage />);

  expect((await screen.findAllByText("利用率达标")).length).toBeGreaterThan(0);
  // 3 行中仅发运前两行有徽章（桌面表格 + 手机卡片各渲染一次，故按行数的倍数断言下限）
  expect(screen.getAllByText("未达80%").length).toBeGreaterThan(0);
  expect(screen.getAllByText("利用率达标")).toHaveLength(
    screen.getAllByText("未达80%").length,
  );
});

it("B55: 发运阶段 chips 带真实计数，点击切换 status 预设；列表有发运日期与预计到港列", async () => {
  const totals: Record<string, number> = {
    "": 9,
    CONFIRMED: 3,
    PACKING: 2,
    SHIPPED: 4,
    ARRIVED: 0,
  };
  mocks.getAll.mockImplementation(
    (params: { pageSize: number; status?: string }) =>
      Promise.resolve({
        data: {
          items:
            params.pageSize === 1
              ? []
              : [
                  {
                    id: "EXP-S",
                    contractNo: "EXP-S",
                    status: "SHIPPED",
                    totalAmount: 1,
                    receivedAmount: 0,
                    createdAt: "2026-10-01T00:00:00.000Z",
                    shippedAt: "2026-10-20T04:00:00.000Z",
                    estimatedArrival: "2026-11-15T04:00:00.000Z",
                    port: { id: "p", name: "洛杉矶" },
                  },
                ],
          pagination: {
            total: totals[params.status ?? ""],
            page: 1,
            pageSize: params.pageSize,
            totalPages: 1,
          },
        },
      }),
  );
  render(<OrdersPage />);
  const group = await screen.findByRole("group", { name: "发运阶段" });
  await screen.findAllByText("EXP-S");
  expect(screen.getByRole("button", { name: "待装柜3" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "装柜中2" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "已发运4" })).toBeInTheDocument();
  // 0 是真实计数，不是缺失
  expect(screen.getByRole("button", { name: "已到港0" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "全部9" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(group).toBeInTheDocument();
  expect(screen.getAllByText("2026-10-20").length).toBeGreaterThan(0);
  expect(screen.getAllByText("2026-11-15").length).toBeGreaterThan(0);
  expect(screen.getAllByText("洛杉矶").length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("button", { name: "已发运4" }));
  await act(async () => {});
  expect(window.location.search).toContain("status=SHIPPED");
  expect(screen.getByRole("button", { name: "已发运4" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(mocks.getAll).toHaveBeenCalledWith(
    expect.objectContaining({ status: "SHIPPED", pageSize: 20 }),
  );
});

it("B55: 计数请求失败时 chip 显示「—」而不是 0，列表仍可用", async () => {
  mocks.getAll.mockImplementation((params: { pageSize: number }) =>
    params.pageSize === 1
      ? Promise.reject(new Error("count failed"))
      : Promise.resolve(reply("EXP-OK")),
  );
  render(<OrdersPage />);
  expect((await screen.findAllByText("EXP-OK")).length).toBeGreaterThan(0);
  expect(
    await screen.findByRole("button", { name: "待装柜—" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "待装柜0" })).toBeNull();
});
