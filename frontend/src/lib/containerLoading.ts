/**
 * Input: 后端 GET /sales/:id/loading-plan 返回的装柜计划（毫米坐标，原点=后墙左侧地面，x 朝柜门）
 * Output: LoadingPlan 等类型、summarizeLoadingPlan（页面横幅摘要）、mmToM
 * Pos: 前端只渲染装柜计划，不再排柜；类型镜像 backend/src/services/containerPacking.js 与 shipmentReadinessService.js
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

export type ContainerTypeCode = "20GP" | "40GP" | "40HQ";
export type DimsSource = "line" | "product" | "estimated" | "missing";

export interface Dims3 {
  length: number;
  width: number;
  height: number;
}

export interface ContainerSpecView {
  code: ContainerTypeCode;
  label: string;
  innerMm: Dims3;
  usableMm: Dims3;
  doorMm: { width: number; height: number };
  maxPayloadKg: number;
  safeGrossKg: number;
  safeVolumeCbm: number;
}

export interface PlanLine {
  lineId: string;
  productId: string | null;
  name: string;
  color: string;
  cartons: number;
  kgPerCarton: number;
  cartonMm: Dims3 | null;
  /** 'estimated' 在界面上标注「估算」 */
  dimsSource: DimsSource;
  profile: string;
  heavy: boolean;
  upright: boolean;
  maxStackKg: number;
}

/** 一个块 = nx×ny×nz 个相同朝向的纸箱；blocks 的顺序即装货顺序。 */
export interface PlacedBlock {
  step: number;
  lineId: string;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  cartonMm: Dims3;
  cartons: number;
  kg: number;
}

export interface LoadedContainer {
  index: number;
  blocks: PlacedBlock[];
  cartons: number;
  grossKg: number;
  cargoCbm: number;
  weightPct: number;
  volumePct: number;
  usedHeightMm: number;
  cogXmm: number;
}

export interface UnplacedLine {
  lineId: string;
  name: string;
  cartons: number;
  reason: "oversize" | "door" | "missing-dimensions" | "no-space";
  cartonMm: Dims3 | null;
}

export interface LoadingCheck {
  ready: boolean;
  containerType: ContainerTypeCode;
  status: "ready" | "under-utilised" | "blocked";
  weightPct: number;
  volumePct: number;
  thresholdPct: number;
  reachedBy: "weight" | "volume" | "both" | "none";
  blockers: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
  headline: string;
}

export interface LoadingPlan {
  algorithm: string;
  containerType: ContainerTypeCode;
  container: ContainerSpecView;
  availableTypes: Array<{ code: ContainerTypeCode; label: string }>;
  lines: PlanLine[];
  containers: LoadedContainer[];
  unplaced: UnplacedLine[];
  totals: { cartons: number; grossKg: number; cargoCbm: number };
  check: LoadingCheck;
}

const PHYSICAL_BLOCKERS = ["missing-dimensions", "oversize", "unplaced"];

/** 职责：把装柜计划压成页面横幅所需的摘要；计划未加载/加载失败时 ready=false（fail closed）。 */
export function summarizeLoadingPlan(plan: LoadingPlan | null, failed = false) {
  if (!plan) {
    return {
      loaded: false,
      failed,
      ready: false,
      blocking: false,
      headline: failed ? "装柜计划加载失败，暂不可登记发运" : "正在核对装柜…",
      weightPct: 0,
      volumePct: 0,
      thresholdPct: null as number | null,
      placedBoxCount: 0,
      unplacedBoxCount: 0,
      estimatedLineCount: 0,
      physicalFit: true,
    };
  }
  const { check } = plan;
  const placed = plan.containers.reduce((sum, c) => sum + c.cartons, 0);
  const first = plan.containers[0]?.cartons ?? 0;
  const unplaced = plan.unplaced.reduce((sum, entry) => sum + entry.cartons, 0);
  return {
    loaded: true,
    failed: false,
    ready: check.ready,
    blocking: check.status === "blocked",
    headline: check.headline,
    weightPct: check.weightPct,
    volumePct: check.volumePct,
    thresholdPct: check.thresholdPct as number | null,
    placedBoxCount: first,
    unplacedBoxCount: unplaced + placed - first,
    estimatedLineCount: plan.lines.filter((l) => l.dimsSource === "estimated")
      .length,
    physicalFit: !check.blockers.some((b) =>
      PHYSICAL_BLOCKERS.includes(b.code),
    ),
  };
}

/** 职责：将毫米转换为米（用于 Three.js 渲染）。 */
export function mmToM(mm: number): number {
  return mm / 1000;
}
