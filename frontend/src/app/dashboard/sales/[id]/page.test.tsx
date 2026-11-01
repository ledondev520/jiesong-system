/** 旧 /dashboard/sales/[id] 只做重定向：保留查询参数（tab 由新详情页映射）。 */
import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import SalesDetailRedirect, { orderDetailRedirectTarget } from "./page";

describe("orderDetailRedirectTarget", () => {
  it("无参数时进入订单详情；保留查询参数，数组取首个", () => {
    expect(orderDetailRedirectTarget("s-1")).toBe("/dashboard/orders/s-1");
    expect(
      orderDetailRedirectTarget("s-1", { tab: ["finance", "x"], empty: "" }),
    ).toBe("/dashboard/orders/s-1?tab=finance");
  });
});

describe("SalesDetailRedirect", () => {
  it("调用服务端 redirect 到新地址", async () => {
    await SalesDetailRedirect({
      params: Promise.resolve({ id: "s-2" }),
      searchParams: Promise.resolve({ tab: "3d" }),
    });
    expect(redirect).toHaveBeenCalledWith("/dashboard/orders/s-2?tab=3d");
  });
});
