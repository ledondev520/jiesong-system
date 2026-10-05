/**
 * Input: 真实 lazy 报关组件、首次异步 act 初始化、合成导航与服务数据
 * Output: 列表/详情原生明确返回、缓存 canonical 查询与异步结果一致性回归
 * Pos: 退税工作台路由集成测试
 */

import { Suspense, useInsertionEffect, useSyncExternalStore } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TaxRefundListPageContent } from "./TaxRefundListPageContent";
import { CustomsDeclarationDetailPageContent } from "@/app/customs-declarations/components/CustomsDeclarationDetailPageContent";

const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      window.addEventListener("popstate", listener);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("popstate", listener);
      };
    },
    notify,
    searchSnapshot: null as string | null,
    router: {
      push: vi.fn((href: string) => {
        window.history.pushState({}, "", href);
        notify();
      }),
      replace: vi.fn((href: string) => {
        window.history.replaceState({}, "", href);
        notify();
      }),
      back: vi.fn(() => window.history.back()),
    },
    documentNavigate: vi.fn((href: string) => {
      // 合成新文档导航：不用 Next 缓存，重新读取当前请求查询。
      window.history.pushState({}, "", href);
      notify();
    }),
    customsGetAll: vi.fn(),
    customsGetById: vi.fn(),
    refundsGetAll: vi.fn(),
    toastError: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => {
    const query = useSyncExternalStore(
      mocks.subscribe,
      () => mocks.searchSnapshot ?? window.location.search,
    );
    return new URLSearchParams(query);
  },
  usePathname: () =>
    useSyncExternalStore(mocks.subscribe, () => window.location.pathname),
}));
vi.mock(
  "@/app/customs-declarations/components/customs-return-context",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/app/customs-declarations/components/customs-return-context")
    >()),
    navigateToCustomsList: mocks.documentNavigate,
  }),
);
vi.mock("@/services/customsDeclaration.service", () => ({
  customsDeclarationService: {
    getAll: mocks.customsGetAll,
    getById: mocks.customsGetById,
    generateDrafts: vi.fn(),
  },
}));
vi.mock("@/services/taxRefund.service", () => ({
  taxRefundService: {
    getAll: mocks.refundsGetAll,
    generateDrafts: vi.fn(),
  },
}));
vi.mock("@/lib/api-cache", () => ({
  cachedFetch: (_key: string, fetcher: () => unknown) => fetcher(),
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}));
vi.mock("./TaxRefundWorkbench", () => ({
  TaxRefundWorkbench: () => <h2>合成工作台</h2>,
}));

const detailParams = Promise.resolve({ id: "qa-customs" });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const listResponse = (declarationNo: string, total: number) => ({
  data: {
    items: [
      {
        id: declarationNo,
        declarationNo,
        status: "DRAFT",
        currency: "USD",
        totalAmount: 0,
      },
    ],
    pagination: { total },
  },
});

function TestRoutes() {
  const pathname = useSyncExternalStore(
    mocks.subscribe,
    () => window.location.pathname,
  );
  return (
    <Suspense fallback={<p>读取合成路由</p>}>
      {pathname === "/dashboard/customs-declarations/qa-customs" ? (
        <CustomsDeclarationDetailPageContent params={detailParams} />
      ) : (
        <TaxRefundListPageContent />
      )}
    </Suspense>
  );
}

