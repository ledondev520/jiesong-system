import { describe, expect, it } from "vitest";
import { comparePeriods, NO_PRIOR_PERIOD } from "./period-comparison";

describe("comparePeriods", () => {
  it("says 无上期数据 when there is no prior period, never 持平 or a percentage", () => {
    for (const previous of [null, undefined, Number.NaN]) {
      expect(comparePeriods(100, previous)).toEqual({
        dir: "neutral",
        text: NO_PRIOR_PERIOD,
      });
    }
    expect(NO_PRIOR_PERIOD).toBe("无上期数据");
  });

  it("does not divide by a zero prior period", () => {
    expect(comparePeriods(100, 0)).toEqual({
      dir: "neutral",
      text: "上期为 0，不计算环比",
    });
  });

  it("reports a missing current value instead of a change", () => {
    expect(comparePeriods(null, 100).text).toBe("本期无数据");
  });

  it("computes the change against the absolute prior value", () => {
    expect(comparePeriods(150, 100)).toEqual({
      dir: "up",
      text: "环比 +50.0%",
    });
    expect(comparePeriods(50, 100)).toEqual({
      dir: "down",
      text: "环比 -50.0%",
    });
    // 净利润从亏损 -100 变为 +100 是改善，不是下降
    expect(comparePeriods(100, -100)).toEqual({
      dir: "up",
      text: "环比 +200.0%",
    });
  });

  it("only calls it 持平 when the change is below 0.1%", () => {
    expect(comparePeriods(100.05, 100)).toEqual({
      dir: "neutral",
      text: "环比持平",
    });
    expect(comparePeriods(100.2, 100).dir).toBe("up");
  });
});
