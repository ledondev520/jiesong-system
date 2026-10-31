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
  it("旧库存状态路由跳转到 /dashboard/inventory", async () => {
    await InventoryStatusPage({ searchParams: Promise.resolve({}) });
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard/inventory");
  });

  it("保留库存查询参数", async () => {
    await InventoryStatusPage({
      searchParams: Promise.resolve({
        inventoryKeyword: "SYN",
        inventoryPage: "2",
      }),
    });
    expect(mockRedirect).toHaveBeenLastCalledWith(
      "/dashboard/inventory?inventoryKeyword=SYN&inventoryPage=2",
    );
  });
});