describe("退税页签实际组件的路由流转", () => {
  beforeAll(async () => {
    // 冷模块转换属于测试准备，不能消耗首个 UI 查询的等待预算；仍使用真实 lazy 组件。
    const customsModule =
      await import("@/app/customs-declarations/components/CustomsDeclarationListPageContent");
    expect(customsModule.CustomsDeclarationListPageContent).toBeTypeOf(
      "function",
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchSnapshot = null;
    window.history.replaceState({}, "", "/dashboard/tax-refunds");
    const declaration = {
      id: "qa-customs",
      declarationNo: "QA-CUSTOMS",
      status: "DRAFT",
      currency: "USD",
      totalAmount: 0,
      items: [],
    };
    mocks.customsGetAll.mockResolvedValue({
      data: { items: [declaration], pagination: { total: 1 } },
    });
    mocks.customsGetById.mockResolvedValue({ data: declaration });
    mocks.refundsGetAll.mockResolvedValue({
      data: { items: [], pagination: { total: 0 } },
    });
  });

  it("报关详情返回后鼠标点击退税记录会切换 URL、选中页签与内容", async () => {
    const user = userEvent.setup();
    await act(async () => render(<TestRoutes />));
    // 首次页签激活才初始化真实 React.lazy；等待其 Suspense 工作，避免同步事件 act 遗留队列。
    await act(async () => {
      const customsTab = screen.getByRole("tab", { name: "报关单" });
      // Radix 的真实激活入口是未按 Ctrl 的左键 mouseDown；不替换 lazy 子组件。
      fireEvent.mouseDown(customsTab, { button: 0, ctrlKey: false });
      fireEvent.mouseUp(customsTab, { button: 0 });
      fireEvent.click(customsTab, { button: 0 });
    });
    expect(window.location.search).toBe("?view=customs");
    const detailButton = (
      await screen.findAllByRole("button", {
        name: /查看详情 QA-CUSTOMS/,
      })
    )[0];
    // 首次详情导航会使用真实 use(params) 并加载服务数据，同样等待该异步提交完成。
    await act(async () => {
      fireEvent.click(detailButton);
    });
    expect(window.location.pathname).toBe(
      "/dashboard/customs-declarations/qa-customs",
    );
    await user.click(await screen.findByRole("button", { name: "返回" }));
    await screen.findByRole("heading", { name: "报关单管理" });
    await user.click(screen.getByRole("tab", { name: "退税记录" }));
    expect(window.location.search).toBe("?view=refunds");
    expect(screen.getByRole("tab", { name: "退税记录" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() => expect(mocks.refundsGetAll).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "报关单管理" })).toBeNull();
    await user.click(screen.getByRole("tab", { name: "退税记录" }));
    expect(window.location.search).toBe("?view=refunds");
    await user.click(screen.getByRole("tab", { name: "退税工作台" }));
    expect(window.location.search).toBe("");
    expect(screen.getByRole("heading", { name: "合成工作台" })).toBeVisible();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(window.location.search).toBe("?view=customs"));
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(window.location.search).toBe("?view=refunds"));
  });

  it("Next 缓存误用旧 canonical 筛选时，明确返回走新文档恢复已验证的最新地址", async () => {
    const user = userEvent.setup();
    const returnTo =
      "/dashboard/tax-refunds?view=customs&source=qa&keyword=QA-CUSTOMS&status=DRAFT#rows";
    const staleUrl =
      "/dashboard/tax-refunds?view=customs&source=qa&keyword=OLD&status=RELEASED";
    window.history.replaceState(
      {},
      "",
      "/dashboard/customs-declarations/qa-customs?" +
        new URLSearchParams({ returnTo }),
    );
    const originalPush = mocks.router.push.getMockImplementation();
    mocks.router.push.mockImplementation(() => {
      window.history.pushState({}, "", staleUrl);
      mocks.notify();
    });
    try {
      await act(async () => render(<TestRoutes />));
      await user.click(await screen.findByRole("button", { name: "返回" }));
      expect(
        window.location.pathname +
          window.location.search +
          window.location.hash,
      ).toBe(returnTo);
      expect(mocks.documentNavigate).toHaveBeenCalledExactlyOnceWith(returnTo);
      expect(mocks.router.push).not.toHaveBeenCalled();
      await screen.findByDisplayValue("QA-CUSTOMS");
      expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("草稿");
    } finally {
      mocks.router.push.mockImplementation(originalPush!);
    }
  });

  it("关键词和状态筛选进入详情后，明确返回恢复最新浏览器上下文且可再次进入", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      {},
      "",
      "/dashboard/tax-refunds?view=customs&source=qa&keyword=OLD&status=RELEASED#declarations",
    );
    await act(async () => render(<TestRoutes />));
    const input = await screen.findByDisplayValue("OLD");
    // 详情入口必须采用已发布的实际地址，即使 Next 搜索快照仍滞后。
    mocks.searchSnapshot = window.location.search;
    await user.clear(input);
    await user.type(input, "QA-CUSTOMS");
    const expectedReturn =
      "/dashboard/tax-refunds?view=customs&source=qa&status=RELEASED&keyword=QA-CUSTOMS#declarations";
    for (let visit = 0; visit < 2; visit += 1) {
      const detailButton = await screen.findByRole("button", {
        name: "查看详情 QA-CUSTOMS",
      });
      await act(async () => {
        mocks.searchSnapshot = null;
      });
      await user.click(detailButton);
      expect(new URLSearchParams(window.location.search).get("returnTo")).toBe(
        expectedReturn,
      );
      await user.click(await screen.findByRole("button", { name: "返回" }));
      await screen.findByDisplayValue("QA-CUSTOMS");
      expect(
        window.location.pathname +
          window.location.search +
          window.location.hash,
      ).toBe(expectedReturn);
      expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("已放行");
      expect(screen.getByRole("tab", { name: "报关单" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await waitFor(() =>
        expect(mocks.customsGetAll).toHaveBeenLastCalledWith(
          expect.objectContaining({
            keyword: "QA-CUSTOMS",
            status: "RELEASED",
            page: 1,
          }),
        ),
      );
    }
  });

  it("刷新或直接打开含合法 returnTo 的详情仍可明确返回原筛选", async () => {
    const user = userEvent.setup();
    const returnTo =
      "/dashboard/tax-refunds?view=customs&source=qa&keyword=QA-CUSTOMS&status=DRAFT";
    window.history.replaceState(
      {},
      "",
      "/dashboard/customs-declarations/qa-customs?" +
        new URLSearchParams({ returnTo }),
    );
    await act(async () => render(<TestRoutes />));
    await user.click(await screen.findByRole("button", { name: "返回" }));
    await screen.findByDisplayValue("QA-CUSTOMS");
    expect(window.location.pathname + window.location.search).toBe(returnTo);
    expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("草稿");
  });

  it.each([
    null,
    "https://example.invalid/dashboard/tax-refunds?view=customs",
    "//example.invalid/dashboard/tax-refunds?view=customs",
    "%2Fdashboard%2Ftax-refunds%3Fview%3Dcustoms",
    "/dashboard/sales?keyword=QA",
    "/dashboard/tax-refunds?view=refunds",
  ])("直接详情 returnTo=%s 的明确返回只使用报关页签回退", async (returnTo) => {
    const user = userEvent.setup();
    const query =
      returnTo === null ? "" : "?" + new URLSearchParams({ returnTo });
    window.history.replaceState(
      {},
      "",
      "/dashboard/customs-declarations/qa-customs" + query,
    );
    await act(async () => render(<TestRoutes />));
    await user.click(await screen.findByRole("button", { name: "返回" }));
    expect(mocks.documentNavigate).toHaveBeenLastCalledWith(
      "/dashboard/tax-refunds?view=customs",
    );
    await screen.findByRole("heading", { name: "报关单管理" });
    expect(screen.getByPlaceholderText("搜索报关单号或报关行...")).toHaveValue(
      "",
    );
  });

  it("详情含重复 returnTo 时拒绝歧义并采用报关页签回退", async () => {
    const user = userEvent.setup();
    const query = new URLSearchParams({
      returnTo: "/dashboard/tax-refunds?view=customs&keyword=QA",
    });
    query.append("returnTo", "https://example.invalid");
    window.history.replaceState(
      {},
      "",
      "/dashboard/customs-declarations/qa-customs?" + query,
    );
    await act(async () => render(<TestRoutes />));
    await user.click(await screen.findByRole("button", { name: "返回" }));
    expect(mocks.documentNavigate).toHaveBeenLastCalledWith(
      "/dashboard/tax-refunds?view=customs",
    );
  });

  it("详情挂载后原生查询变更采用最新地址，不采用滞后的 Next 返回目标", async () => {
    const user = userEvent.setup();
    const oldReturn = "/dashboard/tax-refunds?view=customs&keyword=OLD";
    const newReturn =
      "/dashboard/tax-refunds?view=customs&keyword=NEW&status=RELEASED";
    window.history.replaceState(
      {},
      "",
      "/dashboard/customs-declarations/qa-customs?" +
        new URLSearchParams({ returnTo: oldReturn }),
    );
    await act(async () => render(<TestRoutes />));
    await screen.findByRole("button", { name: "返回" });
    mocks.searchSnapshot = window.location.search;
    await act(async () => {
      window.history.replaceState(
        {},
        "",
        "/dashboard/customs-declarations/qa-customs?" +
          new URLSearchParams({ returnTo: newReturn }),
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(mocks.documentNavigate).toHaveBeenLastCalledWith(newReturn);
  });

  it("挂载中的报关列表跟随历史 URL 的筛选变化，不用旧筛选覆写新 URL", async () => {
    window.history.replaceState(
      {},
      "",
      "/dashboard/tax-refunds?view=customs&source=qa&keyword=OLD",
    );
    await act(async () => render(<TestRoutes />));
    await screen.findByDisplayValue("OLD");
    await act(async () => {
      mocks.router.push(
        "/dashboard/tax-refunds?view=customs&source=qa&keyword=NEW&status=RELEASED",
      );
    });
    await waitFor(() => {
      expect(window.location.search).toBe(
        "?view=customs&source=qa&keyword=NEW&status=RELEASED",
      );
      expect(screen.getByDisplayValue("NEW")).toBeVisible();
    });
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("LATE 搜索后立即选退税记录，旧 Next 快照和缓存导航不能恢复报关页签", async () => {
    const user = userEvent.setup();
    const oldHref =
      "/dashboard/tax-refunds?view=customs&source=qa&keyword=OLD&status=RELEASED";
    window.history.replaceState({}, "", oldHref);
    mocks.searchSnapshot = window.location.search;
    await act(async () => render(<TestRoutes />));
    const input = await screen.findByDisplayValue("OLD");
    await act(async () => {
      fireEvent.change(input, { target: { value: "LATE" } });
    });
    expect(input).toHaveValue("LATE");
    const originalReplace = mocks.router.replace.getMockImplementation();
    mocks.router.replace.mockImplementation(() => {
      // 对应真实 Next 缓存导航使用旧 canonical query 的已确认浏览器轨迹。
      window.history.replaceState({}, "", oldHref);
      mocks.notify();
    });
    try {
      await user.click(screen.getByRole("tab", { name: "退税记录" }));
      expect(window.location.search).toBe("?view=refunds");
      expect(screen.getByRole("tab", { name: "退税记录" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.queryByRole("heading", { name: "报关单管理" })).toBeNull();
      await act(async () => mocks.notify());
      expect(window.location.search).toBe("?view=refunds");
      expect(mocks.router.replace).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(mocks.refundsGetAll).toHaveBeenLastCalledWith(
          expect.objectContaining({ keyword: undefined, status: undefined }),
        ),
      );
    } finally {
      mocks.router.replace.mockImplementation(originalReplace!);
    }
  });

  it("清空后延迟的 OLD 路由确认不能恢复旧输入，零延迟连续输入与地址保持 TEST", async () => {
    const user = userEvent.setup({ delay: 0 });
    const oldQuery = "?view=customs&source=qa&keyword=OLD";
    window.history.replaceState({}, "", "/dashboard/tax-refunds" + oldQuery);
    await act(async () => render(<TestRoutes />));
    const input = await screen.findByDisplayValue("OLD");
    mocks.searchSnapshot = oldQuery;
    await user.clear(input);
    expect(input).toHaveValue("");
    const clearQuery = window.location.search;
    await act(async () => {
      mocks.searchSnapshot = clearQuery;
      mocks.notify();
    });
    await act(async () => {
      mocks.searchSnapshot = oldQuery;
      mocks.notify();
    });
    expect(input).toHaveValue("");
    await user.type(input, "TEST");
    expect(input).toHaveValue("TEST");
    expect(window.location.search).toBe("?view=customs&source=qa&keyword=TEST");
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("较旧自有输入确认不能覆盖更新的本地草稿或地址", async () => {
    window.history.replaceState(
      {},
      "",
      "/dashboard/tax-refunds?view=customs&source=qa",
    );
    await act(async () => render(<TestRoutes />));
    const input = await screen.findByPlaceholderText("搜索报关单号或报关行...");
    mocks.searchSnapshot = window.location.search;
    await act(async () => {
      fireEvent.change(input, { target: { value: "A" } });
    });
    const olderOwnQuery = window.location.search;
    await act(async () => {
      fireEvent.change(input, { target: { value: "AB" } });
    });
    await act(async () => {
      mocks.searchSnapshot = olderOwnQuery;
      mocks.notify();
    });
    expect(input).toHaveValue("AB");
    expect(window.location.search).toBe("?view=customs&source=qa&keyword=AB");
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("Next 查询快照延迟时原生 Back/Forward 仍恢复浏览器实际筛选", async () => {
    window.history.replaceState(
      {},
      "",
      "/dashboard/tax-refunds?view=customs&source=qa&keyword=OLD",
    );
    window.history.pushState(
      {},
      "",
      "/dashboard/tax-refunds?view=customs&source=qa&keyword=NEW",
    );
    await act(async () => render(<TestRoutes />));
    await screen.findByDisplayValue("NEW");
    mocks.searchSnapshot = window.location.search;
    window.history.back();
    await waitFor(() => {
      expect(window.location.search).toBe(
        "?view=customs&source=qa&keyword=OLD",
      );
      expect(screen.getByDisplayValue("OLD")).toBeVisible();
    });
    window.history.forward();
    await waitFor(() => {
      expect(window.location.search).toBe(
        "?view=customs&source=qa&keyword=NEW",
      );
      expect(screen.getByDisplayValue("NEW")).toBeVisible();
    });
  });

  it("Next 路由先渲染后在 insertion effect 提交地址时仍采用新筛选", async () => {
    function CommitHistory({ query }: { query: string }) {
      useInsertionEffect(() => {
        window.history.replaceState({}, "", "/dashboard/tax-refunds" + query);
      }, [query]);
      return <TestRoutes />;
    }
    const oldQuery = "?view=customs&source=qa&keyword=OLD";
    const newQuery = "?view=customs&source=qa&keyword=NEW";
    window.history.replaceState({}, "", "/dashboard/tax-refunds" + oldQuery);
    mocks.searchSnapshot = oldQuery;
    const view = await act(async () =>
      render(<CommitHistory query={oldQuery} />),
    );
    await screen.findByDisplayValue("OLD");
    await act(async () => {
      mocks.searchSnapshot = newQuery;
      view.rerender(<CommitHistory query={newQuery} />);
      mocks.notify();
    });
    expect(window.location.search).toBe(newQuery);
    expect(screen.getByDisplayValue("NEW")).toBeVisible();
    await waitFor(() =>
      expect(mocks.customsGetAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: "NEW" }),
      ),
    );
  });

  it("退税记录导航已改变地址但旧报关列表仍挂载时，延迟筛选工作不能写回报关页签", async () => {
    window.history.replaceState(
      {},
      "",
      "/dashboard/tax-refunds?view=customs&keyword=OLD",
    );
    await act(async () => render(<TestRoutes />));
    const input = await screen.findByDisplayValue("OLD");

    // Next 路由上下文尚未提交：地址已改变，旧 customs 树与搜索参数仍存在。
    mocks.searchSnapshot = window.location.search;
    await act(async () => {
      fireEvent.change(input, { target: { value: "TEST" } });
      mocks.router.replace("/dashboard/tax-refunds?view=refunds");
    });
    expect(screen.getByRole("heading", { name: "报关单管理" })).toBeVisible();
    expect(window.location.search).toBe("?view=refunds");
    expect(mocks.router.replace).toHaveBeenLastCalledWith(
      "/dashboard/tax-refunds?view=refunds",
    );

    await act(async () => {
      mocks.searchSnapshot = null;
      mocks.notify();
    });
    expect(screen.getByRole("tab", { name: "退税记录" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("heading", { name: "报关单管理" })).toBeNull();
  });

  it("浏览器 Back/Forward 恢复报关筛选并保留父页签及其他参数", async () => {
    const user = userEvent.setup();
    mocks.customsGetAll.mockResolvedValue({
      data: { items: [], pagination: { total: 37 } },
    });
    window.history.replaceState(
      {},
      "",
      "/dashboard/tax-refunds?view=customs&source=qa&keyword=OLD",
    );
    window.history.pushState(
      {},
      "",
      "/dashboard/tax-refunds?view=customs&source=qa&keyword=NEW&status=RELEASED",
    );
    await act(async () => render(<TestRoutes />));
    await screen.findByDisplayValue("NEW");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "下一页" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await waitFor(() =>
      expect(mocks.customsGetAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );
    window.history.back();
    await waitFor(() => {
      expect(window.location.search).toBe(
        "?view=customs&source=qa&keyword=OLD",
      );
      expect(screen.getByDisplayValue("OLD")).toBeVisible();
    });
    await waitFor(() =>
      expect(mocks.customsGetAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: "OLD", status: undefined, page: 1 }),
      ),
    );
    window.history.forward();
    await waitFor(() => {
      expect(window.location.search).toBe(
        "?view=customs&source=qa&keyword=NEW&status=RELEASED",
      );
      expect(screen.getByDisplayValue("NEW")).toBeVisible();
    });
    await waitFor(() =>
      expect(mocks.customsGetAll).toHaveBeenLastCalledWith(
        expect.objectContaining({
          keyword: "NEW",
          status: "RELEASED",
          page: 1,
        }),
      ),
    );
    expect(screen.getByRole("tab", { name: "报关单" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("实际 URL 回写后的连续搜索、状态选择和重置保留嵌入页签及其他参数", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      {},
      "",
      "/dashboard/tax-refunds?view=customs&source=qa&keyword=OLD&status=RELEASED",
    );
    await act(async () => render(<TestRoutes />));
    const input = await screen.findByDisplayValue("OLD");
    await user.clear(input);
    await user.type(input, "TEST");
    await waitFor(() => {
      expect(window.location.search).toBe(
        "?view=customs&source=qa&status=RELEASED&keyword=TEST",
      );
      expect(screen.getByDisplayValue("TEST")).toBeVisible();
    });
    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(screen.getByRole("option", { name: "草稿" }));
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("status")).toBe(
        "DRAFT",
      ),
    );
    await user.click(screen.getByTestId("reset-filters"));
    expect(window.location.search).toBe("?view=customs&source=qa");
    expect(input).toHaveValue("");
    expect(screen.getByRole("tab", { name: "报关单" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("历史筛选 NEW 的结果先返回后，OLD 的迟到结果不能覆盖行和分页", async () => {
    const oldRequest = deferred<ReturnType<typeof listResponse>>();
    const newRequest = deferred<ReturnType<typeof listResponse>>();
    mocks.customsGetAll.mockImplementation(({ keyword }) =>
      keyword === "OLD" ? oldRequest.promise : newRequest.promise,
    );
    window.history.replaceState(
      {},
      "",
      "/dashboard/tax-refunds?view=customs&keyword=OLD",
    );
    await act(async () => render(<TestRoutes />));
    await waitFor(() =>
      expect(mocks.customsGetAll).toHaveBeenCalledWith(
        expect.objectContaining({ keyword: "OLD" }),
      ),
    );
    await act(async () => {
      mocks.router.push("/dashboard/tax-refunds?view=customs&keyword=NEW");
    });
    await waitFor(() =>
      expect(mocks.customsGetAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: "NEW" }),
      ),
    );
    await act(async () => newRequest.resolve(listResponse("ROW-NEW", 37)));
    expect(screen.getByTestId("declaration-row-ROW-NEW")).toBeVisible();
    await act(async () => oldRequest.resolve(listResponse("ROW-OLD", 1)));
    expect(screen.getByDisplayValue("NEW")).toBeVisible();
    expect(window.location.search).toBe("?view=customs&keyword=NEW");
    expect(screen.getByTestId("declaration-row-ROW-NEW")).toBeVisible();
    expect(screen.queryByTestId("declaration-row-ROW-OLD")).toBeNull();
    expect(screen.getByRole("button", { name: "下一页" })).toBeEnabled();
  });

  it("OLD 的迟到失败不能关闭 NEW 的加载状态或显示旧请求错误", async () => {
    const oldRequest = deferred<ReturnType<typeof listResponse>>();
    const newRequest = deferred<ReturnType<typeof listResponse>>();
    mocks.customsGetAll.mockImplementation(({ keyword }) =>
      keyword === "OLD" ? oldRequest.promise : newRequest.promise,
    );
    window.history.replaceState(
      {},
      "",
      "/dashboard/tax-refunds?view=customs&keyword=OLD",
    );
    await act(async () => render(<TestRoutes />));
    await waitFor(() => expect(mocks.customsGetAll).toHaveBeenCalled());
    await act(async () => {
      mocks.router.push("/dashboard/tax-refunds?view=customs&keyword=NEW");
    });
    await waitFor(() =>
      expect(mocks.customsGetAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: "NEW" }),
      ),
    );
    await act(async () => oldRequest.reject(new Error("synthetic old error")));
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(screen.getAllByText("加载中...").length).toBeGreaterThan(0);
    await act(async () => newRequest.resolve(listResponse("ROW-NEW", 37)));
    expect(screen.getByTestId("declaration-row-ROW-NEW")).toBeVisible();
    expect(screen.queryAllByText("加载中...")).toHaveLength(0);
  });

  it("当前列表请求失败仍显示错误并结束加载", async () => {
    const request = deferred<ReturnType<typeof listResponse>>();
    mocks.customsGetAll.mockReturnValue(request.promise);
    window.history.replaceState(
      {},
      "",
      "/dashboard/tax-refunds?view=customs&keyword=NEW",
    );
    await act(async () => render(<TestRoutes />));
    await waitFor(() => expect(mocks.customsGetAll).toHaveBeenCalled());
    await act(async () => request.reject(new Error("synthetic current error")));
    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith("加载报关单失败");
    expect(screen.queryAllByText("加载中...")).toHaveLength(0);
  });

  it("离开报关页签后，未完成列表请求的失败不再显示错误", async () => {
    const request = deferred<ReturnType<typeof listResponse>>();
    mocks.customsGetAll.mockReturnValue(request.promise);
    window.history.replaceState({}, "", "/dashboard/tax-refunds?view=customs");
    await act(async () => render(<TestRoutes />));
    await waitFor(() => expect(mocks.customsGetAll).toHaveBeenCalled());
    await act(async () => {
      mocks.router.replace("/dashboard/tax-refunds?view=refunds");
    });
    await act(async () =>
      request.reject(new Error("synthetic abandoned error")),
    );
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "退税记录" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
