/**
 * Input: 销售创建页、products/stores/sales 服务、toast、router
 * Output: 销售创建原子提交、数值输入、重复点击、失败重试和离页中断回归
 * Pos: 前端创建页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateSalesPage from "./page";

const mockPush = vi.fn();
const mockGetProducts = vi.fn();
const mockGetStores = vi.fn();
const mockGetNextContractNo = vi.fn();
const mockToastError = vi.fn();
const mockCreateWithItems = vi.fn();
const mockAddItem = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
  }),
}));

vi.mock("@/services/product.service", () => ({
  productService: {
    getAll: (...args: unknown[]) => mockGetProducts(...args),
  },
}));

vi.mock("@/services/store.service", () => ({
  storeService: {
    getAll: (...args: unknown[]) => mockGetStores(...args),
  },
}));

vi.mock("@/services/sales.service", () => ({
  salesService: {
    calculatePrice: vi.fn(() => 3),
    getNextContractNo: (...args: unknown[]) => mockGetNextContractNo(...args),
    create: vi.fn(),
    createWithItems: (...args: unknown[]) => mockCreateWithItems(...args),
    addItem: (...args: unknown[]) => mockAddItem(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

describe("CreateSalesPage 交互逻辑", () => {
  beforeEach(() => {
    mockGetProducts.mockReset();
    mockGetStores.mockReset();
    mockGetNextContractNo.mockReset();
    mockToastError.mockReset();
    mockCreateWithItems.mockReset();
    mockAddItem.mockReset();
    mockPush.mockReset();
    mockGetNextContractNo.mockResolvedValue({
      data: { contractNo: "EXP2600001" },
    });
  });

  const fillValidForm = async () => {
    mockGetProducts.mockResolvedValue({
      data: { items: [{ id: "prod-1", customsName: "瓷砖" }] },
    });
    mockGetStores.mockResolvedValue({
      data: { items: [{ id: "store-1", name: "上海店" }] },
    });
    const user = userEvent.setup();
    const view = render(<CreateSalesPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("合同编号")).toHaveValue("EXP2600001"),
    );
    await user.clear(screen.getByLabelText("合同编号"));
    await user.type(screen.getByLabelText("合同编号"), "SYNTHETIC-CUSTOM");
    await user.click(screen.getByRole("button", { name: "下一步：出口明细" }));
    await user.click(screen.getByRole("combobox", { name: /商品/ }));
    await user.click(screen.getByRole("option", { name: "瓷砖" }));
    await user.click(screen.getByRole("combobox", { name: /门店/ }));
    await user.click(screen.getByRole("option", { name: "上海店" }));
    await user.clear(screen.getByRole("spinbutton", { name: /数量/ }));
    await user.type(screen.getByRole("spinbutton", { name: /数量/ }), "12");
    await user.clear(screen.getByRole("spinbutton", { name: /成本/ }));
    await user.type(screen.getByRole("spinbutton", { name: /成本/ }), "125");
    expect(screen.getByRole("spinbutton", { name: /成本/ })).toHaveValue(125);
    return { user, ...view };
  };

  it("完整表头和明细一次提交；数值连续输入不丢焦点，重复点击不重复创建", async () => {
    let resolve!: (value: unknown) => void;
    mockCreateWithItems.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { user } = await fillValidForm();
    await user.dblClick(screen.getByRole("button", { name: "创建合同" }));
    await waitFor(() => expect(mockCreateWithItems).toHaveBeenCalledTimes(1));
    expect(mockCreateWithItems).toHaveBeenCalledWith(
      expect.objectContaining({
        contractNo: "SYNTHETIC-CUSTOM",
        items: [
          expect.objectContaining({
            productId: "prod-1",
            storeId: "store-1",
            quantity: 12,
            costPrice: 125,
            sellingPrice: 3,
          }),
        ],
      }),
      expect.any(String),
    );
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "提交中..." })).toBeDisabled();
    await act(async () => resolve({ data: { id: "synthetic-created" } }));
    expect(mockPush).toHaveBeenCalledWith("/dashboard/sales/synthetic-created");
  });

  it("失败保留表单；相同内容重试复用请求键，修改内容后使用新键", async () => {
    mockCreateWithItems.mockRejectedValue(new Error("合成网络中断"));
    const { user } = await fillValidForm();
    const submit = () =>
      user.click(screen.getByRole("button", { name: "创建合同" }));
    await submit();
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("合成网络中断"),
    );
    await submit();
    await waitFor(() => expect(mockCreateWithItems).toHaveBeenCalledTimes(2));
    expect(mockCreateWithItems.mock.calls[1][1]).toBe(
      mockCreateWithItems.mock.calls[0][1],
    );
    await user.clear(screen.getByRole("spinbutton", { name: /数量/ }));
    await user.type(screen.getByRole("spinbutton", { name: /数量/ }), "13");
    await submit();
    await waitFor(() => expect(mockCreateWithItems).toHaveBeenCalledTimes(3));
    expect(mockCreateWithItems.mock.calls[2][1]).not.toBe(
      mockCreateWithItems.mock.calls[1][1],
    );
    expect(mockCreateWithItems.mock.calls[2][0].items[0].quantity).toBe(13);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("离开页面后迟到的创建成功不会把用户跳回旧合同", async () => {
    let resolve!: (value: unknown) => void;
    mockCreateWithItems.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { user, unmount } = await fillValidForm();
    await user.click(screen.getByRole("button", { name: "创建合同" }));
    await waitFor(() => expect(mockCreateWithItems).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => resolve({ data: { id: "synthetic-late" } }));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("加载成功后展示创建页关键元素", async () => {
    mockGetProducts.mockResolvedValue({ data: { items: [] } });
    mockGetStores.mockResolvedValue({ data: { items: [] } });

    render(<CreateSalesPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "创建出口合同" }),
      ).toBeInTheDocument();
      expect(screen.getAllByText("基本信息").length).toBeGreaterThanOrEqual(1);
      expect(
        screen.getByRole("button", { name: /下一步/ }),
      ).toBeInTheDocument();
    });
  });

  it("加载失败时提示错误", async () => {
    mockGetProducts.mockRejectedValue(new Error("load failed"));
    mockGetStores.mockResolvedValue({ data: { items: [] } });

    render(<CreateSalesPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("加载商品和门店数据失败");
    });
  });

  it("空表单提交后显示字段级校验提示", async () => {
    mockGetProducts.mockResolvedValue({
      data: { items: [{ id: "prod-1", customsName: "瓷砖" }] },
    });
    mockGetStores.mockResolvedValue({
      data: { items: [{ id: "store-1", name: "上海店" }] },
    });

    const user = userEvent.setup();
    render(<CreateSalesPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "下一步：出口明细" }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "下一步：出口明细" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "创建合同" }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "创建合同" }));

    await waitFor(() => {
      expect(screen.getByText("请选择商品")).toBeInTheDocument();
      expect(screen.getByText("请选择门店")).toBeInTheDocument();
      expect(screen.getByText("数量必填")).toBeInTheDocument();
      expect(screen.getByText("成本必填")).toBeInTheDocument();
      expect(screen.getByText("售价必填")).toBeInTheDocument();
    });
  });
});
