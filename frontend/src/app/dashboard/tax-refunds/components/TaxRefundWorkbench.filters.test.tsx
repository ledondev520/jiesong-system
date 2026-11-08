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
        shippedAt: "2026-10-15T00:00:00.000Z",
        declaration: {
          id: "d1",
          declarationNo: "CD-0001-DRAFT",
          status: "DRAFT",
        },
        historical: false,
        issues: ["报关单未放行"],
      },
      {
        ...base,
        salesContractId: "b",
        contractNo: "EXP-OLD",
        shippedAt: "2024-03-02T00:00:00.000Z",
        declaration: null,
        historical: true,
        issues: ["进项发票缺失 2 张"],
      },
    ],
    facets: {
      scopeTotal: 2,
      historyCount: 1,
      reasons: [
        { label: "报关单", count: 1 },
        { label: "发票核验", count: 1 },
      ],
    },
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

// 模拟服务端：月份范围与原因筛选在返回前完成（组件本身不再过滤）。
const reasonOf = (item: { issues: string[] }) =>
  item.issues[0].includes("发票") ? "发票核验" : "报关单";
const serve = (params: { includeHistory?: boolean; reason?: string }) => {
  const items = response.data.items.filter(
    (item) =>
      (params.includeHistory !== false || !item.historical) &&
      (!params.reason || reasonOf(item) === params.reason),
  );
  return Promise.resolve({
    data: {
      ...response.data,
      items,
      total: items.length,
      facets: {
        ...response.data.facets,
        historyCount: 1,
        scopeTotal: params.includeHistory === false ? 1 : 2,
      },
    },
  });
};

async function renderLoaded() {
  mocks.getWorkbench.mockImplementation(serve);
  render(<TaxRefundWorkbench />);
  fireEvent.change(screen.getByLabelText("申报月份"), {
    target: { value: "2026-11" },
  });
  await screen.findAllByText("EXP-CURRENT");
}

describe("TaxRefundWorkbench 单证与退税（B54）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("阻塞原因 chips 取服务端计数；点击把 reason 交给服务端并翻回第 1 页", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    expect(
      screen.getByRole("button", { name: "全部原因2" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "发票核验1" }));
    expect(mocks.getWorkbench).toHaveBeenLastCalledWith(
      expect.objectContaining({ reason: "发票核验", page: 1 }),
    );
    expect(await screen.findAllByText("EXP-OLD")).not.toHaveLength(0);
    expect(screen.queryAllByText("EXP-CURRENT")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "全部原因2" }));
    expect(mocks.getWorkbench).toHaveBeenLastCalledWith(
      expect.objectContaining({ reason: undefined }),
    );
    expect(await screen.findAllByText("EXP-CURRENT")).not.toHaveLength(0);
  });

  it("月份范围开关把 includeHistory=false 交给服务端；历史行有标注与服务端计数", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    expect(
      screen.getByText(
        /列表含 2026-10 出货（本期应申报），以及更早尚未处理的历史待办（共 1 条）/,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("历史")).toHaveLength(1);
    expect(mocks.getWorkbench).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeHistory: true }),
    );
    await user.click(screen.getByRole("switch", { name: "包含历史待办" }));
    expect(mocks.getWorkbench).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeHistory: false, page: 1 }),
    );
    await waitFor(() =>
      expect(screen.queryAllByText("EXP-OLD")).toHaveLength(0),
    );
    expect(screen.getAllByText("EXP-CURRENT").length).toBeGreaterThan(0);
    expect(screen.getByText(/已隐藏 1 条历史待办/)).toBeInTheDocument();
  });

  it("桌面表格：草稿报关单显示去掉 DRAFT 后缀的单号 + 草稿徽章 + 非正式单", async () => {
    await renderLoaded();
    expect(screen.getAllByText("CD-0001").length).toBeGreaterThan(0);
    expect(screen.queryByText("CD-0001-DRAFT")).toBeNull();
    expect(screen.getAllByText("非正式单").length).toBeGreaterThan(0);
    expect(screen.getAllByText("草稿").length).toBeGreaterThan(0);
  });

  it("不显示预计可退税额（按月准备清单不计算退税额）；阻塞原文仍可展开到达", async () => {
    await renderLoaded();
    expect(screen.queryByText("预计可退税额")).toBeNull();
    expect(screen.getAllByText("报关单未放行").length).toBeGreaterThan(0);
  });

  it("本期 = 申报月份前一月（含跨年），按上海时区取月", async () => {
    mocks.getWorkbench.mockResolvedValue({
      data: {
        ...response.data,
        items: [
          {
            ...response.data.items[0],
            contractNo: "EXP-DEC",
            // 上海时区已是 12-01 的出货不能被 UTC 切成 11 月
            shippedAt: "2025-11-30T20:00:00.000Z",
          },
        ],
      },
    });
    render(<TaxRefundWorkbench />);
    fireEvent.change(screen.getByLabelText("申报月份"), {
      target: { value: "2026-01" },
    });
    await screen.findAllByText("EXP-DEC");
    expect(
      screen.getByText(/列表含 2025-12 出货（本期应申报）/),
    ).toBeInTheDocument();
    expect(screen.queryAllByText("历史")).toHaveLength(0);
  });

  it("手机卡片上的草稿报关单也标注非正式单", async () => {
    await renderLoaded();
    expect(screen.getAllByText("CD-0001（草稿 · 非正式单）").length).toBe(1);
  });
});
