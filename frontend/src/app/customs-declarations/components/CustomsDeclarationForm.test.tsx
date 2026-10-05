import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CustomsDeclarationForm,
  declarationDefaults,
  declarationPayload,
} from "./CustomsDeclarationForm";
import { CustomsDeclarationStatus } from "@/types";
const mocks = vi.hoisted(() => ({ sales: vi.fn(), products: vi.fn() }));
vi.mock("@/services/sales.service", () => ({
  salesService: { getAll: mocks.sales },
}));
vi.mock("@/services/product.service", () => ({
  productService: { getAll: mocks.products },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const existing = {
  id: "cd",
  declarationNo: "SYNTHETIC",
  salesContractId: "s1",
  status: CustomsDeclarationStatus.DRAFT,
  declaredAt: "2026-10-01T00:00:00.000Z",
  exportDate: "2026-10-02T00:00:00.000Z",
  currency: "USD",
  totalAmount: 2,
  totalQuantity: 1,
  totalNetWeight: 1,
  totalGrossWeight: 2,
  createdAt: "",
  updatedAt: "",
  items: [
    {
      id: "line1",
      productId: "p1",
      customsName: "合成商品",
      hsCode: "9403",
      quantity: 1,
      packingItemId: "packing1",
      taxRateId: "tax1",
      declarationElements: "原申报要素",
    },
  ],
};
describe("报关编辑契约", () => {
  it("日期可回填，提交保留明细ID及装箱/税率关联", () => {
    const values = declarationDefaults(existing);
    expect(values.declaredAt).toBe("2026-10-01");
    const payload = declarationPayload(values);
    expect(payload).toMatchObject({
      salesContractId: "s1",
      exportDate: "2026-10-02",
      items: [
        {
          id: "line1",
          productId: "p1",
          customsName: "合成商品",
          packingItemId: "packing1",
          taxRateId: "tax1",
          declarationElements: "原申报要素",
        },
      ],
    });
    expect(payload).not.toHaveProperty("exporter");
    expect(payload).not.toHaveProperty("releaseDate");
    expect(payload.items[0]).not.toHaveProperty("productName");
  });
  it("编辑表单提交真实字段，非法数字阻止保存", async () => {
    mocks.sales.mockResolvedValue({
      data: { items: [{ id: "s1", contractNo: "合成合同" }] },
    });
    mocks.products.mockResolvedValue({
      data: { items: [{ id: "p1", customsName: "合成商品" }] },
    });
    const submit = vi.fn().mockResolvedValue(undefined);
    render(
      <CustomsDeclarationForm
        declaration={existing}
        submitLabel="保存报关单"
        onSubmit={submit}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存报关单" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "保存报关单" }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          salesContractId: "s1",
          declaredAt: "2026-10-01",
        }),
      ),
    );
    submit.mockClear();
    fireEvent.change(screen.getByLabelText("数量"), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存报关单" }));
    expect(await screen.findByText("请输入有效非负数字")).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });
  it("目录失败禁止提交，重试后恢复", async () => {
    mocks.sales
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ data: { items: [] } });
    mocks.products.mockResolvedValue({ data: { items: [] } });
    render(<CustomsDeclarationForm submitLabel="新建" onSubmit={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("加载失败");
    expect(screen.getByRole("button", { name: "新建" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "新建" })).toBeEnabled(),
    );
  });
});
