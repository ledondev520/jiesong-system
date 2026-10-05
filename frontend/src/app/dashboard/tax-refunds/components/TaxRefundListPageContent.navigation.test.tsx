/**
 * Input: 实际退税页签、嵌入报关列表/详情、可观察的浏览器历史与合成服务数据
 * Output: 列表/详情返回后的页签切换及历史筛选回归结果
 * Pos: 退税工作台路由集成测试
 */

import { Suspense, useSyncExternalStore } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    customsGetAll: vi.fn(),
    customsGetById: vi.fn(),
    refundsGetAll: vi.fn(),
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
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("./TaxRefundWorkbench", () => ({
  TaxRefundWorkbench: () => <h2>合成工作台</h2>,
}));

const detailParams = Promise.resolve({ id: "qa-customs" });

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
    await user.click(screen.getByRole("tab", { name: "报关单" }));
    expect(window.location.search).toBe("?view=customs");
    const detailButton = (
      await screen.findAllByRole("button", {
        name: /查看详情 QA-CUSTOMS/,
      })
    )[0];
    await user.click(detailButton);
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
});
