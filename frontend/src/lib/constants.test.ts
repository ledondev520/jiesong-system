/**
 * Input: 前端常量配置
 * Output: 常量配置单元测试
 * Pos: 前端配置常量测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, it, expect } from 'vitest';
import { PORTS, UNITS, DEFAULT_EXCHANGE_RATE, DEFAULT_PROFIT_RATE } from './constants';

describe('constants', () => {
  it('PORTS包含必要字段', () => {
    expect(PORTS.length).toBeGreaterThan(0);
    PORTS.forEach((port) => {
      expect(port).toHaveProperty('id');
      expect(port).toHaveProperty('name');
      expect(port).toHaveProperty('code');
    });
  });

  it('UNITS包含常用单位', () => {
    expect(UNITS).toEqual(expect.arrayContaining(['平方米 (sqm)', '箱 (box)']));
  });

  it('默认汇率与利润率为正数', () => {
    expect(DEFAULT_EXCHANGE_RATE).toBeGreaterThan(0);
    expect(DEFAULT_PROFIT_RATE).toBeGreaterThan(0);
  });
});
