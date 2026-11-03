import { describe, expect, it } from "vitest";
import { formatMeasure } from "./measure";

describe("formatMeasure", () => {
  it("shows 未维护 for null, undefined and 0, never 0kg/0CBM", () => {
    for (const value of [null, undefined, 0]) {
      expect(formatMeasure(value, "kg")).toBe("未维护");
      expect(formatMeasure(value, "CBM")).toBe("未维护");
    }
  });
  it("shows the value with its unit otherwise", () => {
    expect(formatMeasure(12.5, "kg")).toBe("12.5 kg");
    expect(formatMeasure(0.35, "CBM")).toBe("0.35 CBM");
  });
});
