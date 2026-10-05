/**
 * Input: 真实报关列表组件、模拟服务与浏览器列表地址
 * Output: 嵌入/独立筛选、分页与详情安全返回上下文的组件回归
 * Pos: 报关列表交互测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomsDeclarationListPageContent } from "./CustomsDeclarationListPageContent";

const mocks = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn() },
  getAll: vi.fn(),
  params: new URLSearchParams("view=customs&source=qa"),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => mocks.params,
  usePathname: () => window.location.pathname,
}));
vi.mock("@/services/customsDeclaration.service", () => ({
  customsDeclarationService: { getAll: mocks.getAll, generateDrafts: vi.fn() },
}));
vi.mock("@/lib/api-cache", () => ({
  cachedFetch: (_key: string, fetcher: () => unknown) => fetcher(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("嵌入退税工作台的报关列表 URL 同步", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.params = new URLSearchParams("view=customs&source=qa");
    window.history.replaceState(
      {},
      "",
      "/dashboard/tax-refunds?view=customs&source=qa",
    );
    mocks.getAll.mockResolvedValue({
      data: { items: [], pagination: { total: 0 } },
    });
  });

  it("挂载时保留报关页签，不把父页面重定向回退税工作台", async () => {
    render(<CustomsDeclarationListPageContent embedded />);
    await waitFor(() => expect(mocks.getAll).toHaveBeenCalled());
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("浏览器已离开报关页签时旧嵌入列表事件不能再发布筛选", async () => {
    render(<CustomsDeclarationListPageContent embedded />);
    const input = screen.getByPlaceholderText("搜索报关单号或报关行...");
    window.history.replaceState({}, "", "/dashboard/tax-refunds?view=refunds");
    fireEvent.change(input, { target: { value: "LATE" } });
    expect(window.location.search).toBe("?view=refunds");
  });

  it("搜索和重置只改变筛选条件，保留所属页签与其他参数", async () => {
    mocks.params = new URLSearchParams("view=customs&source=qa&keyword=OLD");
    window.history.replaceState(
      {},
      "",
      "/dashboard/tax-refunds?" + mocks.params.toString(),
    );
    const user = userEvent.setup();
    render(<CustomsDeclarationListPageContent embedded />);
    const input = screen.getByPlaceholderText("搜索报关单号或报关行...");
    await user.clear(input);
    await user.type(input, "TEST");
    await waitFor(() =>
      expect(window.location.search).toBe(
        "?view=customs&source=qa&keyword=TEST",
      ),
    );
    await user.click(screen.getByTestId("reset-filters"));
    expect(window.location.search).toBe("?view=customs&source=qa");
    expect(input).toHaveValue("");
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });
  it.each(["/customs-declarations", "/dashboard/customs-declarations"])(
    "旧独立列表 %s 进入详情只传递内部的规范报关返回上下文",
    async (pathname) => {
      const user = userEvent.setup();
      window.history.replaceState(
        {},
        "",
        pathname +
          "?source=qa&keyword=QA&status=DRAFT&returnTo=https%3A%2F%2Fexample.invalid#rows",
      );
      mocks.params = new URLSearchParams(window.location.search);
      mocks.getAll.mockResolvedValue({
        data: {
          items: [
            {
              id: "qa",
              declarationNo: "QA",
              status: "DRAFT",
              totalAmount: 0,
              currency: "USD",
            },
          ],
          pagination: { total: 1 },
        },
      });
      render(<CustomsDeclarationListPageContent />);
      await user.click(
        await screen.findByRole("button", { name: "查看详情 QA" }),
      );
      const href = mocks.router.push.mock.calls.at(-1)?.[0];
      expect(href).toBeTypeOf("string");
      const detailUrl = new URL(href, window.location.origin);
      expect(detailUrl.pathname).toBe("/dashboard/customs-declarations/qa");
      const returnTo = detailUrl.searchParams.get("returnTo");
      expect(returnTo).toBe(
        "/dashboard/tax-refunds?source=qa&keyword=QA&status=DRAFT&view=customs#rows",
      );
      expect(returnTo).not.toContain(window.location.origin);
      expect(returnTo).not.toContain("returnTo=");
    },
  );

  it("可翻到第2页，搜索后回到第1页，不漏掉20条以后的报关单", async () => {
    mocks.getAll.mockImplementation(async ({ page }) => ({
      data: {
        items: [
          {
            id: `qa-${page}`,
            declarationNo: `QA-PAGE-${page}`,
            status: "DRAFT",
            totalAmount: 100,
            currency: "USD",
          },
        ],
        pagination: { total: 37 },
      },
    }));
    const user = userEvent.setup();
    render(<CustomsDeclarationListPageContent embedded />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "下一页" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await waitFor(() =>
      expect(mocks.getAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, pageSize: 20 }),
      ),
    );
    expect((await screen.findAllByText("QA-PAGE-2")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
    await user.type(
      screen.getByPlaceholderText("搜索报关单号或报关行..."),
      "TEST",
    );
    await waitFor(() =>
      expect(mocks.getAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, keyword: "TEST" }),
      ),
    );
  });

  it("切换每页条数按服务端重新分页", async () => {
    mocks.getAll.mockResolvedValue({
      data: { items: [], pagination: { total: 37 } },
    });
    const user = userEvent.setup();
    render(<CustomsDeclarationListPageContent embedded />);
    await waitFor(() => expect(mocks.getAll).toHaveBeenCalled());
    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(screen.getByRole("option", { name: "每页 50 条" }));
    await waitFor(() =>
      expect(mocks.getAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, pageSize: 50 }),
      ),
    );
  });

  it("独立列表采用历史筛选，编辑与重置保留当前路径和非筛选参数", async () => {
    const user = userEvent.setup();
    mocks.params = new URLSearchParams("source=qa&keyword=OLD&status=RELEASED");
    window.history.replaceState(
      {},
      "",
      "/dashboard/customs-declarations?" + mocks.params.toString(),
    );
    const { rerender } = render(<CustomsDeclarationListPageContent />);
    await screen.findByDisplayValue("OLD");
    await waitFor(() => expect(mocks.getAll).toHaveBeenCalled());
    expect(mocks.router.replace).not.toHaveBeenCalled();

    mocks.params = new URLSearchParams("source=qa&keyword=NEW&status=DRAFT");
    window.history.replaceState(
      {},
      "",
      "/dashboard/customs-declarations?" + mocks.params.toString(),
    );
    rerender(<CustomsDeclarationListPageContent />);
    const input = await screen.findByDisplayValue("NEW");
    await waitFor(() =>
      expect(mocks.getAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: "NEW", status: "DRAFT", page: 1 }),
      ),
    );
    expect(mocks.router.replace).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "TEST");
    expect(window.location.pathname).toBe("/dashboard/customs-declarations");
    expect(
      Object.fromEntries(new URLSearchParams(window.location.search)),
    ).toEqual({
      source: "qa",
      keyword: "TEST",
      status: "DRAFT",
    });
    expect(mocks.router.replace).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("reset-filters"));
    expect(window.location.pathname).toBe("/dashboard/customs-declarations");
    expect(
      Object.fromEntries(new URLSearchParams(window.location.search)),
    ).toEqual({
      source: "qa",
    });
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
  });
});
