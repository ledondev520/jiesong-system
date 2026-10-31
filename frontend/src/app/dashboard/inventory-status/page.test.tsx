/**
 * Input: 旧 /dashboard/inventory-status 路由
 * Output: 验证重定向到 /dashboard/inventory
 * Pos: 前端路由兼容测试
 */

import { describe, expect, it, vi } from "vitest";
import InventoryStatusPage from "./page";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe("InventoryStatusPage 重定向", () => {
  it("旧库存状态路由跳转到 /dashboard/inventory", () => {
    InventoryStatusPage();
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard/inventory");
  });
});
