/**
 * Input: /dashboard/quotes/create with each signed-in role
 * Output: the editor only for ADMIN/SALES (matches POST /quotes roleAuth); everyone else gets no form
 * Pos: quote create-page access test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CreateQuotePage from "./page";

const mocks = vi.hoisted(() => ({ role: "SALES" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/store/auth.store", () => ({
  useAuthStore: (selector: (s: { user: { role: string } }) => unknown) =>
    selector({ user: { role: mocks.role } }),
}));
vi.mock("@/services/quote.service", () => ({ quoteService: {} }));
vi.mock("../components/QuoteEditor", () => ({
  QuoteEditor: () => <div>quote-editor</div>,
}));

describe("create quote page access", () => {
  beforeEach(() => {
    mocks.role = "SALES";
  });

  it.each(["ADMIN", "SALES"])("%s gets the editor", (role) => {
    mocks.role = role;
    render(<CreateQuotePage />);
    expect(screen.getByText("quote-editor")).toBeTruthy();
  });

  it.each(["PURCHASE", "FINANCE", "WAREHOUSE", "BOSS"])(
    "%s gets no editor",
    (role) => {
      mocks.role = role;
      render(<CreateQuotePage />);
      expect(screen.queryByText("quote-editor")).toBeNull();
      expect(screen.getByText("仅管理员和销售可以新建报价。")).toBeTruthy();
    },
  );
});
