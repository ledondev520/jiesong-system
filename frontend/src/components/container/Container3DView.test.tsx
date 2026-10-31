/**
 * Input: Container3DView组件、后端装柜计划夹具（Canvas/drei 以替身渲染）
 * Output: 3D装箱统计渲染、每块一个 instancedMesh、估算标注与多柜切换测试结果
 * Pos: 容器可视化组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import Container3DView from "./Container3DView";
import type { LoadingPlan } from "@/lib/containerLoading";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
}));

vi.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  PerspectiveCamera: () => null,
  Environment: () => null,
  Html: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const block = (step: number, lineId: string, cartons: number) => ({
  step,
  lineId,
  x: 0,
  y: 0,
  z: 0,
  nx: cartons,
  ny: 1,
  nz: 1,
  cartonMm: { length: 500, width: 500, height: 500 },
  cartons,
  kg: cartons * 10,
});

const plan = (): LoadingPlan => ({
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
  lines: [
    {
      lineId: "l1", productId: "p1", name: "测试商品", color: "#FF6B6B", cartons: 3, kgPerCarton: 10,
      cartonMm: { length: 500, width: 500, height: 500 }, dimsSource: "estimated",
      profile: "default", heavy: false, upright: true, maxStackKg: 300,
    },
    {
      lineId: "l2", productId: "p2", name: "溢出商品", color: "#4ECDC4", cartons: 2, kgPerCarton: 10,
      cartonMm: { length: 500, width: 500, height: 500 }, dimsSource: "line",
      profile: "default", heavy: false, upright: true, maxStackKg: 300,
    },
  ],
  containers: [
    {
      index: 0, blocks: [block(1, "l1", 3)], cartons: 3, grossKg: 30, cargoCbm: 0.4,
      weightPct: 0.1, volumePct: 52.5, usedHeightMm: 500, cogXmm: 6000,
    },
    {
      index: 1, blocks: [block(1, "l2", 2)], cartons: 2, grossKg: 20, cargoCbm: 0.3,
      weightPct: 0.1, volumePct: 10, usedHeightMm: 500, cogXmm: 6000,
    },
  ],
  unplaced: [],
  totals: { cartons: 5, grossKg: 50, cargoCbm: 0.7 },
  check: {
    ready: false, containerType: "40HQ", status: "blocked", weightPct: 0.1, volumePct: 1,
    thresholdPct: 80, reachedBy: "none", blockers: [], warnings: [], headline: "仍有 2 箱装不下",
  },
});

describe("Container3DView", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("渲染本柜装箱统计、溢出柜计入未装与估算提示", () => {
    render(<Container3DView plan={plan()} />);

    expect(screen.getByText("装箱统计")).toBeInTheDocument();
    expect(screen.getByText("已装: 3 箱")).toBeInTheDocument();
    expect(screen.getByText("未装: 2 箱")).toBeInTheDocument();
    expect(screen.getByText("体积: 52.5% · 毛重: 0.1%")).toBeInTheDocument();
    expect(screen.getByText("第 1 / 2 柜")).toBeInTheDocument();
    expect(screen.getByText("⚠ 1 项尺寸已预估")).toBeInTheDocument();
  });

  it("每个块只渲染一个 instancedMesh，并按 containerIndex 切换柜", () => {
    const { container, rerender } = render(<Container3DView plan={plan()} />);
    expect(container.querySelectorAll("instancedmesh")).toHaveLength(1);

    rerender(<Container3DView plan={plan()} containerIndex={1} />);
    expect(screen.getByText("已装: 2 箱")).toBeInTheDocument();
    expect(screen.getByText("第 2 / 2 柜")).toBeInTheDocument();
  });

  it("柜体尺寸标注来自计划而非硬编码", () => {
    render(<Container3DView plan={plan()} />);
    expect(screen.getByText("12020mm")).toBeInTheDocument();
    expect(screen.getByText("2695mm")).toBeInTheDocument();
    expect(screen.getByText("2350mm")).toBeInTheDocument();
  });
});
