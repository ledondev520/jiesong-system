/**
 * Input: 报关单详情页、customsDeclarationService、浏览器查询、router、toast
 * Output: 真实报关摘要、出口日期与明细展示测试
 * Pos: 报关单管理详情页测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import CustomsDeclarationDetailPage from "./page";

const mockGetById = vi.fn();
const mockToastError = vi.fn();
const mockRouterPush = vi.fn();

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    use: (value: unknown) => {
      if (value && typeof (value as { then?: unknown }).then === "function") {
        return { id: "cd-1" };
      }
      return actual.use(value as never);
    },
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/customs-declarations/cd-1",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({
    push: mockRouterPush,
    back: vi.fn(),
  }),
}));

vi.mock("@/services/customsDeclaration.service", () => ({
  customsDeclarationService: {
    getById: (...args: unknown[]) => mockGetById(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

describe("CustomsDeclarationDetailPage 交互逻辑", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/dashboard/customs-declarations/cd-1");
    mockGetById.mockReset();
    mockToastError.mockReset();
    mockRouterPush.mockReset();
  });

  const renderPage = (id = "cd-1") =>
    render(
      <Suspense fallback={<div>页面加载中...</div>}>
        <CustomsDeclarationDetailPage params={Promise.resolve({ id })} />
      </Suspense>,
    );

  it("加载成功后展示报关单摘要与商品明细", async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: "cd-1",
        salesContractId: "s1",
        customsBroker: "合成报关行",
        exchangeRate: null,
        declarationNo: "CUS-2026-001",
        status: "RELEASED",
        declaredAt: "2026-03-01",
        exportDate: "2026-03-04",
        currency: "USD",
        totalAmount: 120000,
        totalQuantity: 1800,
        totalGrossWeight: 21500,
        totalNetWeight: 20800,
        note: "已放行，待船开",
        items: [
          {
            id: "item-1",
            productId: "p1",
            declarationElements: "",
            itemNo: 1,
            customsName: "釉面砖",
            hsCode: "69072190",
            quantity: 1800,
            unit: "箱",
            unitPrice: 66.67,
            totalPrice: 120000,
          },
        ],
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-04T00:00:00.000Z",
      },
    });

    renderPage("cd-1");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "CUS-2026-001" }),
      ).toBeInTheDocument();
    });

    expect(screen.getAllByText("合成报关行").length).toBeGreaterThan(0);
    expect(screen.getByText("出口日期")).toBeInTheDocument();
    expect(screen.getByText("已放行，待船开")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "釉面砖" })).toBeInTheDocument();
    expect(screen.getByText("69072190")).toBeInTheDocument();
  });

  it("点击编辑按钮跳转到编辑页", async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: "cd-1",
        salesContractId: "s1",
        customsBroker: "合成报关行",
        exchangeRate: null,
        declarationNo: "CUS-2026-001",
        status: "DRAFT",
        declaredAt: "2026-03-01",
        currency: "USD",
        totalAmount: 86000,
        totalQuantity: 900,
        totalGrossWeight: 11000,
        totalNetWeight: 10400,
        items: [],
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
    });
    const user = userEvent.setup();

    renderPage("cd-1");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "编辑报关单" }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "编辑报关单" }));
    expect(mockRouterPush).toHaveBeenCalledWith(
      "/dashboard/customs-declarations/cd-1/edit",
    );
  });

  it("加载失败时提示错误", async () => {
    mockGetById.mockRejectedValue(new Error("load failed"));

    renderPage("cd-1");

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("加载报关单详情失败");
    });
  });
});
