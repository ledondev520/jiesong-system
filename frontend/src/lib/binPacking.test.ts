/**
 * Input: 装箱算法工具
 * Output: 装箱/颜色/单位换算测试
 * Pos: 前端工具函数测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it } from 'vitest';
import { CONTAINER_40HQ, generateColor, mmToM, packBoxes } from './binPacking';

describe('binPacking', () => {
  it('packBoxes: 可放置箱子时返回 placed 结果与利用率', () => {
    const result = packBoxes([
      {
        id: 'b1',
        name: '箱子A',
        length: 1000,
        width: 800,
        height: 600,
        quantity: 2,
      },
    ]);

    expect(result.placedBoxes.length).toBe(2);
    expect(result.unplacedBoxes.length).toBe(0);
    expect(result.usedVolume).toBeGreaterThan(0);
    expect(result.totalVolume).toBe(CONTAINER_40HQ.length * CONTAINER_40HQ.width * CONTAINER_40HQ.height);
    expect(result.utilizationRate).toBeGreaterThan(0);
  });

  it('packBoxes: 超规格箱子会进入 unplaced', () => {
    const result = packBoxes([
      {
        id: 'oversize',
        name: '超大箱',
        length: CONTAINER_40HQ.length + 1,
        width: 1000,
        height: 1000,
        quantity: 1,
      },
    ]);

    expect(result.placedBoxes.length).toBe(0);
    expect(result.unplacedBoxes.length).toBe(1);
  });

  it('generateColor: 同一 seed 稳定返回同一颜色', () => {
    const colorA = generateColor('SKU-001');
    const colorB = generateColor('SKU-001');
    const colorC = generateColor('SKU-002');

    expect(colorA).toBe(colorB);
    expect(colorA).toMatch(/^#[0-9A-F]{6}$/i);
    expect(colorC).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('mmToM: 毫米换算米', () => {
    expect(mmToM(2350)).toBe(2.35);
    expect(mmToM(0)).toBe(0);
  });
});
