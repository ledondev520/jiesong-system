import { describe, expect, it } from "vitest";
import {
  formatCnyAxisTick,
  formatMonthAxisTick,
  rotatedTickProps,
} from "./chart-axis";

describe("chart axis helpers (B22)", () => {
  it("金额刻度用万/亿缩写并去掉多余小数", () => {
    expect(formatCnyAxisTick(0)).toBe("0");
    expect(formatCnyAxisTick(950)).toBe("950");
    expect(formatCnyAxisTick(10000)).toBe("1万");
    expect(formatCnyAxisTick(125000)).toBe("12.5万");
    expect(formatCnyAxisTick(-30000)).toBe("-3万");
    expect(formatCnyAxisTick(250000000)).toBe("2.5亿");
    expect(formatCnyAxisTick("abc")).toBe("");
  });

  it("月份刻度显示「N月」，首个刻度与 1 月带年份", () => {
    expect(formatMonthAxisTick("2026-10", 0)).toBe("2026年10月");
    expect(formatMonthAxisTick("2026-11", 1)).toBe("11月");
    expect(formatMonthAxisTick("2027-01", 3)).toBe("2027年1月");
    expect(formatMonthAxisTick("unexpected", 2)).toBe("unexpected");
  });

  it("点数多时斜排，点数少时水平", () => {
    expect(rotatedTickProps(6).angle).toBe(0);
    expect(rotatedTickProps(8).angle).toBe(0);
    expect(rotatedTickProps(13)).toMatchObject({
      angle: -35,
      textAnchor: "end",
    });
  });
});
