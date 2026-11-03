import { describe, expect, it } from "vitest";
import {
  formatDeclarationElementsList,
  parseDeclarationElements,
} from "./hs-code-helpers";

describe("declaration elements (B46)", () => {
  it("去掉库内「0:」式序号前缀，保留要素名称", () => {
    expect(
      parseDeclarationElements("0:品牌类型|1:出口享惠情况｜2：用途||"),
    ).toEqual(["品牌类型", "出口享惠情况", "用途"]);
  });

  it("没有序号前缀的要素保持原样，空值得空数组", () => {
    expect(parseDeclarationElements("品牌类型|用途")).toEqual([
      "品牌类型",
      "用途",
    ]);
    expect(parseDeclarationElements(null)).toEqual([]);
  });

  it("复制清单按 1. 2. 编号逐行", () => {
    expect(formatDeclarationElementsList(["品牌类型", "用途"])).toBe(
      "1. 品牌类型\n2. 用途",
    );
  });
});
