/**
 * Input: 已发运订单的 OrderOverviewTab / OrderContainerTab 渲染
 * Output: 历史装箱告警不显示红色，利用率不显示绿色「达标」
 * Pos: BL-7 复核 P3：中性处理延伸到概览页签与利用率数字；未发运订单保持原告警色
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SalesContract } from "@/types";
import { OrderContainerTab } from "./OrderContainerTab";
import { OrderOverviewTab } from "./OrderOverviewTab";
import { evaluateOrderReadiness } from "./orderDetailModel";

vi.mock("@/lib/hooks/useMobile", () => ({ useMobile: () => true }));
vi.mock("@/services/sales.service", () => ({
  salesService: { getLoadingPlan: vi.fn(), removePackingItem: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const contractOf = (status: string) =>
  ({
    id: "s-1",
    contractNo: "EXP-1",
    status,
    items: [],
    packingItems: [],
  }) as unknown as SalesContract;

// 手工置为阻断，利用率拉到 99% 以触发「达标」配色（plan 缺失时 blocking 本为 false）
const readinessOf = (status: string) => {
  const r = evaluateOrderReadiness(status as never, [], null, true);
  return {
    ...r,
    isBlocking: true,
    summary: { ...r.summary, thresholdPct: 80 },
    readiness: { ...r.readiness, weightPct: 99, volumePct: 99 },
  };
};

const renderOverview = (status: string) => {
  render(
    <OrderOverviewTab
      contract={contractOf(status)}
      readiness={readinessOf(status)}
    />,
  );
  return screen.getByText(/装柜计划加载失败/);
};

const renderContainer = (status: string) =>
  render(
    <OrderContainerTab
      contract={contractOf(status)}
      products={[]}
      inventories={[]}
      referenceDataLoading={false}
      readiness={readinessOf(status)}
      onRetryPlan={vi.fn()}
      itemDialogOpen={false}
      onItemDialogOpenChange={vi.fn()}
      onImportPurchase={vi.fn()}
      onChanged={vi.fn()}
    />,
  );

describe("已发运订单的历史装箱告警配色", () => {
  it("概览页签：已发运的阻断 headline 为中性色，未发运仍为红色", () => {
    expect(renderOverview("SHIPPED").className).not.toContain("destructive");
  });

  it("概览页签：未发运的阻断 headline 保持红色", () => {
    expect(renderOverview("PACKING").className).toContain("text-destructive");
  });

  it("货柜页签：已发运的利用率不显示绿色，未发运达标仍为绿色", () => {
    const shipped = renderContainer("SHIPPED");
    expect(shipped.container.innerHTML).not.toContain("text-status-green");
    shipped.unmount();
    const packing = renderContainer("PACKING");
    expect(
      packing.container.querySelector("span.text-status-green"),
    ).not.toBeNull();
  });
});
