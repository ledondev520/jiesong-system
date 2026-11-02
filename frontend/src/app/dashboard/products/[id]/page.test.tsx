/**
 * Input: 合成商品详情与 bySupplier 价格历史
 * Output: 「采购价格」页签只读比价、加载失败可重试回归
 * Pos: 商品详情页测试
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProductDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  getHistory: vi.fn(),
  remove: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "product-1" }),
  useRouter: () => ({ push: mocks.push, back: vi.fn() }),
}));
vi.mock("@/services/product.service", () => ({
  productService: { getById: mocks.getById, delete: mocks.remove },
}));
vi.mock("@/services/purchase.service", () => ({
  purchaseService: { getProductPriceHistory: mocks.getHistory },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const product = {
  id: "product-1",
  customsName: "合成商品",
  unit: "件",
  grossWeight: 0,
  volume: 0.5,
  availableStock: 9,
};
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
    // 手机卡片 + 桌面表格各渲染一份（由 CSS 切换）
    expect(await screen.findAllByText("合成供应商甲")).toHaveLength(2);
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

  it("未维护的重量显示「未维护」，有值的体积带单位 (B40)", async () => {
    render(<ProductDetailPage />);
    await screen.findByText("合成商品");
    expect(screen.getAllByText("未维护").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("0.5 CBM")).toBeInTheDocument();
    expect(screen.queryByText("0 kg")).toBeNull();
  });

  it("删除放在危险操作区，确认弹窗命名商品，确认后才删除并回到列表 (B40)", async () => {
    mocks.remove.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ProductDetailPage />);
    const zone = await screen.findByRole("region", { name: "危险操作" });
    expect(zone).toHaveTextContent("合成商品");
    await user.click(within(zone).getByRole("button", { name: "删除商品" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("合成商品");
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(mocks.remove).not.toHaveBeenCalled();

    await user.click(within(zone).getByRole("button", { name: "删除商品" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "确认删除",
      }),
    );
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("product-1"));
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/products");
  });
});
