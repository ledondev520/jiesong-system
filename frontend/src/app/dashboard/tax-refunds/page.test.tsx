/**
 * Input: 旧 /dashboard/tax-refunds 列表路由
 * Output: 验证重定向到 /dashboard/customs
 * Pos: 前端路由兼容测试
 */

import { describe, expect, it, vi } from "vitest";
import TaxRefundsDashboardPage from "./page";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe("TaxRefundsDashboardPage 重定向", () => {
  it("旧退税列表路由跳转到 /dashboard/customs", async () => {
    await TaxRefundsDashboardPage({ searchParams: Promise.resolve({}) });
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard/customs");
  });

  it("保留旧书签里的查询参数（view 等）", async () => {
    await TaxRefundsDashboardPage({
      searchParams: Promise.resolve({ view: "refunds", q: "EXP1" }),
    });
    expect(mockRedirect).toHaveBeenLastCalledWith(
      "/dashboard/customs?view=refunds&q=EXP1",
    );
  });
});
