/**
 * Input: 合成列表路径、筛选编码与不受信任的详情 returnTo
 * Output: 报关返回路径的允许列表、原始筛选语义与安全回退回归
 * Pos: 报关只读返回上下文测试
 */

import { describe, expect, it } from "vitest";
import {
  CUSTOMS_RETURN_FALLBACK,
  resolveCustomsReturnTo,
} from "./customs-return-context";

describe("报关详情的有限返回上下文", () => {
  it("仅携带内部路径，特殊关键词、重复普通参数与 hash 的语义不变", () => {
    const keyword = "合成 A&B +?#/贸易%25";
    const query = new URLSearchParams({
      view: "customs",
      keyword,
      status: "RELEASED",
      source: "qa",
    });
    query.append("tag", "first");
    query.append("tag", "second");
    const result = resolveCustomsReturnTo(
      `/dashboard/tax-refunds?${query}#rows`,
    );
    const parsed = new URL(result, "https://synthetic.invalid");
    expect(parsed.pathname).toBe("/dashboard/tax-refunds");
    expect(parsed.searchParams.get("keyword")).toBe(keyword);
    expect(parsed.searchParams.get("status")).toBe("RELEASED");
    expect(parsed.searchParams.getAll("tag")).toEqual(["first", "second"]);
    expect(parsed.hash).toBe("#rows");
    expect(result).not.toContain("synthetic.invalid");
  });

  it.each(["/customs-declarations", "/dashboard/customs-declarations"])(
    "旧独立列表 %s 规范到现有页签而不丢失筛选",
    (pathname) => {
      expect(
        resolveCustomsReturnTo(
          pathname + "?keyword=QA%2BTEST&status=DRAFT&source=qa#rows",
        ),
      ).toBe(
        "/dashboard/tax-refunds?keyword=QA%2BTEST&status=DRAFT&source=qa&view=customs#rows",
      );
    },
  );

  it("去除全部嵌套 returnTo，保留普通来源参数", () => {
    expect(
      resolveCustomsReturnTo(
        "/dashboard/tax-refunds?view=customs&keyword=QA&returnTo=%2Fdashboard&source=qa&returnTo=https%3A%2F%2Fexample.invalid",
      ),
    ).toBe("/dashboard/tax-refunds?view=customs&keyword=QA&source=qa");
  });

  it.each([
    null,
    "",
    "https://example.invalid/dashboard/tax-refunds?view=customs",
    "http://localhost/dashboard/tax-refunds?view=customs",
    "//example.invalid/dashboard/tax-refunds?view=customs",
    "javascript:alert(1)",
    "\\example.invalid/dashboard/tax-refunds?view=customs",
    "/\\example.invalid/dashboard/tax-refunds?view=customs",
    " /dashboard/tax-refunds?view=customs",
    "/dashboard/tax-refunds/../sales?view=customs",
    "/dashboard/../dashboard/tax-refunds?view=customs",
    "/dashboard/%74ax-refunds?view=customs",
    "%2Fdashboard%2Ftax-refunds%3Fview%3Dcustoms",
    "%252Fdashboard%252Ftax-refunds%253Fview%253Dcustoms",
    "/%2Fexample.invalid/dashboard/tax-refunds?view=customs",
    "/dashboard/sales?view=customs",
    "/dashboard/tax-refunds/qa?view=customs",
    "/dashboard/tax-refunds?keyword=QA",
    "/dashboard/tax-refunds?view=refunds&keyword=QA",
    "/dashboard/tax-refunds?view=customs&view=refunds",
    "/dashboard/tax-refunds?view=customs&view=customs",
    "/customs-declarations?view=refunds",
  ])("不受支持的目标 %s 一律回退到报关页签", (target) => {
    expect(resolveCustomsReturnTo(target)).toBe(CUSTOMS_RETURN_FALLBACK);
  });
});
