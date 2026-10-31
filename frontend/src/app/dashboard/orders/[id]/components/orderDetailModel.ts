/**
 * Input: 出口订单详情（明细、装箱、关联采购单）、商品档案
 * Output: 页签键、按状态的唯一下一步、出柜判定文案、按门店履约汇总、待生成采购单的明细
 * Pos: /dashboard/orders/[id] 的纯计算层；不发请求，便于单测
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import {
  PurchaseStatus,
  SalesStatus,
  type PackingItem,
  type Product,
  type SalesContract,
  type SalesItem,
} from "@/types";
import { summarizeLoadingPlan, type LoadingPlan } from "@/lib/containerLoading";

export const ORDER_TABS = [
  { value: "overview", label: "概览" },
  { value: "lines", label: "明细" },
  { value: "purchases", label: "采购" },
  { value: "container", label: "货柜" },
  { value: "docs", label: "单证" },
  { value: "receipts", label: "收款" },
  { value: "refund", label: "退税" },
] as const;

export type OrderTab = (typeof ORDER_TABS)[number]["value"];

// 旧 /dashboard/sales/[id]?tab= 的键（如报表页 ?tab=finance）映射到新页签
const LEGACY_TABS: Record<string, OrderTab> = {
  packing: "container",
  "3d": "container",
  info: "lines",
  customs: "docs",
  finance: "receipts",
};

export const resolveOrderTab = (raw?: string | null): OrderTab => {
  if (!raw) return "overview";
  if (ORDER_TABS.some((tab) => tab.value === raw)) return raw as OrderTab;
  return LEGACY_TABS[raw] ?? "overview";
};

export type NextStepKind = "status" | "purchaseDrafts" | "importPurchase";

export interface NextStep {
  kind: NextStepKind;
  label: string;
  status?: SalesStatus;
}

/**
 * 职责：按状态给出唯一主按钮（UX 规范 §4.2）；流转仍走 salesService.updateStatus
 * CONFIRMED：有未生成采购单的明细且可写采购（ADMIN/PURCHASE）→ 生成采购单，否则 → 选择采购装柜（原导入流程）
 */
export const getNextStep = (
  contract: SalesContract,
  options: { canGeneratePurchase: boolean },
): NextStep | null => {
  switch (contract.status) {
    case SalesStatus.DRAFT:
      return {
        kind: "status",
        label: "确认订单",
        status: SalesStatus.CONFIRMED,
      };
    case SalesStatus.CONFIRMED:
      return options.canGeneratePurchase &&
        pendingPurchaseItems(contract).length > 0
        ? { kind: "purchaseDrafts", label: "生成采购单" }
        : { kind: "importPurchase", label: "选择采购装柜" };
    case SalesStatus.PACKING:
      return { kind: "status", label: "登记发运", status: SalesStatus.SHIPPED };
    case SalesStatus.SHIPPED:
      return { kind: "status", label: "登记到港", status: SalesStatus.ARRIVED };
    case SalesStatus.ARRIVED:
      return {
        kind: "status",
        label: "完成订单",
        status: SalesStatus.COMPLETED,
      };
    default:
      return null;
  }
};

const pairKey = (productId: string, storeId?: string | null) =>
  `${productId}\u0000${storeId ?? ""}`;

const livePurchaseContracts = (contract: SalesContract) =>
  (contract.purchaseContracts ?? []).filter(
    (purchase) => purchase.status !== PurchaseStatus.CANCELLED,
  );

/** 职责：尚未在未取消的采购单中出现的 (商品, 门店) 明细；与后端 409 判定同口径 */
export const pendingPurchaseItems = (contract: SalesContract): SalesItem[] => {
  const generated = new Set(
    livePurchaseContracts(contract).flatMap((purchase) =>
      purchase.items.map((item) => pairKey(item.productId, item.storeId)),
    ),
  );
  return (contract.items ?? []).filter(
    (item) =>
      item.quantity > 0 &&
      !generated.has(pairKey(item.productId, item.storeId)),
  );
};

export interface StoreFulfilmentRow {
  storeId: string;
  storeName: string;
  ordered: number;
  purchased: number;
  received: number;
  packed: number;
}

const UNASSIGNED = "";

/**
 * 职责：「按门店」表——下单 / 已采购（未取消采购单）/ 已验收入库（合格数）/ 已装箱 数量
 * 无门店的采购或装箱行归入「未分门店」，旧数据不丢
 */
