/** 客户列表：切换筛选后，迟到的旧响应不覆盖当前 URL 的结果（评审 R1-4）。 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import CustomersPage from "./page";

const mocks = vi.hoisted(() => ({ getAll: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/services/customer.service", () => ({
  customerService: { getAll: mocks.getAll },
}));
vi.mock("@/store/auth.store", () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ user: { role: "ADMIN" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const reply = (name: string) => ({
  data: {
    items: [
      {
        id: name,
        name,
        isActive: true,
        defaultCurrency: "USD",
        defaultIncoterm: "FOB",
      },
    ],
    pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/dashboard/customers");
});

describe("customers list", () => {
  it("a late response for the old keyword does not replace the current rows", async () => {
    let resolveOld: (value: unknown) => void = () => {};
    mocks.getAll.mockImplementation((params: { keyword?: string }) =>
      params.keyword === "new"
        ? Promise.resolve(reply("Customer NEW"))
        : new Promise((resolve) => (resolveOld = resolve)),
    );
    render(<CustomersPage />);
    fireEvent.change(screen.getByPlaceholderText(/搜索/), {
      target: { value: "new" },
    });
    expect((await screen.findAllByText("Customer NEW")).length).toBeGreaterThan(
      0,
    );
    await act(async () => resolveOld(reply("Customer OLD")));
    expect(screen.queryByText("Customer OLD")).toBeNull();
    expect(screen.getAllByText("Customer NEW").length).toBeGreaterThan(0);
  });
});
