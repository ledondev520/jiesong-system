/** 旧 /dashboard/reports 只做重定向：保留全部查询参数。 */
import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import ReportsRedirect, { analysisRedirectTarget } from "./page";

describe("analysisRedirectTarget", () => {
  it("无参数时去经营分析", () => {
    expect(analysisRedirectTarget()).toBe("/dashboard/finance/analysis");
    expect(analysisRedirectTarget({ startDate: "", endDate: undefined })).toBe(
      "/dashboard/finance/analysis",
    );
  });
  it("保留期间和来源参数，数组参数取首个", () => {
    expect(
      analysisRedirectTarget({
        startDate: "2026-10-05",
        endDate: "2026-10-31",
        source: "qa",
      }),
    ).toBe(
      "/dashboard/finance/analysis?startDate=2026-10-05&endDate=2026-10-31&source=qa",
    );
    expect(analysisRedirectTarget({ endDate: ["2026-12-31", "x"] })).toBe(
      "/dashboard/finance/analysis?endDate=2026-12-31",
    );
  });
});

describe("ReportsRedirect", () => {
  it("调用服务端 redirect", async () => {
    await ReportsRedirect({
      searchParams: Promise.resolve({ startDate: "2026-10-05" }),
    });
    expect(redirect).toHaveBeenCalledWith(
      "/dashboard/finance/analysis?startDate=2026-10-05",
    );
  });
});
