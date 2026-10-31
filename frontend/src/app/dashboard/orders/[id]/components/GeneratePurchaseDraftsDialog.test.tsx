import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SalesContract } from "@/types";
import { GeneratePurchaseDraftsDialog } from "./GeneratePurchaseDraftsDialog";

const mockGenerate = vi.fn();
const mockSuppliers = vi.fn();
const mockHistory = vi.fn();

vi.mock("@/services/sales.service", () => ({
  salesService: {
    generatePurchaseDrafts: (...args: unknown[]) => mockGenerate(...args),
  },
}));
vi.mock("@/services/supplier.service", () => ({
  supplierService: { getAll: (...args: unknown[]) => mockSuppliers(...args) },
}));
vi.mock("@/services/purchase.service", () => ({
  purchaseService: {
    getProductPriceHistory: (...args: unknown[]) => mockHistory(...args),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const contract = {
  id: "s-1",
  contractNo: "EXP1",
  status: "CONFIRMED",
  items: [
    {
      id: "i1",
      productId: "p1",
      storeId: "st1",
      quantity: 10,
      costPrice: 50,
      product: { customsName: "合成锅" },
      store: { name: "LA" },
    },
    {
      id: "i2",
      productId: "p2",
      storeId: "st1",
      quantity: 4,
      costPrice: 0,
      product: { customsName: "合成台" },
      store: { name: "LA" },
    },
  ],
  purchaseContracts: [],
} as unknown as SalesContract;

describe("GeneratePurchaseDraftsDialog", () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockSuppliers.mockResolvedValue({
      data: {
        items: [
          { id: "sup-old", name: "旧供应商", isActive: true },
          { id: "sup-new", name: "新供应商", isActive: true },
          { id: "sup-archived", name: "已归档", isActive: false },
        ],
        pagination: { totalPages: 1 },
      },
    });
    mockHistory.mockImplementation((productId: string) =>
      Promise.resolve({
        data:
          productId === "p1"
            ? {
                bySupplier: [
                  {
                    supplierId: "sup-old",
                    lastPrice: 40,
                    lastDate: "2026-01-01",
                  },
                  {
                    supplierId: "sup-new",
                    lastPrice: 45,
                    lastDate: "2026-09-01",
                  },
                  {
                    supplierId: "sup-archived",
                    lastPrice: 30,
                    lastDate: "2026-10-01",
                  },
                ],
              }
            : { bySupplier: [] },
      }),
    );
  });

  it("默认最近一次在用供应商与价格；缺供应商的行需选择或取消勾选后才能提交", async () => {
    mockGenerate.mockResolvedValue({
      data: { contracts: [{ id: "pc", contractNo: "PO1" }] },
    });
    const onGenerated = vi.fn();
    const user = userEvent.setup();
    render(
      <GeneratePurchaseDraftsDialog
        open
        onOpenChange={vi.fn()}
        contract={contract}
        onGenerated={onGenerated}
      />,
    );
    expect(await screen.findByLabelText("合成锅 采购单价")).toHaveValue(45);
    const submit = screen.getByRole("button", { name: "生成 2 行" });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "选择 合成台" }));
    await user.click(screen.getByRole("button", { name: "生成 1 行" }));
    await waitFor(() =>
      expect(mockGenerate).toHaveBeenCalledWith("s-1", [
        { salesItemId: "i1", supplierId: "sup-new", unitPrice: 45 },
      ]),
    );
    expect(onGenerated).toHaveBeenCalled();
  });
});
