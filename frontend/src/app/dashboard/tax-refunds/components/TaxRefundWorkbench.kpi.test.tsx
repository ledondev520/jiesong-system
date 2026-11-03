/**
 * Input: 退税工作台 KPI 区，mock 的 taxRefundService.getWorkbench（挂起 / 成功 / 失败）
 * Output: 加载中显示骨架而不是「-」；失败显示「—」；真实的 0 显示 0（B45 缺失值规则）
 * Pos: TaxRefundWorkbench 加载/缺失语义回归
 */
import { render, screen, waitFor } from "@testing-library/react";
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
  () => ({
    InvoiceImportDialog: () => null,
  }),
);
vi.mock("@/components/dialog/TaxRefundPreparationDialog", () => ({
  TaxRefundPreparationDialog: () => null,
}));
vi.mock("./InvoiceVerificationDialog", () => ({
  InvoiceVerificationDialog: () => null,
}));

const workbench = (summary: Record<string, number>, total = 0) => ({
  data: {
    items: [],
    total,
    page: 1,
    pageSize: 20,
    summary,
    disclaimer: "",
  },
});

describe("TaxRefundWorkbench KPI 加载/缺失语义", () => {
  beforeEach(() => vi.clearAllMocks());

  it("加载中 KPI 是骨架，不是「-」或 0", () => {
    mocks.getWorkbench.mockReturnValue(new Promise(() => {}));
    render(<TaxRefundWorkbench />);
    expect(
      screen.getAllByRole("status", { name: "加载中" }).length,
    ).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText("-")).toBeNull();
  });

  it("加载失败：KPI 显示「—」，不是 0", async () => {
    mocks.getWorkbench.mockRejectedValue(new Error("boom"));
    render(<TaxRefundWorkbench />);
    await waitFor(() =>
      expect(screen.queryAllByRole("status", { name: "加载中" })).toHaveLength(
        0,
      ),
    );
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
  });

  it("加载成功：真实的 0 显示 0", async () => {
    mocks.getWorkbench.mockResolvedValue(
      workbench({
        contracts: 0,
        materialReadyCount: 0,
        needsReview: 35,
        missingInvoices: 0,
        confirmedCount: 0,
      }),
    );
    render(<TaxRefundWorkbench />);
    expect(await screen.findByText("35")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(4);
  });
});
