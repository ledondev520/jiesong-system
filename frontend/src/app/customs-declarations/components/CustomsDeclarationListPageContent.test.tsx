import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("搜索和重置只改变筛选条件，保留所属页签与其他参数", async () => {
    mocks.params = new URLSearchParams("view=customs&source=qa&keyword=OLD");
    window.history.replaceState(
      {},
      "",
      "/dashboard/tax-refunds?" + mocks.params.toString(),
    );
    const user = userEvent.setup();
    render(<CustomsDeclarationListPageContent embedded />);
    const input = screen.getByPlaceholderText("搜索报关单号、客户或目的国...");
    await user.clear(input);
    await user.type(input, "TEST");
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenLastCalledWith(
        "/dashboard/tax-refunds?view=customs&source=qa&keyword=TEST",
        { scroll: false },
      ),
    );
    await user.click(screen.getByTestId("reset-filters"));
    expect(mocks.router.replace).toHaveBeenLastCalledWith(
      "/dashboard/tax-refunds?view=customs&source=qa",
      { scroll: false },
    );
  });
});
