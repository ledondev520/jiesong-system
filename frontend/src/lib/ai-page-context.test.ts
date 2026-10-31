import { describe, expect, it } from "vitest";
import { getAiPageContext } from "./ai-page-context";

describe("getAiPageContext", () => {
  it("详情页带记录 id", () => {
    expect(getAiPageContext("/dashboard/purchases/pc-001")).toEqual({
      route: "/dashboard/purchases/pc-001",
      recordId: "pc-001",
    });
    expect(getAiPageContext("/dashboard/purchases/pc-001/edit").recordId).toBe(
      "pc-001",
    );
  });

  it("列表、动作页与二级设置页不带记录 id", () => {
    for (const path of [
      "/dashboard",
      "/dashboard/purchases",
      "/dashboard/purchases/new",
      "/dashboard/customs/new",
      "/dashboard/ai/sessions",
      "/dashboard/finance/receivable",
      "/dashboard/settings/users",
    ]) {
      expect(getAiPageContext(path)).toEqual({ route: path });
    }
  });
});
