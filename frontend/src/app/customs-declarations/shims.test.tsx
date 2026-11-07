import { describe, expect, it, vi } from "vitest";
import CreatePage from "./create/page";
import DetailPage from "./[id]/page";
import EditPage from "./[id]/edit/page";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

const sp = Promise.resolve({ returnTo: "/dashboard/customs" });

describe("顶层 /customs-declarations 兼容跳转", () => {
  it("保留查询参数并指向 /dashboard/customs", async () => {
    await CreatePage({ searchParams: sp });
    await DetailPage({
      params: Promise.resolve({ id: "a b" }),
      searchParams: sp,
    });
    await EditPage({ params: Promise.resolve({ id: "7" }), searchParams: sp });

    expect(mockRedirect.mock.calls.map((c) => c[0])).toEqual([
      "/dashboard/customs/new?returnTo=%2Fdashboard%2Fcustoms",
      "/dashboard/customs/a%20b?returnTo=%2Fdashboard%2Fcustoms",
      "/dashboard/customs/7/edit?returnTo=%2Fdashboard%2Fcustoms",
    ]);
  });
});
