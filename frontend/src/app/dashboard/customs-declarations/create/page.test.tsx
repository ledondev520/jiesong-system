/**
 * Input: 新建报关单页、customsDeclarationService、router、toast
 * Output: 按真实合同/商品字段提交及失败恢复测试
 * Pos: 报关单管理创建页测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateCustomsDeclarationPage from "./page";

const mockPush = vi.fn();
const mockCreate = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

const setFieldValue = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), {
    target: { value },
  });
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/customs-declarations/create",
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
  }),
}));

vi.mock("@/services/customsDeclaration.service", () => ({
  customsDeclarationService: {
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

vi.mock("@/services/sales.service", () => ({
  salesService: {
    getAll: vi
      .fn()
      .mockResolvedValue({
        data: { items: [{ id: "s1", contractNo: "合成合同" }] },
      }),
  },
}));
vi.mock("@/services/product.service", () => ({
  productService: {
    getAll: vi
      .fn()
      .mockResolvedValue({
        data: { items: [{ id: "p1", customsName: "合成商品" }] },
      }),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

describe("CreateCustomsDeclarationPage 交互逻辑", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockCreate.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  it("展示创建页关键字段并提交标准化 payload", async () => {
    mockCreate.mockResolvedValue({
      data: {
        id: "cd-new",
      },
    });
    const user = userEvent.setup();

    render(<CreateCustomsDeclarationPage />);

    expect(
      screen.getByRole("heading", { name: "新建报关单" }),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByLabelText("出口合同")).toBeEnabled(),
    );
    await user.click(screen.getByLabelText("出口合同"));
    await user.click(screen.getByRole("option", { name: "合成合同" }));
    await user.click(screen.getByLabelText("商品档案"));
    await user.click(screen.getByRole("option", { name: "合成商品" }));
    setFieldValue("报关行", "合成报关行");
    setFieldValue("报关单号", "CUS-2026-010");
    setFieldValue("申报日期", "2026-03-06");
    setFieldValue("成交币种", "USD");
    setFieldValue("货值总额", "88000");
    setFieldValue("申报总数量", "1200");
    setFieldValue("毛重（kg）", "18000");
    setFieldValue("净重（kg）", "17350");
    setFieldValue("申报品名", "釉面砖");
    setFieldValue("HS 编码", "69072190");
    setFieldValue("数量", "1200");
    setFieldValue("单价", "73.33");
    setFieldValue("备注", "整柜出运");

    await user.click(screen.getByRole("button", { name: "保存并查看详情" }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        salesContractId: "s1",
        customsBroker: "合成报关行",
        exchangeRate: null,
        declarationNo: "CUS-2026-010",
        status: "DRAFT",
        declaredAt: "2026-03-06",
        exportDate: null,
        currency: "USD",
        totalAmount: 88000,
        totalQuantity: 1200,
        totalGrossWeight: 18000,
        totalNetWeight: 17350,
        note: "整柜出运",
        items: [
          {
            productId: "p1",
            declarationElements: "",
            itemNo: 1,
            customsName: "釉面砖",
            hsCode: "69072190",
            quantity: 1200,
            unit: "",
            unitPrice: 73.33,
            totalPrice: null,
          },
        ],
      });
    });

    expect(mockToastSuccess).toHaveBeenCalledWith("报关单创建成功");
    expect(mockPush).toHaveBeenCalledWith(
      "/dashboard/customs-declarations/cd-new",
    );
  });

  it("创建失败时提示错误", async () => {
    mockCreate.mockRejectedValue(new Error("create failed"));
    const user = userEvent.setup();

    render(<CreateCustomsDeclarationPage />);

    await waitFor(() =>
      expect(screen.getByLabelText("出口合同")).toBeEnabled(),
    );
    await user.click(screen.getByLabelText("出口合同"));
    await user.click(screen.getByRole("option", { name: "合成合同" }));
    await user.click(screen.getByLabelText("商品档案"));
    await user.click(screen.getByRole("option", { name: "合成商品" }));
    setFieldValue("报关行", "合成报关行");
    setFieldValue("报关单号", "CUS-2026-011");
    setFieldValue("申报日期", "2026-03-07");
    setFieldValue("成交币种", "USD");
    setFieldValue("货值总额", "68000");
    setFieldValue("申报总数量", "960");
    setFieldValue("毛重（kg）", "14000");
    setFieldValue("净重（kg）", "13500");
    setFieldValue("申报品名", "抛光砖");
    setFieldValue("HS 编码", "69072290");
    setFieldValue("数量", "960");
    setFieldValue("单价", "70.83");

    await user.click(screen.getByRole("button", { name: "保存并查看详情" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("创建报关单失败");
    });
  });
});
