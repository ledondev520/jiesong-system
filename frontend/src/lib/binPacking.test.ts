/**
 * Input: 装箱算法工具
 * Output: 装箱/颜色/单位换算/尺寸推算测试
 * Pos: 前端工具函数测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it } from 'vitest';
import {
  CONTAINER_40HQ,
  buildPackingBoxes,
  evaluateShippingReadiness,
  generateColor,
  inferBoxDimensions,
  mmToM,
  packBoxes,
} from './binPacking';

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

describe('inferBoxDimensions', () => {
  it('1 CBM 推算出合理的三边尺寸（接近标准纸箱比例）', () => {
    const dims = inferBoxDimensions(1);
    // 体积应接近 1 CBM = 1e9 mm³
    const volume = dims.length * dims.width * dims.height;
    expect(volume).toBeGreaterThan(0.8e9);
    expect(volume).toBeLessThan(1.3e9);
    // 三边均在合理范围内
    expect(dims.length).toBeGreaterThan(100);
    expect(dims.width).toBeGreaterThan(100);
    expect(dims.height).toBeGreaterThan(100);
    expect(dims.isEstimated).toBe(true);
  });

  it('体积为 0 或无效时返回保底默认值', () => {
    const a = inferBoxDimensions(0);
    const b = inferBoxDimensions(-1);
    expect(a.length).toBe(500);
    expect(a.width).toBe(400);
    expect(a.height).toBe(300);
    expect(a.isEstimated).toBe(true);
    expect(b.length).toBe(500);
  });

  it('小体积（0.01 CBM）三边不低于 100mm', () => {
    const dims = inferBoxDimensions(0.01);
    expect(dims.length).toBeGreaterThanOrEqual(100);
    expect(dims.width).toBeGreaterThanOrEqual(100);
    expect(dims.height).toBeGreaterThanOrEqual(100);
  });

  it('长宽高遵循 1.2:1:0.8 的近似比例', () => {
    const dims = inferBoxDimensions(0.5);
    // length 应约为 width 的 1.2 倍，height 约为 0.8 倍（允许1mm舍入误差）
    expect(dims.length / dims.width).toBeCloseTo(1.2, 0);
    expect(dims.height / dims.width).toBeCloseTo(0.8, 0);
  });
});

describe('evaluateShippingReadiness', () => {
  it('毛重达到 22t 的 80%（17.6t）即可出柜', () => {
    const r = evaluateShippingReadiness(17600, 10);
    expect(r.weightPct).toBe(80);
    expect(r.ready).toBe(true);
    expect(r.reachedBy).toBe('weight');
  });

  it('体积达到 68CBM 的 80%（54.4）即可出柜', () => {
    const r = evaluateShippingReadiness(1000, 54.4);
    expect(r.volumePct).toBe(80);
    expect(r.ready).toBe(true);
    expect(r.reachedBy).toBe('volume');
  });

  it('双指标均达标时 reachedBy 为 both', () => {
    const r = evaluateShippingReadiness(22000, 68);
    expect(r.weightPct).toBe(100);
    expect(r.volumePct).toBe(100);
    expect(r.ready).toBe(true);
    expect(r.reachedBy).toBe('both');
  });

  it('双指标均未达 80% 时不可出柜', () => {
    const r = evaluateShippingReadiness(11000, 34);
    expect(r.weightPct).toBe(50);
    expect(r.volumePct).toBe(50);
    expect(r.ready).toBe(false);
    expect(r.reachedBy).toBe('none');
  });

  it('空值/0 安全处理', () => {
    const r = evaluateShippingReadiness(0, 0);
    expect(r.weightPct).toBe(0);
    expect(r.volumePct).toBe(0);
    expect(r.ready).toBe(false);
  });

  it('超过 40HQ 任一安全上限时即使达到80%也不可出柜', () => {
    const r = evaluateShippingReadiness(22060.3, 63.3);

    expect(r.utilizationReady).toBe(true);
    expect(r.overloaded).toBe(true);
    expect(r.overloadReasons).toEqual(['weight']);
    expect(r.ready).toBe(false);
  });

  it('存在未装箱时商业利用率达标也不可出柜', () => {
    const r = evaluateShippingReadiness(8235, 63.85, { unplacedBoxCount: 8 });

    expect(r.utilizationReady).toBe(true);
    expect(r.physicalFit).toBe(false);
    expect(r.ready).toBe(false);
  });
});

describe('buildPackingBoxes', () => {
  it('优先使用明细精确尺寸并按箱数构建箱型', () => {
    const boxes = buildPackingBoxes([
      {
        id: 'pk-1',
        productId: 'p-1',
        boxes: 3,
        quantity: 6,
        volume: 1.2,
        length: 1000,
        width: 500,
        height: 400,
        product: { id: 'p-1', customsName: '酒架' },
      },
    ]);

    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({
      id: 'pk-1',
      name: '酒架',
      length: 1000,
      width: 500,
      height: 400,
      quantity: 3,
      isEstimated: false,
    });
  });

  it('缺少尺寸时按总体积除以箱数推算并明确标记', () => {
    const boxes = buildPackingBoxes([
      {
        id: 'pk-2',
        productId: 'p-2',
        boxes: 2,
        quantity: 4,
        volume: 1,
        product: { id: 'p-2', customsName: '灯具' },
      },
    ]);

    expect(boxes[0].quantity).toBe(2);
    expect(boxes[0].isEstimated).toBe(true);
    expect(boxes[0].length * boxes[0].width * boxes[0].height).toBeGreaterThan(0.4e9);
  });
});
