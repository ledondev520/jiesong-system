/**
 * Input: 真实采购表单与合成目录/API响应
 * Output: 新增不提交过期预览编号，草稿更正保留原编号的交互回归
 * Pos: 采购表单编号边界测试
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreatePurchasePage from "./CreatePurchasePageContent";

const mocks = vi.hoisted(() => ({
  editId: null as string | null,
  push: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  getNextContractNo: vi.fn(),
  getById: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, back: vi.fn() }),
  useSearchParams: () => ({ get: () => mocks.editId }),
}));
vi.mock("@/services/purchase.service", () => ({
  purchaseService: {
    create: mocks.create,
    update: mocks.update,
    getNextContractNo: mocks.getNextContractNo,
    getById: mocks.getById,
    getProductPriceHistory: vi
      .fn()
      .mockResolvedValue({ data: { count: 0, averagePrice: null } }),
    getSuppliersByProducts: vi
      .fn()
      .mockResolvedValue({ data: { supplierIds: [] } }),
  },
}));
vi.mock("@/services/supplier.service", () => ({
  supplierService: {
    getAll: vi.fn().mockResolvedValue({
      data: { items: [{ id: "supplier-1", name: "合成供应商" }] },
    }),
  },
}));
vi.mock("@/services/product.service", () => ({
  productService: {
    getAll: vi.fn().mockResolvedValue({
      data: {
        items: [{ id: "product-1", customsName: "合成商品", unit: "件" }],
      },
    }),
  },
}));
vi.mock("@/services/contractTemplate.service", () => ({
  contractTemplateService: {
    getByType: vi.fn().mockResolvedValue({ data: [] }),
  },
}));
vi.mock("@/components/purchase/PriceGuard", () => ({ PriceGuard: () => null }));
vi.mock("@/lib/api-cache", () => ({ invalidateCache: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

describe("采购表单编号", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.editId = null;
    mocks.getNextContractNo.mockResolvedValue({
      data: { contractNo: "CG2600004" },
    });
    mocks.create.mockResolvedValue({
      data: { id: "created-purchase", contractNo: "CG2600005" },
    });
    mocks.update.mockResolvedValue({ data: {} });
    mocks.getById.mockResolvedValue({
      data: {
        id: "draft-1",
        supplierId: "supplier-1",
        contractNo: "SYNTHETIC-EXPLICIT",
        status: "DRAFT",
        taxRate: 13,
        items: [
          { productId: "product-1", quantity: 2, unitPrice: 10, unit: "件" },
        ],
      },
    });
  });

  it("新增提交由后端重新分配编号，不发送禁用预览；前后切步保留表单", async () => {
    const user = userEvent.setup();
    render(<CreatePurchasePage />);
    await waitFor(() => expect(mocks.getNextContractNo).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("combobox", { name: /商品/ }));
    await user.click(await screen.findByRole("option", { name: "合成商品" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /数量/ }), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: /单价/ }), {
      target: { value: "10" },
    });
    await user.click(screen.getByRole("button", { name: "下一步：合同信息" }));
    expect(await screen.findByLabelText("合同编号")).toHaveValue("CG2600004");
    expect(screen.getByLabelText("合同编号")).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: /供应商/ }));
    await user.click(await screen.findByRole("option", { name: "合成供应商" }));
    await user.click(screen.getByRole("button", { name: "上一步" }));
    await user.click(screen.getByRole("button", { name: "下一步：合同信息" }));
    await user.click(screen.getByRole("button", { name: "创建合同" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    const payload = mocks.create.mock.calls[0][0];
    expect(payload).not.toHaveProperty("contractNo");
    expect(payload).toMatchObject({
      supplierId: "supplier-1",
      items: [{ productId: "product-1", quantity: 2, unitPrice: 10 }],
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/contracts");
  });

  it("草稿更正继续发送原始显式编号，不查询新增预览", async () => {
    mocks.editId = "draft-1";
    const user = userEvent.setup();
    render(<CreatePurchasePage />);
    await waitFor(() =>
      expect(screen.getByRole("spinbutton", { name: /数量/ })).toHaveValue(2),
    );
    await user.click(screen.getByRole("button", { name: "下一步：合同信息" }));
    expect(await screen.findByLabelText("合同编号")).toHaveValue(
      "SYNTHETIC-EXPLICIT",
    );
    await user.click(screen.getByRole("button", { name: "保存更正" }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        "draft-1",
        expect.objectContaining({ contractNo: "SYNTHETIC-EXPLICIT" }),
      ),
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.getNextContractNo).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/purchase/draft-1");
  });
});
