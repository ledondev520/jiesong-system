/** 旧 /dashboard/sales 列表只做重定向：保留查询参数，keyword 改名为 q。 */
import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import SalesListRedirect, { ordersRedirectTarget } from "./page";

describe("ordersRedirectTarget", () => {
  it("无参数时回到订单列表", () => {
    expect(ordersRedirectTarget()).toBe("/dashboard/orders");
    expect(ordersRedirectTarget({ status: "", page: undefined })).toBe("/dashboard/orders");
  });
  it("保留筛选参数并把 keyword 改成 q；数组参数取首个", () => {
    expect(ordersRedirectTarget({ keyword: "EXP26", status: "SHIPPED", page: ["2", "3"] })).toBe(
      "/dashboard/orders?q=EXP26&status=SHIPPED&page=2",
    );
    expect(ordersRedirectTarget({ shipped: "true", shippedFrom: "2026-01-01" })).toBe(
      "/dashboard/orders?shipped=true&shippedFrom=2026-01-01",
    );
  });
});

describe("SalesListRedirect", () => {
  it("调用服务端 redirect 到新地址", async () => {
    await SalesListRedirect({ searchParams: Promise.resolve({ q: "A1" }) });
    expect(redirect).toHaveBeenCalledWith("/dashboard/orders?q=A1");
  });
});
