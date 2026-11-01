/**
 * Input: 合成供应商详情（含供货商品）与各商品 bySupplier 价格历史
 * Output: 「供货商品」只取本供应商汇总、单个商品比价失败不拖垮整页
 * Pos: 供应商详情页测试
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import SupplierDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  getHistory: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "s1" }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/services/supplier.service", () => ({
  supplierService: { getById: mocks.getById },
}));
vi.mock("@/services/purchase.service", () => ({
  purchaseService: { getProductPriceHistory: mocks.getHistory },
}));

const summary = (supplierId: string, lastPrice: number) => ({
  supplierId,
  supplierName: supplierId,
  hasQualityIssue: false,
  lastPrice,
  lastDate: "2026-09-01T00:00:00.000Z",
  lastContractNo: "CG-A",
  lastTaxRate: 13,
  minPrice: lastPrice - 1,
  averagePrice: lastPrice,
  count: 4,
});

describe("供应商详情", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getById.mockResolvedValue({
      data: {
        id: "s1",
        name: "合成供应商甲",
        hasQualityIssue: true,
        products: [
          { product: { id: "p1", customsName: "商品一" }, price: 7 },
          { product: { id: "p2", customsName: "商品二" }, price: null },
        ],
      },
    });
  });

  it("供货商品显示本供应商的最近价，商品比价失败只影响该行", async () => {
    mocks.getHistory.mockImplementation(async (productId: string) => {
      if (productId === "p2") throw new Error("boom");
      return {
        data: { bySupplier: [summary("s2", 3), summary("s1", 8)] },
      };
    });
    render(<SupplierDetailPage />);
    const row1 = (await screen.findByText("商品一")).closest("tr")!;
    expect(within(row1).getByText("¥8")).toBeInTheDocument();
    expect(within(row1).queryByText("¥3")).not.toBeInTheDocument();
    const row2 = screen.getByText("商品二").closest("tr")!;
    expect(within(row2).getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("质量问题")).toBeInTheDocument();
  });
});
