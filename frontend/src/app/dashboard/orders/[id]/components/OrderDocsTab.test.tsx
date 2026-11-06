import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SalesContract } from "@/types";
import { OrderDocsTab } from "./OrderDocsTab";

vi.mock("@/components/contract/ContractFiles", () => ({ default: () => null }));
vi.mock("@/lib/hooks/useBusinessReadOnly", () => ({
  BusinessWrite: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

const line = (id: string, customsName: string) => ({
  id,
  quantity: 1,
  product: { customsName },
});

describe("OrderDocsTab 缺 HS 提示", () => {
  it("重复商品名只列一次并标注数量", () => {
    const contract = {
      packingItems: [
        line("1", "密胺餐具"),
        line("2", "密胺餐具"),
        line("3", "塑料杯"),
      ],
    } as unknown as SalesContract;
    render(
      <OrderDocsTab
        contract={contract}
        files={[]}
        onFilesChange={() => {}}
        onResolveHs={() => {}}
      />,
    );
    expect(screen.getByText("未匹配：密胺餐具 ×2、塑料杯")).toBeInTheDocument();
  });
});
