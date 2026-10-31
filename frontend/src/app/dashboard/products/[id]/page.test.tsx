/**
 * Input: 合成商品详情与 bySupplier 价格历史
 * Output: 「采购价格」页签只读比价、加载失败可重试回归
 * Pos: 商品详情页测试
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProductDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  getHistory: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "product-1" }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/services/product.service", () => ({
  productService: { getById: mocks.getById },
}));
vi.mock("@/services/purchase.service", () => ({
  purchaseService: { getProductPriceHistory: mocks.getHistory },
}));

const product = { id: "product-1", customsName: "合成商品", unit: "件" };
const history = {
  count: 2,
  history: [],
  bySupplier: [
    {
      supplierId: "s1",
      supplierName: "合成供应商甲",
      hasQualityIssue: false,
      lastPrice: 8,
      lastDate: "2026-09-01T00:00:00.000Z",
      lastContractNo: "CG-A",
      lastTaxRate: 13,
      minPrice: 7,
      averagePrice: 8,
      count: 2,
    },
  ],
};

describe("商品详情", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getById.mockResolvedValue({ data: product });
    mocks.getHistory.mockResolvedValue({ data: history });
  });

  it("「采购价格」页签只读展示各供应商比价，无写入入口", async () => {
    const user = userEvent.setup();
    render(<ProductDetailPage />);
    await user.click(await screen.findByRole("tab", { name: "采购价格" }));
    expect(await screen.findByText("合成供应商甲")).toBeVisible();
    expect(screen.queryByText("用此供应商")).not.toBeInTheDocument();
    expect(mocks.getHistory).toHaveBeenCalledWith("product-1");
  });

  it("加载失败显示错误并可重试", async () => {
    const user = userEvent.setup();
    mocks.getById.mockRejectedValueOnce(new Error("boom"));
    render(<ProductDetailPage />);
    await user.click(await screen.findByRole("button", { name: "重试" }));
    expect(await screen.findByText("合成商品")).toBeInTheDocument();
  });
});
