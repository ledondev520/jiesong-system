/**
 * Input: 编辑退税页、taxRefundService、router、toast
 * Output: 编辑退税页交互与 ISO 日历日期回填/保留测试结果
 * Pos: 退税管理编辑页测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import EditTaxRefundPage from "./page";

const mockGetById = vi.fn();
const mockUpdate = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockRouterPush = vi.fn();

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    use: (value: unknown) => {
      if (value && typeof (value as { then?: unknown }).then === "function") {
        return { id: "tr-2" };
      }
      return actual.use(value as never);
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    back: vi.fn(),
  }),
  usePathname: () => "/dashboard/tax-refunds/tr-2/edit",
}));

vi.mock("@/services/taxRefund.service", () => ({
  taxRefundService: {
    getById: (...args: unknown[]) => mockGetById(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/services/sales.service", () => ({
  salesService: { getAll: async () => ({ data: { items: [] } }) },
}));
vi.mock("@/services/customsDeclaration.service", () => ({
  customsDeclarationService: { getAll: async () => ({ data: { items: [] } }) },
}));
vi.mock("@/services/forexVerification.service", () => ({
  forexVerificationService: {
    getAll: async () => ({ data: { items: [], pagination: { total: 0 } } }),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

describe("EditTaxRefundPage 交互逻辑", () => {
  beforeEach(() => {
    mockGetById.mockReset();
    mockUpdate.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
    mockRouterPush.mockReset();
  });

  const renderPage = (id = "tr-2") =>
    render(
      <Suspense fallback={<div>页面加载中...</div>}>
        <EditTaxRefundPage params={Promise.resolve({ id })} />
      </Suspense>,
    );

  it("加载已有退税单并提交更新", async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: "tr-2",
        refundNo: "TR-2026-002",
        status: "APPLIED",
        salesContractId: "sc-2",
        customsDeclarationId: "cd-2",
        forexVerificationId: "fv-2",
        declaredAmount: 96000,
        refundableAmount: 90000,
        refundedAmount: 0,
        appliedAt: "2026-03-06T00:00:00.000Z",
        refundedAt: "2026-03-19T00:00:00.000Z",
        note: "等待打款",
        createdAt: "2026-03-06T00:00:00.000Z",
        updatedAt: "2026-03-06T00:00:00.000Z",
      },
    });
    mockUpdate.mockResolvedValue({ data: { id: "tr-2" } });
    const user = userEvent.setup();

    renderPage("tr-2");

    await waitFor(() => {
      expect(screen.getByDisplayValue("TR-2026-002")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("申请日期")).toHaveValue("2026-03-06");
    expect(screen.getByLabelText("到账日期")).toHaveValue("2026-03-19");

    await user.clear(screen.getByLabelText("已退金额"));
    await user.type(screen.getByLabelText("已退金额"), "90000");
    await user.clear(screen.getByLabelText("到账日期"));
    await user.type(screen.getByLabelText("到账日期"), "2026-03-20");
    await user.clear(screen.getByLabelText("备注"));
    await user.type(screen.getByLabelText("备注"), "已到账");
    await user.click(screen.getByRole("button", { name: "保存变更" }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("tr-2", {
        refundNo: "TR-2026-002",
        status: "APPLIED",
        salesContractId: "sc-2",
        customsDeclarationId: "cd-2",
        forexVerificationId: "fv-2",
        declaredAmount: 96000,
        refundableAmount: 90000,
        refundedAmount: 90000,
        appliedAt: "2026-03-06",
        refundedAt: "2026-03-20",
        note: "已到账",
      });
    });

    expect(mockToastSuccess).toHaveBeenCalledWith("退税记录更新成功");
    expect(mockRouterPush).toHaveBeenCalledWith("/dashboard/tax-refunds/tr-2");
  });

  it("ISO 边界日期按已有报关表单的日历日回填并保留未编辑日期", async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: "tr-2",
        refundNo: "TR-SYNTHETIC-DATE",
        status: "DRAFT",
        salesContractId: "sc-2",
        customsDeclarationId: "cd-2",
        declaredAmount: 100,
        refundableAmount: 13,
        refundedAmount: 0,
        appliedAt: "2026-03-06T23:30:00-05:00",
        refundedAt: "2026-03-07T00:30:00+09:00",
        note: "合成日期回填",
      },
    });
    mockUpdate.mockResolvedValue({ data: { id: "tr-2" } });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByLabelText("申请日期")).toHaveValue("2026-03-06"),
    );
    expect(screen.getByLabelText("到账日期")).toHaveValue("2026-03-07");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存变更" })).toBeEnabled(),
    );
    await user.clear(screen.getByLabelText("备注"));
    await user.type(screen.getByLabelText("备注"), "合成仅修改备注");
    await user.click(screen.getByRole("button", { name: "保存变更" }));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        "tr-2",
        expect.objectContaining({
          appliedAt: "2026-03-06",
          refundedAt: "2026-03-07",
          note: "合成仅修改备注",
        }),
      ),
    );
  });

  it("加载失败时提示错误", async () => {
    mockGetById.mockRejectedValue(new Error("load failed"));

    renderPage("tr-2");

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("加载退税记录失败");
    });
  });
});
