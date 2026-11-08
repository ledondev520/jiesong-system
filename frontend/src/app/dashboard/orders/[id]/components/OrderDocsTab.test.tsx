/**
 * Input: OrderDocsTab 与含重复未匹配 HS 商品名的装箱明细
 * Output: 重复名称只显示一次并标注 ×N 的回归测试
 * Pos: 出口订单单证页签测试
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SalesContract } from "@/types";
import { OrderDocsTab } from "./OrderDocsTab";
import { useAuthStore } from "@/store/auth.store";

vi.mock("@/components/contract/ContractFiles", () => ({
  default: () => null,
}));
vi.mock("@/lib/hooks/useBusinessReadOnly", () => ({
  BusinessWrite: ({ children }: { children: React.ReactNode }) => children,
}));

const item = (name: string) => ({
  quantity: 1,
  totalPrice: 1,
  product: { customsName: name, hsCode: "" },
});

const renderTab = (names: string[], role?: string) => {
  useAuthStore.setState({ user: role ? ({ id: "u1", role } as never) : null });
  return renderTabInner(names);
};

const renderTabInner = (names: string[]) =>
  render(
    <OrderDocsTab
      contract={{ packingItems: names.map(item) } as unknown as SalesContract}
      files={[]}
      onFilesChange={() => {}}
      onResolveHs={() => {}}
    />,
  );

describe("OrderDocsTab 未匹配 HS", () => {
  it("重复商品名只列一次并标注数量", () => {
    renderTab(["密胺餐具", "密胺餐具"]);
    expect(screen.getByText("未匹配：密胺餐具 ×2")).toBeInTheDocument();
  });

  it("不同商品名保持原样", () => {
    renderTab(["密胺餐具", "水杯"]);
    expect(screen.getByText("未匹配：密胺餐具、水杯")).toBeInTheDocument();
  });
});

describe("OrderDocsTab 处理未匹配 HS 按钮（R3 P1-3）", () => {
  const button = () =>
    screen.getByRole("button", { name: "处理未匹配 HS 编码" });

  it.each(["WAREHOUSE", "PURCHASE"])("%s 不可用", (role) => {
    renderTab(["水杯"], role);
    expect(button()).toBeDisabled();
  });

  it.each(["ADMIN", "SALES", "FINANCE"])("%s 可用", (role) => {
    renderTab(["水杯"], role);
    expect(button()).toBeEnabled();
  });
});
