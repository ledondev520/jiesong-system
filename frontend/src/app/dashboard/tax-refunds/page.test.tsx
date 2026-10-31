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
  it("旧退税列表路由跳转到 /dashboard/customs", () => {
    TaxRefundsDashboardPage();
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard/customs");
  });
});
