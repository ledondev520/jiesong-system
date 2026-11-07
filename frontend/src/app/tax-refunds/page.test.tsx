import { describe, expect, it, vi } from "vitest";
import TaxRefundsPage from "./page";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe("TaxRefundsPage", () => {
  it("统一退税入口并跳转到 dashboard 业务页，保留查询参数", async () => {
    await TaxRefundsPage({
      searchParams: Promise.resolve({ view: "refunds" }),
    });

    expect(mockRedirect).toHaveBeenCalledWith(
      "/dashboard/customs?view=refunds",
    );
  });
});
