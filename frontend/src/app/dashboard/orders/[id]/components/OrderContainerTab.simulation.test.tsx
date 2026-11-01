/**
 * Input: OrderContainerTab（真实 ContainerLoadingPanel）、可控的 getLoadingPlan 延迟响应
 * Output: 货柜页签宿主路径下，柜型模拟的在途响应在默认计划/合同刷新后被丢弃的测试结果
 * Pos: C5-04 在 OrderContainerTab 宿主路径的回归；Radix Select 以原生 select 代替，3D/导出以替身代替
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { twoContainerPlan } from "@/components/container/containerFixtures";
import type { ContainerTypeCode, LoadingPlan } from "@/lib/containerLoading";
import type { SalesContract } from "@/types";
import { salesService } from "@/services/sales.service";
import { OrderContainerTab } from "./OrderContainerTab";
import { evaluateOrderReadiness } from "./orderDetailModel";

vi.mock("@/lib/hooks/useMobile", () => ({ useMobile: () => true }));
vi.mock("@/services/sales.service", () => ({
  salesService: { getLoadingPlan: vi.fn(), removePackingItem: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/container/containerExport", () => ({
  exportPagePng: vi.fn(),
  exportPagesPdf: vi.fn(),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      aria-label="柜型"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({ value, children }: { value: string; children: string }) => (
    <option value={value}>{children}</option>
  ),
}));

const planOf = (code: ContainerTypeCode): LoadingPlan => ({
  ...twoContainerPlan(),
  containerType: code,
  availableTypes: [
    { code: "40HQ", label: "40HQ" },
    { code: "20GP", label: "20GP" },
  ],
});

const contractOf = (id: string): SalesContract =>
  ({
    id,
    contractNo: `EXP-${id}`,
    status: "PACKING",
    packingItems: [{ id: "pk-1", boxes: 1, volume: 1, grossWeight: 1 }],
  }) as unknown as SalesContract;

const tab = (contract: SalesContract, plan: LoadingPlan) => (
  <OrderContainerTab
    contract={contract}
    products={[]}
    inventories={[]}
    referenceDataLoading={false}
    readiness={evaluateOrderReadiness(
      contract.status,
      contract.packingItems ?? [],
      plan,
    )}
    onRetryPlan={vi.fn()}
    itemDialogOpen={false}
    onItemDialogOpenChange={vi.fn()}
    onImportPurchase={vi.fn()}
    onChanged={vi.fn()}
  />
);

let resolve20GP: (value: { data: LoadingPlan }) => void = () => {};
const select = () => screen.getByRole("combobox", { name: "柜型" });

describe("OrderContainerTab 宿主路径的柜型模拟过期响应 (C5-04)", () => {
  beforeEach(() => {
    vi.mocked(salesService.getLoadingPlan).mockImplementation(
      () => new Promise((resolve) => (resolve20GP = resolve)) as never,
    );
  });

  it("合同刷新带来新的默认计划后，在途的 20GP 模拟结果不再生效", async () => {
    const user = userEvent.setup();
    const contract = contractOf("s-1");
    const view = render(tab(contract, planOf("40HQ")));
    await user.selectOptions(select(), "20GP");

    // 宿主刷新：新合同对象 + 新默认计划
    view.rerender(tab({ ...contract }, planOf("40HQ")));
    await act(async () => resolve20GP({ data: planOf("20GP") }));

    expect((select() as HTMLSelectElement).value).toBe("40HQ");
  });

  it("在途模拟期间切换到另一份合同，旧合同的结果不会显示", async () => {
    const user = userEvent.setup();
    const view = render(tab(contractOf("s-1"), planOf("40HQ")));
    await user.selectOptions(select(), "20GP");

    view.rerender(tab(contractOf("s-2"), planOf("40HQ")));
    await act(async () => resolve20GP({ data: planOf("20GP") }));

    expect((select() as HTMLSelectElement).value).toBe("40HQ");
  });
});
