/**
 * Input: 无（测试夹具）
 * Output: 两柜装柜计划夹具（一行「估算」箱规、一行溢出到第二柜）
 * Pos: 货柜面板/打印/2D 组件测试共用
 */

import type { LoadingPlan } from "@/lib/containerLoading";

const carton = { length: 500, width: 500, height: 500 };

export const twoContainerPlan = (): LoadingPlan => ({
  algorithm: "block-ep-v1",
  containerType: "40HQ",
  container: {
    code: "40HQ",
    label: "40HQ 高柜",
    innerMm: { length: 12020, width: 2350, height: 2695 },
    usableMm: { length: 12000, width: 2340, height: 2665 },
    doorMm: { width: 2340, height: 2580 },
    maxPayloadKg: 26460,
    safeGrossKg: 22000,
    safeVolumeCbm: 68,
  },
  availableTypes: [
    { code: "40HQ", label: "40HQ 高柜" },
    { code: "40GP", label: "40GP 普柜" },
  ],
  lines: [
    {
      lineId: "l1",
      productId: "p1",
      name: "测试瓷砖",
      color: "#FF6B6B",
      cartons: 3,
      kgPerCarton: 10,
      cartonMm: carton,
      dimsSource: "estimated",
      profile: "tile",
      heavy: true,
      upright: true,
      maxStackKg: 600,
    },
    {
      lineId: "l2",
      productId: "p2",
      name: "溢出餐椅",
      color: "#4ECDC4",
      cartons: 2,
      kgPerCarton: 10,
      cartonMm: carton,
      dimsSource: "line",
      profile: "furniture",
      heavy: false,
      upright: true,
      maxStackKg: 120,
    },
  ],
  containers: [
    {
      index: 0,
      blocks: [
        {
          step: 1,
          lineId: "l1",
          x: 0,
          y: 0,
          z: 0,
          nx: 3,
          ny: 1,
          nz: 1,
          cartonMm: carton,
          cartons: 3,
          kg: 30,
        },
      ],
      cartons: 3,
      grossKg: 30,
      cargoCbm: 0.4,
      weightPct: 0.1,
      volumePct: 52.5,
      usedHeightMm: 500,
      cogXmm: 6000,
    },
    {
      index: 1,
      blocks: [
        {
          step: 1,
          lineId: "l2",
          x: 0,
          y: 0,
          z: 0,
          nx: 2,
          ny: 1,
          nz: 1,
          cartonMm: carton,
          cartons: 2,
          kg: 20,
        },
      ],
      cartons: 2,
      grossKg: 20,
      cargoCbm: 0.3,
      weightPct: 0.1,
      volumePct: 10,
      usedHeightMm: 500,
      cogXmm: 6000,
    },
  ],
  unplaced: [],
  totals: { cartons: 5, grossKg: 50, cargoCbm: 0.7 },
  check: {
    ready: false,
    containerType: "40HQ",
    status: "blocked",
    weightPct: 0.2,
    volumePct: 1,
    thresholdPct: 80,
    reachedBy: "none",
    blockers: [
      {
        code: "unplaced",
        message: "仍有 2 箱装不下，共需 2 个40HQ，请拆分订单或更换柜型",
      },
    ],
    warnings: [
      {
        code: "estimated",
        message:
          "1 行箱规为估算（按体积÷箱数推算），装柜结果仅供参考，请补充实际箱规",
      },
    ],
    headline: "仍有 2 箱装不下，共需 2 个40HQ，请拆分订单或更换柜型",
  },
});
