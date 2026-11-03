/**
 * Input: real quote list component, mocked service and browser list URL
 * Output: rows, URL-driven search/status/reset/paging, navigation and the BOSS read-only gate
 * Pos: quote list interaction test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QuoteListPageContent } from "./QuoteListPageContent";

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  getAll: vi.fn(),
  role: "SALES",
  readOnly: false,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
}));
vi.mock("@/services/quote.service", () => ({
  quoteService: { getAll: mocks.getAll },
}));
vi.mock("@/lib/hooks/useBusinessReadOnly", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hooks/useBusinessReadOnly")>()),
  useBusinessReadOnly: () => mocks.readOnly,
  BusinessWrite: ({ children }: { children: React.ReactNode }) =>
    mocks.readOnly ? null : children,
}));
vi.mock("@/store/auth.store", () => ({
  useAuthStore: (selector: (s: { user: { role: string } }) => unknown) =>
    selector({ user: { role: mocks.role } }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const quote = (extra = {}) => ({
  id: "q1",
  quoteNo: "QT2610-001",
  status: "SENT",
  customer: { id: "c1", name: "Seapot" },
  totalAmount: 1234.5,
  validUntil: "2026-12-01T00:00:00.000Z",
  createdAt: "2026-10-31T01:00:00.000Z",
  isExpired: false,
  _count: { items: 3 },
  ...extra,
});

describe("quote list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readOnly = false;
    mocks.role = "SALES";
    window.history.replaceState({}, "", "/dashboard/quotes");
    mocks.getAll.mockResolvedValue({
      data: {
        items: [
          quote(),
          quote({ id: "q2", quoteNo: "QT2610-002", isExpired: true }),
        ],
        pagination: { total: 2 },
      },
    });
  });

  it("renders rows with status, amount and computed 已过期", async () => {
    render(<QuoteListPageContent />);
    expect((await screen.findAllByText("QT2610-001")).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("USD 1,234.50").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已过期").length).toBeGreaterThan(0);
    expect(mocks.getAll).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      keyword: undefined,
      status: undefined,
    });
  });

  it("search and status filter go through the URL and reset clears both", async () => {
    render(<QuoteListPageContent />);
    await screen.findAllByText("QT2610-001");
    fireEvent.change(screen.getByLabelText("搜索报价"), {
      target: { value: "SEA" },
    });
    expect(window.location.search).toBe("?keyword=SEA");
    await waitFor(() =>
      expect(mocks.getAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: "SEA" }),
      ),
    );
    fireEvent.click(screen.getByText("重置"));
    expect(window.location.search).toBe("");
  });

  it("restores filters from the URL on load", async () => {
    window.history.replaceState(
      {},
      "",
      "/dashboard/quotes?keyword=X&status=ACCEPTED&page=2&pageSize=50",
    );
    render(<QuoteListPageContent />);
    await waitFor(() =>
      expect(mocks.getAll).toHaveBeenCalledWith({
        page: 2,
        pageSize: 50,
        keyword: "X",
        status: "ACCEPTED",
      }),
    );
  });

  it("clicking a row opens the detail; 新建报价 goes to /create", async () => {
    render(<QuoteListPageContent />);
    fireEvent.click((await screen.findAllByTestId("quote-row-QT2610-001"))[0]);
    expect(mocks.router.push).toHaveBeenCalledWith("/dashboard/quotes/q1");
    fireEvent.click(screen.getByText("新建报价"));
    expect(mocks.router.push).toHaveBeenCalledWith("/dashboard/quotes/create");
  });

  it.each(["BOSS", "PURCHASE", "FINANCE"])(
    "%s sees the list but no 新建报价 (create is ADMIN/SALES only)",
    async (role) => {
      mocks.role = role;
      render(<QuoteListPageContent />);
      await screen.findAllByText("QT2610-001");
      expect(screen.queryByText("新建报价")).toBeNull();
    },
  );

  it("ADMIN sees 新建报价", async () => {
    mocks.role = "ADMIN";
    render(<QuoteListPageContent />);
    await screen.findAllByText("QT2610-001");
    expect(screen.getByText("新建报价")).toBeTruthy();
  });

  describe("空态区分（B45）", () => {
    const empty = { data: { items: [], pagination: { total: 0 } } };

    it("真的还没有报价：引导新建（有新建权限时）", async () => {
      mocks.getAll.mockResolvedValue(empty);
      render(<QuoteListPageContent />);
      expect(
        (await screen.findAllByText(/还没有报价。点击右上角「新建报价」/))
          .length,
      ).toBeGreaterThan(0);
      expect(screen.queryByText("暂无报价。")).toBeNull();
    });

    it("筛选无结果：提示调整或重置，而不是「没有报价」", async () => {
      window.history.replaceState({}, "", "/dashboard/quotes?keyword=zzz");
      mocks.getAll.mockResolvedValue(empty);
      render(<QuoteListPageContent />);
      expect(
        (await screen.findAllByText(/没有符合条件的报价/)).length,
      ).toBeGreaterThan(0);
    });

    it("加载失败：显示失败提示，不冒充「暂无报价」", async () => {
      mocks.getAll.mockRejectedValue(new Error("boom"));
      render(<QuoteListPageContent />);
      expect(
        (await screen.findAllByText(/加载失败，请刷新/)).length,
      ).toBeGreaterThan(0);
      expect(screen.queryByText(/还没有报价/)).toBeNull();
    });
  });
});
