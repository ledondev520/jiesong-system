/**
 * Input: SalesFinancePanel、真实 React 调度（非 act 环境，被动 effect 晚于 layout effect 一个任务执行）、合成财务汇总请求
 * Output: 切换合同后、被动 effect 发起新请求之前到达的旧响应不得改写渲染期重置的加载/失败状态（与原 effect 内同步重置一致）的回归测试
 * Pos: 出口专项单财务结算 resetPendingRef 窗口回归测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SalesFinancePanel } from "./SalesFinancePanel";

const mockGetFinanceSummary = vi.hoisted(() => vi.fn());

vi.mock("@/services/sales.service", () => ({
  salesService: {
    getFinanceSummary: (...args: unknown[]) => mockGetFinanceSummary(...args),
  },
}));
vi.mock("@/services/finance.service", () => ({
  financeService: { createPayment: vi.fn() },
}));
vi.mock("@/app/dashboard/finance/components/PaymentDialog", () => ({
  PaymentDialog: () => null,
}));

function defer<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

const summary = {
  salesContractId: "sales-1",
  contractNo: "EXP260001",
  currencyPolicy: {
    salesReceiptCurrency: "USD",
    purchasePaymentCurrency: "CNY",
    conversionRate: 7,
  },
  marginReady: true,
  cashReady: true,
  revenue: {
    contractTotalUsd: 1000,
    ownedRevenueUsd: 600,
    receivedUsd: 240,
    outstandingUsd: 360,
    receivedSource: "payment_records" as const,
  },
  cost: {
    purchaseCostCny: 3000,
    paidPurchaseCostCny: 1500,
    outstandingPurchaseCostCny: 1500,
  },
  tax: { estimatedRefundCny: 200, actualRefundedCny: 100 },
  profit: {
    expectedRevenueCny: 4200,
    estimatedGrossProfitCny: 1400,
    estimatedGrossMarginPct: 33.33,
    scope: "商品口径说明",
  },
  cashFlow: {
    customerReceiptsCny: 1680,
    actualTaxRefundCny: 100,
    supplierPaymentsCny: 1500,
    netCashCny: 280,
  },
  receipts: [],
  linkedPurchases: [],
  issues: [],
};

/** 在本次提交的 layout 阶段结算旧请求：回调在微任务中执行，早于下一任务中的被动 effect */
function SettleInLayout({ settle }: { settle: (() => void) | null }) {
  useLayoutEffect(() => {
    settle?.();
  }, [settle]);
  return null;
}

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));
async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await nextTask();
  expect(check()).toBe(true);
}

describe("SalesFinancePanel 被动 effect 前到达的旧响应", () => {
  let container: HTMLDivElement;
  let root: Root;
  let previousActEnvironment: unknown;

  beforeEach(() => {
    // 非 act 环境下 React 在独立任务中执行被动 effect，才能复现 layout 与被动 effect 之间的窗口
    previousActEnvironment = (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }
    ).IS_REACT_ACT_ENVIRONMENT;
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = false;
    mockGetFinanceSummary.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    root.unmount();
    container.remove();
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }
    ).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    await nextTask();
  });

  async function switchWhileOldPending(
    settleOld: (old: ReturnType<typeof defer<unknown>>) => void,
  ) {
    const oldRequest = defer<unknown>();
    const newRequest = defer<unknown>();
    mockGetFinanceSummary
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);

    root.render(
      <>
        <SalesFinancePanel salesContractId="sales-1" contractNo="EXP260001" />
        <SettleInLayout settle={null} />
      </>,
    );
    await until(() => mockGetFinanceSummary.mock.calls.length === 1);

    root.render(
      <>
        <SalesFinancePanel salesContractId="sales-2" contractNo="EXP260002" />
        <SettleInLayout settle={() => settleOld(oldRequest)} />
      </>,
    );
    await until(() => mockGetFinanceSummary.mock.calls.length === 2);
    await nextTask();
    return newRequest;
  }

  it("旧请求失败落在窗口内时，新请求在途仍显示加载态而非失败", async () => {
    const newRequest = await switchWhileOldPending((old) =>
      old.reject(new Error("旧合同读取失败")),
    );
    expect(mockGetFinanceSummary).toHaveBeenLastCalledWith("sales-2");
    expect(container.textContent).not.toContain("单柜财务汇总加载失败");
    expect(
      container.querySelector('[aria-label="财务结算加载中"]'),
    ).not.toBeNull();

    newRequest.resolve({ data: { ...summary, salesContractId: "sales-2" } });
    await until(() => (container.textContent ?? "").includes("单柜财务结算"));
  });

  it("旧请求成功落在窗口内时，旧数据照常写入且新请求在途仍显示刷新提示", async () => {
    const newRequest = await switchWhileOldPending((old) =>
      old.resolve({ data: summary }),
    );
    expect(mockGetFinanceSummary).toHaveBeenLastCalledWith("sales-2");
    expect(container.textContent).toContain("单柜财务结算");
    expect(container.textContent).toContain("正在刷新财务口径");

    newRequest.resolve({ data: { ...summary, salesContractId: "sales-2" } });
    await until(
      () => !(container.textContent ?? "").includes("正在刷新财务口径"),
    );
  });
});
