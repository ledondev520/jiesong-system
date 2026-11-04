/**
 * Input: 合成的工作台数据（一条本月草稿报关单出货、一条历史无报关单出货），mock 的 taxRefundService.getWorkbench
 * Output: 阻塞原因 chips 与按原因筛选、历史待办标注与开关、草稿报关单展示、预计可退税额 KPI
 * Pos: TaxRefundWorkbench 单证与退税页（B54）回归
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaxRefundWorkbench } from "./TaxRefundWorkbench";

const mocks = vi.hoisted(() => ({ getWorkbench: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/store/auth.store", () => ({
  useAuthStore: (selector: (s: { user: { role: string } }) => unknown) =>
    selector({ user: { role: "FINANCE" } }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/services/taxRefund.service", () => ({
  taxRefundService: { getWorkbench: mocks.getWorkbench },
}));
vi.mock("@/lib/axios", () => ({ clearApiGetCache: vi.fn() }));
vi.mock("@/lib/hooks/useBusinessReadOnly", () => ({
  BusinessWrite: ({ children }: { children: React.ReactNode }) => children,
  useBusinessReadOnly: () => false,
}));
vi.mock(
  "@/app/dashboard/finance/invoices/components/InvoiceImportDialog",
  () => ({ InvoiceImportDialog: () => null }),
);
vi.mock("@/components/dialog/TaxRefundPreparationDialog", () => ({
  TaxRefundPreparationDialog: () => null,
}));
vi.mock("./InvoiceVerificationDialog", () => ({
  InvoiceVerificationDialog: () => null,
}));

const invoiceSummary = {
  shipmentRows: 0,
  uniqueInvoices: 0,
  found: 0,
  pass: 0,
  review: 0,
  missing: 0,
  invalidInvoiceNumber: 0,
};
const base = {
  contractStatus: "SHIPPED",
  stage: "PREPARATION" as const,
  ready: false,
  purchaseContractNos: [],
  invoiceSummary,
  estimatedRefundableAmount: 0,
};

const response = {
  data: {
    items: [
      {
        ...base,
        salesContractId: "a",
        contractNo: "EXP-CURRENT",
        shippedAt: "2026-11-05T00:00:00.000Z",
        declaration: {
          id: "d1",
          declarationNo: "CD-0001-DRAFT",
          status: "DRAFT",
        },
        issues: ["报关单未放行"],
      },
      {
        ...base,
        salesContractId: "b",
        contractNo: "EXP-OLD",
        shippedAt: "2024-03-02T00:00:00.000Z",
        declaration: null,
        issues: ["进项发票缺失 2 张"],
      },
    ],
    total: 2,
    page: 1,
    pageSize: 20,
    summary: {
      contracts: 2,
      readyToExport: 0,
      needsReview: 0,
      missingInvoices: 1,
      draftCount: 0,
      submittedCount: 0,
      estimatedRefundableAmount: 1234,
    },
    disclaimer: "",
  },
};

async function renderLoaded() {
  mocks.getWorkbench.mockResolvedValue(response);
  render(<TaxRefundWorkbench />);
  fireEvent.change(screen.getByLabelText("申报月份"), {
    target: { value: "2026-11" },
  });
  await screen.findAllByText("EXP-CURRENT");
}

describe("TaxRefundWorkbench 单证与退税（B54）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("阻塞原因 chips 带计数，点击只留下含该原因的出口", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    expect(
      screen.getByRole("button", { name: "全部原因2" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "发票核验1" }));
    expect(screen.queryAllByText("EXP-CURRENT")).toHaveLength(0);
    expect(screen.getAllByText("EXP-OLD").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "全部原因2" }));
    expect(screen.getAllByText("EXP-CURRENT").length).toBeGreaterThan(0);
  });

  it("月份筛选说明含历史，历史行有标注；关掉开关后隐藏历史并说明", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    expect(
      screen.getByText(
        /列表含该月出货，以及更早尚未处理的历史待办（1 条在本页）/,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("历史")).toHaveLength(1);
    await user.click(screen.getByRole("switch", { name: "包含历史待办" }));
    expect(screen.queryAllByText("EXP-OLD")).toHaveLength(0);
    expect(screen.getAllByText("EXP-CURRENT").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/已隐藏本页 1 条历史待办；合计与分页仍含历史/),
    ).toBeInTheDocument();
  });

  it("草稿报关单显示去掉 DRAFT 后缀的单号 + 草稿徽章 + 非正式单", async () => {
    await renderLoaded();
    expect(screen.getAllByText("CD-0001").length).toBeGreaterThan(0);
    expect(screen.queryByText("CD-0001-DRAFT")).toBeNull();
    expect(screen.getAllByText("非正式单").length).toBeGreaterThan(0);
    expect(screen.getAllByText("草稿").length).toBeGreaterThan(0);
  });

  it("预计可退税额 KPI 带说明；阻塞原文仍可展开到达", async () => {
    await renderLoaded();
    await waitFor(() => expect(screen.getByText("¥1,234")).toBeInTheDocument());
    expect(screen.getByText("按当前资料估算，非申报金额")).toBeInTheDocument();
    expect(screen.getAllByText("报关单未放行").length).toBeGreaterThan(0);
  });
});
