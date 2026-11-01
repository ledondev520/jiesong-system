/**
 * Financial Statements Formatting 单元测试
 */
import { describe, it, expect } from "vitest";
import {
  fmtAmount,
  fmtWan,
  fmtPercent,
  profitColor,
  getStatementsStaleness,
} from "./financialStatementsFormatting";

describe("fmtAmount", () => {
  it("应该格式化金额", () => {
    expect(fmtAmount(1000)).toContain("1,000.00");
    expect(fmtAmount(0)).toContain("0.00");
  });

  it("应该处理null/undefined", () => {
    expect(fmtAmount(null)).toBe("—");
    expect(fmtAmount(undefined)).toBe("—");
  });
});

describe("fmtWan", () => {
  it("应该格式化为万", () => {
    expect(fmtWan(10000000)).toContain("1,000.00");
    expect(fmtWan(10000)).toContain("1.00");
  });

  it("应该处理null/undefined", () => {
    expect(fmtWan(null)).toBe("—");
  });
});

describe("fmtPercent", () => {
  it("应该格式化为百分比", () => {
    expect(fmtPercent(0.1234)).toBe("12.3%");
    expect(fmtPercent(0)).toBe("0.0%");
  });

  it("应该处理null/undefined", () => {
    expect(fmtPercent(null)).toBe("—");
  });
});

describe("profitColor", () => {
  it("应该返回盈利颜色", () => {
    expect(profitColor(100)).toContain("emerald");
  });

  it("应该返回亏损颜色", () => {
    expect(profitColor(-100)).toContain("destructive");
  });

  it("应该处理null/undefined", () => {
    expect(profitColor(null)).toContain("muted");
  });
});

describe("getStatementsStaleness", () => {
  const periods = [
    { year: 2026, month: 6 },
    { year: 2026, month: 7 },
    { year: 2025, month: 12 },
  ];

  it("reports the latest period and how many months behind (Shanghai month)", () => {
    expect(
      getStatementsStaleness(periods, new Date("2026-11-01T02:00:00Z")),
    ).toEqual({
      latestLabel: "2026年7月",
      currentLabel: "2026年11月",
      monthsBehind: 4,
      stale: true,
    });
  });

  it("uses the Shanghai calendar month at the month boundary", () => {
    // UTC 2026-10-31 17:00 is already 2026-11-01 in Shanghai
    expect(
      getStatementsStaleness(periods, new Date("2026-10-31T17:00:00Z"))
        ?.currentLabel,
    ).toBe("2026年11月");
  });

  it("treats one month behind as normal, two or more as stale", () => {
    expect(
      getStatementsStaleness(periods, new Date("2026-08-15T00:00:00Z")),
    ).toMatchObject({ monthsBehind: 1, stale: false });
    expect(
      getStatementsStaleness(periods, new Date("2026-09-15T00:00:00Z")),
    ).toMatchObject({ monthsBehind: 2, stale: true });
  });

  it("returns null without periods", () => {
    expect(getStatementsStaleness([])).toBeNull();
  });
});
