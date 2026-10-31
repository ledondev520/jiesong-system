/**
 * Input: ContainerLoadingPanel、可控的 getLoadingPlan 延迟响应
 * Output: 柜型模拟的乱序响应、重置、换合同、失败提示不被过期请求覆盖的测试结果
 * Pos: C5-04 回归；Radix Select 以原生 select 代替，3D/导出以替身代替
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContainerLoadingPanel from "./ContainerLoadingPanel";
import { twoContainerPlan } from "./containerFixtures";
import { salesService } from "@/services/sales.service";
import { toast } from "sonner";
import type { ContainerTypeCode, LoadingPlan } from "@/lib/containerLoading";

vi.mock("@/lib/hooks/useMobile", () => ({ useMobile: () => true }));
vi.mock("@/services/sales.service", () => ({
  salesService: { getLoadingPlan: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("./containerExport", () => ({
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

const basePlan = (): LoadingPlan => ({
  ...twoContainerPlan(),
  availableTypes: [
    { code: "40HQ", label: "40HQ" },
    { code: "40GP", label: "40GP" },
    { code: "20GP", label: "20GP" },
  ],
});
const planOf = (code: ContainerTypeCode): LoadingPlan => ({
  ...basePlan(),
  containerType: code,
});

type Resolver = (value: { data: LoadingPlan }) => void;
const pending: Record<
  string,
  { resolve: Resolver; reject: (e: Error) => void }
> = {};

const select = () => screen.getByRole("combobox", { name: "柜型" });
const selected = () => (select() as HTMLSelectElement).value;
const renderPanel = (contract = "s-1", plan = basePlan()) =>
  render(
    <ContainerLoadingPanel
      plan={plan}
      salesContractId={contract}
      contractNo="EXP001"
    />,
  );

describe("ContainerLoadingPanel 柜型模拟的过期响应 (C5-04)", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockReset();
    vi.mocked(salesService.getLoadingPlan).mockImplementation(
      (_id: string, code?: ContainerTypeCode) =>
        new Promise((resolve, reject) => {
          pending[code as string] = { resolve: resolve as Resolver, reject };
        }) as never,
    );
  });

  it("先选 20GP 再选 40GP，20GP 后到的响应不覆盖当前选择", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.selectOptions(select(), "20GP");
    await user.selectOptions(select(), "40GP");
    await act(async () => pending["40GP"].resolve({ data: planOf("40GP") }));
    expect(selected()).toBe("40GP");
    await act(async () => pending["20GP"].resolve({ data: planOf("20GP") }));
    expect(selected()).toBe("40GP");
  });

  it("请求在途时回到默认柜型，旧响应与旧错误都被忽略", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.selectOptions(select(), "20GP");
    await user.selectOptions(select(), "40HQ");
    await act(async () => pending["20GP"].resolve({ data: planOf("20GP") }));
    expect(selected()).toBe("40HQ");

    await user.selectOptions(select(), "40GP");
    await user.selectOptions(select(), "40HQ");
    await act(async () => pending["40GP"].reject(new Error("late")));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("最新请求失败仍提示，且保持当前计划", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.selectOptions(select(), "40GP");
    pending["40GP"].reject(new Error("boom"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("柜型模拟失败"),
    );
    expect(selected()).toBe("40HQ");
  });

  it("换合同或默认计划后，在途模拟作废并回到默认计划", async () => {
    const user = userEvent.setup();
    const view = renderPanel("s-1");
    await user.selectOptions(select(), "20GP");
    view.rerender(
      <ContainerLoadingPanel
        plan={basePlan()}
        salesContractId="s-2"
        contractNo="EXP002"
      />,
    );
    await act(async () => pending["20GP"].resolve({ data: planOf("20GP") }));
    expect(selected()).toBe("40HQ");
  });
});