export const buildStoreFulfilment = (
  contract: SalesContract,
): StoreFulfilmentRow[] => {
  const names = new Map<string, string>();
  for (const item of [
    ...(contract.items ?? []),
    ...(contract.packingItems ?? []),
  ]) {
    if (item.storeId && item.store?.name)
      names.set(item.storeId, item.store.name);
  }
  const rows = new Map<string, StoreFulfilmentRow>();
  const row = (storeId?: string | null) => {
    const key = storeId || UNASSIGNED;
    let existing = rows.get(key);
    if (!existing) {
      existing = {
        storeId: key,
        storeName: key ? (names.get(key) ?? "未知门店") : "未分门店",
        ordered: 0,
        purchased: 0,
        received: 0,
        packed: 0,
      };
      rows.set(key, existing);
    }
    return existing;
  };

  for (const item of contract.items ?? []) {
    row(item.storeId).ordered += item.quantity || 0;
  }
  for (const purchase of livePurchaseContracts(contract)) {
    for (const item of purchase.items) {
      const target = row(item.storeId);
      target.purchased += item.quantity || 0;
      target.received += (item.receiptItems ?? []).reduce(
        (sum, receipt) => sum + (receipt.acceptedQuantity || 0),
        0,
      );
    }
  }
  // 历史导入行无 storeId：经来源采购明细回填门店，仍无法确定的才归「未分门店」
  const purchaseItemStore = new Map<string, string | null | undefined>();
  for (const purchase of contract.purchaseContracts ?? []) {
    for (const item of purchase.items)
      purchaseItemStore.set(item.id, item.storeId);
  }
  for (const item of contract.packingItems ?? []) {
    const storeId =
      item.storeId ||
      (item.purchaseItemId ? purchaseItemStore.get(item.purchaseItemId) : null);
    row(storeId).packed += item.quantity || 0;
  }

  return [...rows.values()].sort((a, b) => {
    if (!a.storeId) return 1;
    if (!b.storeId) return -1;
    return a.storeName.localeCompare(b.storeName, "zh-CN");
  });
};

const SHIPPED_STATUSES = [
  SalesStatus.SHIPPED,
  SalesStatus.ARRIVED,
  SalesStatus.COMPLETED,
];

export const hasOrderShipped = (status: SalesStatus) =>
  SHIPPED_STATUSES.includes(status);

/**
 * 职责：毛重/体积/箱数取自装箱明细行（与后端 sumTotals 一致），不信任可编辑的合同头
 */
export const sumPackingTotals = (packingRows: PackingItem[]) => {
  const sum = (pick: (item: PackingItem) => number | null | undefined) =>
    packingRows.reduce(
      (total, item) => total + Math.max(0, Number(pick(item)) || 0),
      0,
    );
  return {
    cartons: packingRows.reduce(
      (total, item) => total + Math.max(0, Math.trunc(Number(item.boxes) || 0)),
      0,
    ),
    grossKg: sum((item) => item.grossWeight),
    cargoCbm: sum((item) => item.volume),
  };
};

/**
 * 职责：出柜判定。排柜与门槛（40HQ、毛重/体积任一 ≥80%、全部可装）完全来自后端 loading-plan，
 * 前端只做文案；plan 未取到时 fail closed（不可登记发运）
 */
export const evaluateOrderReadiness = (
  status: SalesStatus,
  packingRows: PackingItem[],
  plan: LoadingPlan | null,
) => {
  const totals = sumPackingTotals(packingRows);
  const summary = summarizeLoadingPlan(plan);
  const hasShipped = hasOrderShipped(status);
  const isBlocking = summary.blocking;
  const headline = hasShipped
    ? `历史装箱数据${summary.ready ? "模拟核对" : "待核对"}：${summary.headline}`
    : `${isBlocking ? "不可出货：" : ""}${summary.headline}`;

  return {
    totals,
    plan,
    summary,
    estimatedDimensionCount: summary.estimatedLineCount,
    readiness: {
      ready: summary.ready,
      weightPct: summary.weightPct,
      volumePct: summary.volumePct,
      physicalFit: summary.physicalFit,
    },
    hasShipped,
    isBlocking,
    headline,
  };
};

export type OrderReadiness = ReturnType<typeof evaluateOrderReadiness>;
