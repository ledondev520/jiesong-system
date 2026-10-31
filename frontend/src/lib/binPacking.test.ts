/**
 * Input: 装箱算法工具
 * Output: 装箱/颜色/单位换算/尺寸推算测试
 * Pos: 前端工具函数测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it } from "vitest";
import containers from "../../../config/containers.json";
import {
  CONTAINER_40HQ,
  SHIPPING_READY_THRESHOLD_PCT,
  buildPackingBoxes,
  countItemsMissingBoxes,
  countItemsMissingDimensions,
  evaluateShippingReadiness,
  generateColor,
  inferBoxDimensions,
  mmToM,
  packBoxes,
} from "./binPacking";

describe("容器规格镜像与 config/containers.json 一致（单一来源守卫）", () => {
  it("40HQ 是配置默认柜型，尺寸与安全上限逐项相等", () => {
    const spec = containers.types["40HQ"];
    expect(containers.default).toBe(CONTAINER_40HQ.code);
    expect(CONTAINER_40HQ.length).toBe(spec.innerMm.length);
    expect(CONTAINER_40HQ.width).toBe(spec.innerMm.width);
    expect(CONTAINER_40HQ.height).toBe(spec.innerMm.height);
    expect(CONTAINER_40HQ.maxWeight).toBe(spec.safeGrossKg);
    expect(CONTAINER_40HQ.maxVolume).toBe(spec.safeVolumeCbm);
    expect(SHIPPING_READY_THRESHOLD_PCT).toBe(containers.readyThresholdPct);
  });
});

describe("binPacking", () => {
  it("packBoxes: 可放置箱子时返回 placed 结果与利用率", () => {
    const result = packBoxes([
      {
        id: "b1",
        name: "箱子A",
        length: 1000,
        width: 800,
        height: 600,
        quantity: 2,
      },
    ]);

    expect(result.placedBoxes.length).toBe(2);
    expect(result.unplacedBoxes.length).toBe(0);
    expect(result.usedVolume).toBeGreaterThan(0);
    expect(result.totalVolume).toBe(
      CONTAINER_40HQ.length * CONTAINER_40HQ.width * CONTAINER_40HQ.height,
    );
    expect(result.utilizationRate).toBeGreaterThan(0);
  });

  it("packBoxes: 超规格箱子会进入 unplaced", () => {
    const result = packBoxes([
      {
        id: "oversize",
        name: "超大箱",
        length: CONTAINER_40HQ.length + 1,
        width: 1000,
        height: 1000,
        quantity: 1,
      },
    ]);

    expect(result.placedBoxes.length).toBe(0);
    expect(result.unplacedBoxes.length).toBe(1);
  });

  it("generateColor: 同一 seed 稳定返回同一颜色", () => {
    const colorA = generateColor("SKU-001");
    const colorB = generateColor("SKU-001");
    const colorC = generateColor("SKU-002");

    expect(colorA).toBe(colorB);
    expect(colorA).toMatch(/^#[0-9A-F]{6}$/i);
    expect(colorC).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("mmToM: 毫米换算米", () => {
    expect(mmToM(2350)).toBe(2.35);
    expect(mmToM(0)).toBe(0);
  });
});

describe("inferBoxDimensions", () => {
  it("1 CBM 推算出合理的三边尺寸（接近标准纸箱比例）", () => {
    const dims = inferBoxDimensions(1)!;
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

  it("体积为 0 或无效时无法推算，返回 null 而不是伪造 500×400×300", () => {
    expect(inferBoxDimensions(0)).toBeNull();
    expect(inferBoxDimensions(-1)).toBeNull();
    expect(inferBoxDimensions(Number.NaN)).toBeNull();
  });

  it("小体积（0.01 CBM）三边不低于 100mm", () => {
    const dims = inferBoxDimensions(0.01)!;
    expect(dims.length).toBeGreaterThanOrEqual(100);
    expect(dims.width).toBeGreaterThanOrEqual(100);
    expect(dims.height).toBeGreaterThanOrEqual(100);
  });

  it("长宽高遵循 1.2:1:0.8 的近似比例", () => {
    const dims = inferBoxDimensions(0.5)!;
    // length 应约为 width 的 1.2 倍，height 约为 0.8 倍（允许1mm舍入误差）
    expect(dims.length / dims.width).toBeCloseTo(1.2, 0);
    expect(dims.height / dims.width).toBeCloseTo(0.8, 0);
  });
});

describe("evaluateShippingReadiness", () => {
  it("毛重达到 22t 的 80%（17.6t）即可出柜", () => {
    const r = evaluateShippingReadiness(17600, 10);
    expect(r.weightPct).toBe(80);
    expect(r.ready).toBe(true);
    expect(r.reachedBy).toBe("weight");
  });

  it("体积达到 68CBM 的 80%（54.4）即可出柜", () => {
    const r = evaluateShippingReadiness(1000, 54.4);
    expect(r.volumePct).toBe(80);
    expect(r.ready).toBe(true);
    expect(r.reachedBy).toBe("volume");
  });

  it("双指标均达标时 reachedBy 为 both", () => {
    const r = evaluateShippingReadiness(22000, 68);
    expect(r.weightPct).toBe(100);
    expect(r.volumePct).toBe(100);
    expect(r.ready).toBe(true);
    expect(r.reachedBy).toBe("both");
  });

  it("双指标均未达 80% 时不可出柜", () => {
    const r = evaluateShippingReadiness(11000, 34);
    expect(r.weightPct).toBe(50);
    expect(r.volumePct).toBe(50);
    expect(r.ready).toBe(false);
    expect(r.reachedBy).toBe("none");
  });

  it("空值/0 安全处理", () => {
    const r = evaluateShippingReadiness(0, 0);
    expect(r.weightPct).toBe(0);
    expect(r.volumePct).toBe(0);
    expect(r.ready).toBe(false);
  });

  it("超过 40HQ 任一安全上限时即使达到80%也不可出柜", () => {
    const r = evaluateShippingReadiness(22060.3, 63.3);

    expect(r.utilizationReady).toBe(true);
    expect(r.overloaded).toBe(true);
    expect(r.overloadReasons).toEqual(["weight"]);
    expect(r.ready).toBe(false);
  });

  it("利用率用未取整数值比较：79.9% 与 79.95% 不达标，80% 达标，100% 仍在上限内，100.1% 超限", () => {
    const at = (pct: number) =>
      evaluateShippingReadiness(0, (CONTAINER_40HQ.maxVolume * pct) / 100);
    expect(at(79.9).ready).toBe(false);
    expect(at(79.95).utilizationReady).toBe(false);
    expect(at(80).ready).toBe(true);
    expect(at(100).ready).toBe(true);
    expect(at(100).overloaded).toBe(false);
    const over = at(100.1);
    expect(over.overloadReasons).toEqual(["volume"]);
    expect(over.ready).toBe(false);
  });

  it("存在未填箱数的明细时不可出柜（与后端 missing-box-count 一致）", () => {
    const r = evaluateShippingReadiness(17600, 10, { missingBoxItemCount: 1 });
    expect(r.utilizationReady).toBe(true);
    expect(r.missingBoxItemCount).toBe(1);
    expect(r.ready).toBe(false);
  });

  it("尚未录入任何装箱明细时不可出柜（与后端 missing-packing-items 一致）", () => {
    expect(
      evaluateShippingReadiness(17600, 10, { packingItemCount: 0 }).ready,
    ).toBe(false);
    expect(
      evaluateShippingReadiness(17600, 10, { packingItemCount: 1 }).ready,
    ).toBe(true);
  });

  it("存在既无箱规也无体积的明细时不可出柜（与后端 missing-dimensions 一致）", () => {
    const r = evaluateShippingReadiness(17600, 10, {
      missingDimensionItemCount: 1,
    });
    expect(r.physicalFit).toBe(false);
    expect(r.ready).toBe(false);
  });

  it("存在未装箱时商业利用率达标也不可出柜", () => {
    const r = evaluateShippingReadiness(8235, 63.85, { unplacedBoxCount: 8 });

    expect(r.utilizationReady).toBe(true);
    expect(r.physicalFit).toBe(false);
    expect(r.ready).toBe(false);
  });
});

describe("buildPackingBoxes", () => {
  it("优先使用明细精确尺寸并按箱数构建箱型", () => {
    const boxes = buildPackingBoxes([
      {
        id: "pk-1",
        productId: "p-1",
        boxes: 3,
        quantity: 6,
        volume: 1.2,
        length: 1000,
        width: 500,
        height: 400,
        product: { id: "p-1", customsName: "酒架" },
      },
    ]);

    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({
      id: "pk-1",
      name: "酒架",
      length: 1000,
      width: 500,
      height: 400,
      quantity: 3,
      isEstimated: false,
    });
  });

  it("缺少尺寸时按总体积除以箱数推算并明确标记", () => {
    const boxes = buildPackingBoxes([
      {
        id: "pk-2",
        productId: "p-2",
        boxes: 2,
        quantity: 4,
        volume: 1,
        product: { id: "p-2", customsName: "灯具" },
      },
    ]);

    expect(boxes[0].quantity).toBe(2);
    expect(boxes[0].isEstimated).toBe(true);
    expect(boxes[0].length * boxes[0].width * boxes[0].height).toBeGreaterThan(
      0.4e9,
    );
  });

  it("既无尺寸也无体积的行不再伪造箱型，改由缺箱规计数体现", () => {
    const items = [
      {
        id: "pk-3",
        productId: "p-3",
        boxes: 2,
        quantity: 4,
        product: { id: "p-3", customsName: "无规格" },
      },
      {
        id: "pk-4",
        productId: "p-4",
        boxes: null,
        quantity: 1,
        volume: 1,
        length: 1,
        width: 1,
        height: 1,
      },
    ];
    expect(buildPackingBoxes(items)).toHaveLength(1);
    expect(buildPackingBoxes(items.slice(0, 1))).toEqual([]);
    expect(countItemsMissingDimensions(items)).toBe(1);
    expect(countItemsMissingBoxes(items)).toBe(1);
  });
});
