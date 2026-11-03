import { describe, expect, it } from "vitest";
import {
  MISSING_VALUE,
  UNMAINTAINED,
  isMissing,
  orMissing,
} from "./missing-value";

describe("missing-value rule", () => {
  it("缺失值显示占位，真实的 0 与空字符串保持原样", () => {
    expect(orMissing(null)).toBe(MISSING_VALUE);
    expect(orMissing(undefined)).toBe(MISSING_VALUE);
    expect(orMissing(Number.NaN)).toBe(MISSING_VALUE);
    expect(orMissing(undefined, UNMAINTAINED)).toBe("未维护");
    expect(orMissing(0)).toBe(0);
    expect(orMissing("")).toBe("");
    expect(isMissing(0)).toBe(false);
  });
});
