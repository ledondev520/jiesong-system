import { describe, expect, it } from "vitest";
import { splitDraftSuffix } from "./declarationNo";

describe("splitDraftSuffix (B46)", () => {
  it("去掉 DRAFT 后缀并标记为草稿，大小写与分隔符不敏感", () => {
    expect(splitDraftSuffix("CUS-AUTO-20261101-EXP260009-DRAFT")).toEqual({
      displayNo: "CUS-AUTO-20261101-EXP260009",
      isDraft: true,
    });
    expect(splitDraftSuffix("DEC001_draft").displayNo).toBe("DEC001");
    expect(splitDraftSuffix("DEC001 DRAFT").isDraft).toBe(true);
  });

  it("没有后缀、DRAFT 出现在中间或整个单号就是 DRAFT 时保持原样", () => {
    expect(splitDraftSuffix("CUS-AUTO-20261101-EXP260009")).toEqual({
      displayNo: "CUS-AUTO-20261101-EXP260009",
      isDraft: false,
    });
    expect(splitDraftSuffix("DRAFT-001").isDraft).toBe(false);
    expect(splitDraftSuffix("DRAFT").isDraft).toBe(false);
    expect(splitDraftSuffix(null).displayNo).toBe("");
  });
});
