/**
 * Input: 前端常量配置
 * Output: 常量配置单元测试
 * Pos: 前端配置常量测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, it, expect } from "vitest";
import * as constants from "./constants";
import { PORTS, UNITS } from "./constants";

describe("constants", () => {
  it("PORTS包含必要字段", () => {
    expect(PORTS.length).toBeGreaterThan(0);
    PORTS.forEach((port) => {
      expect(port).toHaveProperty("id");
      expect(port).toHaveProperty("name");
      expect(port).toHaveProperty("code");
    });
  });

  it("UNITS包含常用单位", () => {
    expect(UNITS).toEqual(expect.arrayContaining(["平方米 (sqm)", "箱 (box)"]));
  });

  it("不再携带第二份汇率/利润率默认值（唯一来源是报价配置）", () => {
    expect(constants).not.toHaveProperty("DEFAULT_EXCHANGE_RATE");
    expect(constants).not.toHaveProperty("DEFAULT_PROFIT_RATE");
  });
});
