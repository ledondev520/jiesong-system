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
