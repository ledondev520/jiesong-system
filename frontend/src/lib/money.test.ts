import { describe, expect, it } from "vitest";
import { roundMoney, roundRate, toCents } from "./money";

describe("money", () => {
  it("fixes float noise and rounds half away from zero", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(0.004)).toBe(0);
  });
  it("maps non-finite input to 0 and exposes integer cents", () => {
    for (const v of [null, undefined, "", "x", NaN, Infinity])
      expect(roundMoney(v)).toBe(0);
    expect(toCents(19.99)).toBe(1999);
  });
  it("roundRate strips float residue to 6 decimals", () => {
    expect(roundRate(6.500000000000001)).toBe(6.5);
    expect(roundRate(0.1 + 0.2)).toBe(0.3);
    expect(roundRate(1.23456789)).toBe(1.234568);
    expect(roundRate("x")).toBe(0);
  });
});
