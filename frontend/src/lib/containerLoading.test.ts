/**
 * Input: 装柜计划夹具（就绪/阻塞/未加载）
 * Output: summarizeLoadingPlan 横幅摘要契约测试
 * Pos: lib/containerLoading.ts 的回归测试
 */

import { describe, expect, it } from "vitest";
import { mmToM, summarizeLoadingPlan, type LoadingPlan } from "./containerLoading";

const basePlan = (overrides: Partial<LoadingPlan> = {}): LoadingPlan => ({
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
  availableTypes: [{ code: "40HQ", label: "40HQ 高柜" }],
  lines: [],
  containers: [],
  unplaced: [],
  totals: { cartons: 0, grossKg: 0, cargoCbm: 0 },
  check: {
    ready: true,
    containerType: "40HQ",
    status: "ready",
    weightPct: 4.5,
    volumePct: 88.2,
    thresholdPct: 80,
    reachedBy: "volume",
    blockers: [],
    warnings: [],
    headline: "可出柜：体积 88.2%、毛重 4.5%，全部 1 箱已装入 1 个40HQ",
  },
  ...overrides,
});

const container = (index: number, cartons: number) => ({
  index,
  blocks: [],
  cartons,
  grossKg: 0,
  cargoCbm: 0,
  weightPct: 0,
  volumePct: 0,
  usedHeightMm: 0,
  cogXmm: 6000,
});

describe("summarizeLoadingPlan", () => {
  it("计划未加载时 fail closed：不就绪、不显示阈值", () => {
    const summary = summarizeLoadingPlan(null);
    expect(summary.loaded).toBe(false);
    expect(summary.ready).toBe(false);
    expect(summary.blocking).toBe(false);
    expect(summary.thresholdPct).toBeNull();
  });

  it("就绪计划透传后端 headline 与利用率", () => {
    const summary = summarizeLoadingPlan(
      basePlan({ containers: [container(0, 1)] }),
    );
    expect(summary.ready).toBe(true);
    expect(summary.blocking).toBe(false);
    expect(summary.headline).toMatch(/^可出柜/);
    expect(summary.thresholdPct).toBe(80);
    expect(summary.placedBoxCount).toBe(1);
    expect(summary.unplacedBoxCount).toBe(0);
    expect(summary.physicalFit).toBe(true);
  });

  it("溢出柜与 unplaced 计入未装，unplaced 阻塞使 physicalFit 为 false", () => {
    const plan = basePlan({
      containers: [container(0, 700), container(1, 91)],
      unplaced: [
        { lineId: "l1", name: "大箱", cartons: 2, reason: "oversize", cartonMm: null },
      ],
      check: {
        ...basePlan().check,
        ready: false,
        status: "blocked",
        blockers: [{ code: "unplaced", message: "仍有 91 箱装不下" }],
        headline: "仍有 91 箱装不下",
      },
    });
    const summary = summarizeLoadingPlan(plan);
    expect(summary.ready).toBe(false);
    expect(summary.blocking).toBe(true);
    expect(summary.placedBoxCount).toBe(700);
    expect(summary.unplacedBoxCount).toBe(93);
    expect(summary.physicalFit).toBe(false);
  });

  it("仅未达利用率时不算阻塞（amber）但不就绪", () => {
    const summary = summarizeLoadingPlan(
      basePlan({
        containers: [container(0, 1)],
        check: {
          ...basePlan().check,
          ready: false,
          status: "under-utilised",
          blockers: [{ code: "under-utilised", message: "未达出柜标准" }],
          headline: "未达出柜标准",
        },
      }),
    );
    expect(summary.ready).toBe(false);
    expect(summary.blocking).toBe(false);
    expect(summary.physicalFit).toBe(true);
  });

  it("estimatedLineCount 统计「估算」箱规行数", () => {
    const line = {
      lineId: "l1", productId: "p", name: "估算货", color: "#000", cartons: 1, kgPerCarton: 1,
      cartonMm: null, dimsSource: "estimated" as const, profile: "default", heavy: false, upright: true, maxStackKg: 300,
    };
    expect(
      summarizeLoadingPlan(basePlan({ lines: [line, { ...line, lineId: "l2", dimsSource: "line" }] }))
        .estimatedLineCount,
    ).toBe(1);
  });

  it("mmToM 毫米转米", () => {
    expect(mmToM(12020)).toBeCloseTo(12.02);
  });
});
