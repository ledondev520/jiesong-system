/**
 * Input: 以 open=true 首次挂载、请求未返回的导入弹窗
 * Output: 首次打开期间显示加载态而非空态的回归测试
 * Pos: 装柜阶段采购来源导入对话框加载态测试
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImportPurchaseItemsDialog } from "./ImportPurchaseItemsDialog";

const mockGetAvailable = vi.fn();

vi.mock("@/services/sales.service", () => ({
  salesService: {
    getAvailablePurchaseItems: (...args: unknown[]) =>
      mockGetAvailable(...args),
    importPurchaseItems: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("ImportPurchaseItemsDialog 首次打开加载态", () => {
  it("以 open=true 挂载且请求未返回时显示加载中，不显示空态", () => {
    mockGetAvailable.mockReturnValue(new Promise(() => {}));
    render(
      <ImportPurchaseItemsDialog
        open
        onOpenChange={vi.fn()}
        salesContractId="sc-1"
        onImported={vi.fn()}
      />,
    );

    expect(screen.getByText("加载已完工采购资料...")).toBeInTheDocument();
    expect(
      screen.queryByText("没有可导入的已完工采购"),
    ).not.toBeInTheDocument();
    expect(mockGetAvailable).toHaveBeenCalledWith("sc-1");
  });
});
