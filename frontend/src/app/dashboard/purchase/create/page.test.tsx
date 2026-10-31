/**
 * Input: 旧 /dashboard/purchase/create 路由（含 editId）
 * Output: 验证重定向到 /dashboard/purchases/new 并保留 editId
 * Pos: 前端路由兼容测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import PurchaseCreateRedirectPage from "./page";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe("PurchaseCreateRedirectPage", () => {
  beforeEach(() => mockRedirect.mockClear());

  it("无 editId 时回到新增页", async () => {
    await PurchaseCreateRedirectPage({ searchParams: Promise.resolve({}) });
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard/purchases/new");
  });

  it("保留 editId", async () => {
    await PurchaseCreateRedirectPage({
      searchParams: Promise.resolve({ editId: "pc 1" }),
    });
    expect(mockRedirect).toHaveBeenCalledWith(
      "/dashboard/purchases/new?editId=pc%201",
    );
  });
});
