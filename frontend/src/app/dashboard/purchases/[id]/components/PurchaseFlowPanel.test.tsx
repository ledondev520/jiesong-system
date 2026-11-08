/**
 * Input: PurchaseFlowPanel、采购发票准备 Interface 与附件上传 mock
 * Output: 付款失败保留草稿及重试、催票与选填附件交互测试
 * Pos: 采购详情供应商发票闭环测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PurchaseFlowPanel } from "./PurchaseFlowPanel";
import type { PurchaseContract } from "@/types";
import { financeService } from "@/services/finance.service";
import { useAuthStore } from "@/store/auth.store";

const mockIsMobile = vi.fn(() => false);
vi.mock("@/lib/hooks/useMobile", () => ({ useMobile: () => mockIsMobile() }));

const mockGetPreparation = vi.fn();
const mockRegisterNumbers = vi.fn();
const mockUploadFile = vi.fn();
let mockReadOnly = false;

vi.mock("@/services/purchase.service", () => ({
  purchaseService: {
    getInvoicePreparation: (...args: unknown[]) => mockGetPreparation(...args),
    registerInvoiceNumbers: (...args: unknown[]) =>
      mockRegisterNumbers(...args),
  },
}));

vi.mock("@/services/contractFile.service", () => ({
  uploadContractFile: (...args: unknown[]) => mockUploadFile(...args),
}));

vi.mock("@/services/finance.service", () => ({
  financeService: { createPayment: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const preparation = {
  purchaseContractId: "purchase-1",
  complete: true,
  fileRequired: false as const,
  invoiceNumbers: ["INV-001"],
  invoiceFiles: [
    {
      id: "file-1",
      fileName: "发票.pdf",
      fileType: "application/pdf",
      mimeType: "application/pdf",
      fileSize: 100,
      filePath: "invoice.pdf",
      category: "SUPPLIER_INVOICE" as const,
      uploadedAt: "2026-07-06T00:00:00.000Z",
    },
  ],
  issues: [],
  amounts: { taxRate: 13, netAmount: 200, taxAmount: 26, grossAmount: 226 },
  request: {
    contractNo: "CG260001",
    supplierName: "供应商A",
    supplierTaxId: "91310000TEST000001",
    lines: [
      {
        purchaseItemId: "item-1",
        productId: "product-1",
        productName: "餐盘",
        unit: "件",
        quantity: 2,
        netUnitPrice: 100,
        netAmount: 200,
        taxRate: 13,
        taxAmount: 26,
        grossAmount: 226,
      },
    ],
  },
};

const contract = {
  id: "purchase-1",
  contractNo: "PO260001",
  supplierId: "supplier-1",
  totalAmount: 226,
  paidAmount: 226,
  taxRate: 13,
  status: "SHIPPED",
  invoiceNo: "INV-001",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
  supplier: { id: "supplier-1", name: "供应商A" },
  items: [
    {
      id: "item-1",
      purchaseContractId: "purchase-1",
      productId: "product-1",
      quantity: 2,
      unit: "件",
      unitPrice: 100,
      totalPrice: 226,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      product: { id: "product-1", customsName: "餐盘", unit: "件" },
    },
  ],
  payments: [],
} as unknown as PurchaseContract;

vi.mock("@/lib/hooks/useBusinessReadOnly", () => ({
  useBusinessReadOnly: () => mockReadOnly,
  BusinessWrite: ({ children }: { children: React.ReactNode }) =>
    mockReadOnly ? null : <>{children}</>,
}));

describe("PurchaseFlowPanel supplier invoice flow", () => {
  beforeEach(() => {
    mockReadOnly = false;
    mockIsMobile.mockReturnValue(false);
    vi.clearAllMocks();
    mockGetPreparation.mockResolvedValue({ data: preparation });
    mockRegisterNumbers.mockResolvedValue({
      data: { ...preparation, invoiceNumbers: ["INV-002", "INV-003"] },
    });
    mockUploadFile.mockResolvedValue({
      data: {
        ...preparation.invoiceFiles[0],
        id: "file-2",
        fileName: "新发票.pdf",
      },
    });
  });

  it("付款保存失败保留草稿，重试成功才刷新合同", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    vi.mocked(financeService.createPayment)
      .mockRejectedValueOnce({ message: "合成保存失败" })
      .mockResolvedValueOnce({ data: { id: "synthetic-payment" } } as never);
    render(
      <PurchaseFlowPanel
        contract={{ ...contract, paidAmount: 0 }}
        onUpdated={onUpdated}
      />,
    );
    await user.click(screen.getByRole("button", { name: "登记付款" }));
    await user.click(screen.getByRole("combobox", { name: "方式" }));
    await user.click(screen.getByRole("option", { name: "其他" }));
    fireEvent.change(screen.getByLabelText("付款金额"), {
      target: { value: "22.6" },
    });
    fireEvent.change(screen.getByLabelText("备注"), {
      target: { value: "中文付款测试" },
    });
    await user.click(screen.getByRole("button", { name: "确认记录" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("合成保存失败");
    expect(screen.getByLabelText("备注")).toHaveValue("中文付款测试");
    expect(onUpdated).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认记录" }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledOnce());
    expect(vi.mocked(financeService.createPayment).mock.calls[1][0]).toEqual(
      vi.mocked(financeService.createPayment).mock.calls[0][0],
    );
    // 失败后重试沿用同一 attemptId（幂等重放），成功后才轮换。
    const [first, second] = vi.mocked(financeService.createPayment).mock.calls;
    expect(first[1]?.attemptId).toEqual(expect.any(String));
    expect(second[1]?.attemptId).toBe(first[1]?.attemptId);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    ["SHIPPED", true],
    ["DRAFT", false],
    ["CANCELLED", false],
  ])(
    "%s 合同在付款与发票说明中按应付口径显示待付（payable=%s）",
    (status, payable) => {
      render(
        <PurchaseFlowPanel
          contract={{ ...contract, status, paidAmount: 0 } as PurchaseContract}
          onUpdated={vi.fn()}
        />,
      );
      const description = screen.getByText(/合同含税额/);
      if (payable) {
        expect(description).toHaveTextContent("待付");
      } else {
        expect(description).not.toHaveTextContent("待付");
        expect(description).not.toHaveTextContent("已付清");
      }
    },
  );

  it("手机付款卡片完整显示金额、日期、方式和备注", () => {
    mockIsMobile.mockReturnValue(true);
    render(
      <PurchaseFlowPanel
        contract={
          {
            ...contract,
            payments: [
              {
                id: "payment-1",
                paymentDate: "2026-07-06T00:00:00.000Z",
                amount: 100,
                paymentMethod: "转账",
                note: "手机付款备注",
              },
            ],
          } as PurchaseContract
        }
        onUpdated={vi.fn()}
      />,
    );
    expect(screen.getByText("2026-07-06")).toBeInTheDocument();
    expect(screen.getByText("转账")).toBeInTheDocument();
    expect(screen.getByText("手机付款备注")).toBeInTheDocument();
    expect(screen.getByText("¥100.00")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("打开催票弹窗时读取权威准备状态，并通过专用入口保存多个号码", async () => {
    const onUpdated = vi.fn();
    const user = userEvent.setup();
    render(
      <PurchaseFlowPanel
        contract={contract}
        onUpdated={onUpdated}
        invoiceTitleText="购方：捷淞"
      />,
    );

    await user.click(screen.getByRole("button", { name: "催开发票" }));

    expect(await screen.findByText("发票.pdf")).toBeInTheDocument();
    expect(mockGetPreparation).toHaveBeenCalledWith("purchase-1");
    const input = screen.getByLabelText("发票号码登记（每行或逗号分隔）");
    fireEvent.change(input, { target: { value: "INV-002\nINV-003" } });
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(mockRegisterNumbers).toHaveBeenCalledWith("purchase-1", [
      "INV-002",
      "INV-003",
    ]);
    expect(onUpdated).toHaveBeenCalled();
  });

  it("发票文件在同一弹窗直接按 SUPPLIER_INVOICE 分类上传，且文件仍为选填", async () => {
    const onUpdated = vi.fn();
    const user = userEvent.setup();
    render(<PurchaseFlowPanel contract={contract} onUpdated={onUpdated} />);
    await user.click(screen.getByRole("button", { name: "催开发票" }));
    await screen.findByText("发票.pdf");

    const file = new File(["invoice"], "新发票.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("上传供应商发票原件"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(mockUploadFile).toHaveBeenCalledWith(
        "purchase-1",
        "PURCHASE",
        file,
        "供应商发票原件（选填）",
        "SUPPLIER_INVOICE",
      );
    });
    expect(onUpdated).toHaveBeenCalled();
  });
  it("老板可查看发票资料，但号码只读且无付款或上传动作", async () => {
    mockReadOnly = true;
    mockGetPreparation.mockResolvedValue({ data: preparation });
    render(<PurchaseFlowPanel contract={contract} onUpdated={vi.fn()} />);
    expect(screen.queryByText("登记付款")).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "查看发票" }));
    const field =
      await screen.findByLabelText("发票号码登记（每行或逗号分隔）");
    expect(field).toHaveAttribute("readonly");
    expect(screen.queryByText("保存")).not.toBeInTheDocument();
    expect(screen.queryByText("上传发票原件")).not.toBeInTheDocument();
    expect(screen.getByLabelText("上传供应商发票原件")).toBeDisabled();
  });

  // P3-6：没有上传权限的角色不应看到一个点了没反应的按钮
  it.each([
    ["ADMIN", true],
    ["PURCHASE", true],
    ["FINANCE", true],
    ["SALES", false],
    ["WAREHOUSE", false],
  ])("%s 的「上传发票原件」按钮可见性为 %s", async (role, visible) => {
    useAuthStore.setState({ user: { id: "u1", role } as never });
    const user = userEvent.setup();
    render(<PurchaseFlowPanel contract={contract} onUpdated={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "催开发票" }));
    await screen.findByText("发票.pdf");
    expect(!!screen.queryByRole("button", { name: "上传发票原件" })).toBe(
      visible,
    );
    if (!visible)
      expect(screen.getByLabelText("上传供应商发票原件")).toBeDisabled();
  });

  describe("WAREHOUSE：服务端已剥离发票号与金额（OD-2/OD-3）", () => {
    const warehouseContract = {
      ...contract,
      invoiceNo: undefined,
      totalAmount: undefined,
      paidAmount: undefined,
      invoiceCount: 2,
      hasPaidAmount: true,
      subStatus: { payment: "PARTIAL" },
      items: [
        {
          ...((contract.items as unknown[])[0] as object),
          unitPrice: undefined,
          totalPrice: undefined,
        },
      ],
      payments: [{ id: "pay-1" }],
    } as unknown as PurchaseContract;
    const warehousePreparation = {
      ...preparation,
      invoiceNumbers: undefined,
      invoiceNumberCount: 2,
      invoiceFiles: [],
      amounts: undefined,
      request: {
        ...preparation.request,
        lines: [
          {
            ...preparation.request.lines[0],
            netUnitPrice: undefined,
            netAmount: undefined,
            taxAmount: undefined,
            grossAmount: undefined,
          },
        ],
      },
    };

    beforeEach(() => {
      useAuthStore.setState({ user: { id: "u1", role: "WAREHOUSE" } as never });
      mockGetPreparation.mockResolvedValue({ data: warehousePreparation });
    });

    it("卡片头只显示状态：不出现 ¥0.00 / 已付清，号码数来自 invoiceCount", () => {
      const { container } = render(
        <PurchaseFlowPanel contract={warehouseContract} onUpdated={vi.fn()} />,
      );
      expect(container.textContent).toContain("部分付款");
      expect(container.textContent).toContain("无权查看");
      expect(container.textContent).toContain("已登记 2 个发票号");
      expect(container.textContent).not.toMatch(/¥|0\.00|已付清|待付/);
      expect(screen.queryByText("复制汇款信息")).not.toBeInTheDocument();
      expect(screen.queryByText("登记付款")).not.toBeInTheDocument();
    });

    it("催开发票弹窗保留，开票信息无单价/金额，号码框不预填且保存只提交新号码", async () => {
      const user = userEvent.setup();
      render(
        <PurchaseFlowPanel contract={warehouseContract} onUpdated={vi.fn()} />,
      );
      await user.click(screen.getByRole("button", { name: "催开发票" }));
      const field =
        await screen.findByLabelText("发票号码登记（每行或逗号分隔）");
      expect(field).toHaveValue("");
      const infoText = (
        screen.getAllByRole("textbox")[0] as HTMLTextAreaElement
      ).value;
      expect(infoText).toContain("餐盘");
      expect(infoText).not.toMatch(/¥|单价|金额|税额|合计/);
      await user.type(field, "NEW-9");
      mockRegisterNumbers.mockResolvedValue({
        data: { ...warehousePreparation, invoiceNumberCount: 3 },
      });
      await user.click(screen.getByRole("button", { name: "保存" }));
      await waitFor(() =>
        expect(mockRegisterNumbers).toHaveBeenCalledWith("purchase-1", [
          "NEW-9",
        ]),
      );
      expect(field).toHaveValue("");
    });
  });
});
