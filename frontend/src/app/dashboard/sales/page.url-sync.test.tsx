/**
 * Input: 出口合同页面、可变 URL 参数、延迟的合成列表请求
 * Output: URL 同步（含 q 为空而 keyword 有值的首屏）、URL 变化时进入加载态并以最终参数取数、旧响应不覆盖新结果的回归测试
 * Pos: 出口合同列表 URL 同步与加载态回归测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import SalesPage from "./page";

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
const mockGetAll = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/sales",
  useSearchParams: () => nav.params,
}));
vi.mock("@/services/sales.service", () => ({
  salesService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    delete: vi.fn(),
  },
}));
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));
vi.mock("@/lib/api-cache", () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));
vi.mock("@/components/batch-import", () => ({ BatchImportDialog: () => null }));

function defer<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

const contract = (contractNo: string) => ({
  id: contractNo,
  contractNo,
  status: "DRAFT",
  customer: { name: "合成客户" },
  totalAmount: 100,
  currency: "USD",
  createdAt: "2026-10-01T00:00:00.000Z",
  containers: [],
  items: [],
});
const listResponse = (contractNo: string) => ({
  data: {
    items: [contract(contractNo)],
    pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
  },
});

describe("出口合同列表 URL 同步", () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockToastError.mockReset();
    nav.params = new URLSearchParams();
  });

  it("q 为空而 keyword 有值时，与原挂载同步一致以 q 为准（不带关键词取数）", async () => {
    nav.params = new URLSearchParams("q=&keyword=old");
    mockGetAll.mockResolvedValue(listResponse("SC-EMPTY-Q"));
    render(<SalesPage />);

    expect(await screen.findAllByText("SC-EMPTY-Q")).not.toHaveLength(0);
    const lastCall = mockGetAll.mock.calls.at(-1)?.[0] as { keyword?: string };
    expect(lastCall.keyword).toBeUndefined();
    expect(screen.getByPlaceholderText(/搜索/)).toHaveValue("");
  });

  it("URL 变化时以最终 URL 参数取数，旧请求晚到不覆盖新结果", async () => {
    const initial = defer<unknown>();
    const next = defer<unknown>();
    mockGetAll.mockImplementation(
      (params: { page: number; status?: string }) =>
        params.status === "SHIPPED" && params.page === 2
          ? next.promise
          : initial.promise,
    );
    const view = render(<SalesPage />);
    await waitFor(() => expect(mockGetAll).toHaveBeenCalled());

    nav.params = new URLSearchParams("status=SHIPPED&page=2&q=abc");
    view.rerender(<SalesPage />);
    await waitFor(() =>
      expect(mockGetAll).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 2,
          keyword: "abc",
          status: "SHIPPED",
        }),
      ),
    );

    await act(async () => {
      next.resolve(listResponse("SC-NEW"));
    });
    expect(await screen.findAllByText("SC-NEW")).not.toHaveLength(0);
    await act(async () => {
      initial.reject(new Error("old failed"));
    });
    expect(screen.queryAllByText("SC-NEW")).not.toHaveLength(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
