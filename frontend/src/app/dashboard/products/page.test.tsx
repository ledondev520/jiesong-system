/**
 * Input: 商品管理页面、productService、URL搜索参数、ProductDialog、toast
 * Output: 商品管理页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProductsPage from "./page";

const mockGetAll = vi.fn();
const mockToastError = vi.fn();
const mockSearchParamGet = vi.fn();
const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
    back: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (...args: unknown[]) => mockSearchParamGet(...args),
  }),
  usePathname: () => "/dashboard/products",
}));

vi.mock("@/services/product.service", () => ({
  productService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

vi.mock("./components/ProductDialog", () => ({
  ProductDialog: ({ open }: { open: boolean }) =>
    open ? <div>商品弹窗已打开</div> : null,
}));

describe("ProductsPage 交互逻辑", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/dashboard/products");
    mockGetAll.mockReset();
    mockToastError.mockReset();
    mockSearchParamGet.mockReset();
    mockRouterReplace.mockReset();
    mockSearchParamGet.mockImplementation((key: string) =>
      key === "keyword" ? "" : null,
    );
  });

  it("旧书签 ?tab=inventory 仍可打开并转到库存页；普通访问不跳转", async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const { unmount } = render(<ProductsPage />);
    await waitFor(() => expect(mockGetAll).toHaveBeenCalled());
    expect(mockRouterReplace).not.toHaveBeenCalled();
    unmount();

    mockSearchParamGet.mockImplementation((key: string) =>
      key === "tab" ? "inventory" : null,
    );
    render(<ProductsPage />);
    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenCalledWith("/dashboard/inventory"),
    );
  });

  it("仅含空白的 HS 编码按未填写处理", async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [
          {
            id: "p1",
            customsName: "空白HS",
            hsCode: "   ",
            grossWeight: 1,
            volume: 1,
          },
        ],
      },
    });
    mockSearchParamGet.mockImplementation((key: string) =>
      key === "incomplete" ? "true" : null,
    );
    render(<ProductsPage />);
    expect((await screen.findAllByText(/缺少：HS编码/)).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText("HS编码:")).not.toBeInTheDocument();
  });

  it("按服务端总数翻到第二页，保留低库存筛选", async () => {
    mockSearchParamGet.mockImplementation((key: string) =>
      key === "lowStock" ? "true" : null,
    );
    mockGetAll.mockResolvedValue({
      data: {
        items: [],
        pagination: { total: 140, page: 1, pageSize: 20, totalPages: 7 },
      },
    });
    const user = userEvent.setup();
    render(<ProductsPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "下一页" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await waitFor(() =>
      expect(mockGetAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, pageSize: 20, lowStock: true }),
      ),
    );
  });

  it("根据URL关键词初始化并拉取列表", async () => {
    mockSearchParamGet.mockImplementation((key: string) =>
      key === "keyword" ? "苹果" : null,
    );
    mockGetAll.mockResolvedValue({ data: { items: [] } });

    render(<ProductsPage />);

    await waitFor(() => {
      expect(mockGetAll).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        keyword: "苹果",
        lite: true,
      });
      expect(screen.getByDisplayValue("苹果")).toBeInTheDocument();
    });
  });

  it("修改搜索关键词会触发重新查询", async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<ProductsPage />);

    const input = screen.getByPlaceholderText("搜索商品...");
    await user.clear(input);
    await user.type(input, "香蕉");

    await waitFor(() => {
      expect(mockGetAll).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        keyword: "香蕉",
        lite: true,
      });
    });
  });

  it("从全局搜索进入后允许修改和清空 URL 初始关键词", async () => {
    mockSearchParamGet.mockImplementation((key: string) =>
      key === "keyword" ? "苹果" : null,
    );
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<ProductsPage />);

    const input = screen.getByPlaceholderText("搜索商品...");
    await user.clear(input);
    await user.type(input, "香蕉");
    await waitFor(() => {
      expect(mockGetAll).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        keyword: "香蕉",
        lite: true,
      });
    });

    await user.clear(input);
    await waitFor(() => {
      expect(mockGetAll).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        keyword: undefined,
        lite: true,
      });
    });
  });

  it("点击新增商品会打开弹窗", async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<ProductsPage />);

    await user.click(screen.getByRole("button", { name: /新增商品/ }));
    expect(screen.getByText("商品弹窗已打开")).toBeInTheDocument();
  });
});

it("资料不全按钮把 incomplete 发送到后端，页面不再有库存页签", async () => {
  mockSearchParamGet.mockImplementation(() => null);
  mockGetAll.mockResolvedValue({
    data: {
      items: [
        {
          id: "p1",
          customsName: "合成瓷砖",
          grossWeight: 0,
          volume: 0.5,
          hsCode: "",
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    },
  });
  const user = userEvent.setup();
  render(<ProductsPage />);
  expect(
    screen.queryByRole("tab", { name: "库存状态" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "资料不全" }));
  await waitFor(() =>
    expect(mockGetAll).toHaveBeenLastCalledWith(
      expect.objectContaining({ incomplete: true }),
    ),
  );
  expect(
    (await screen.findAllByText(/缺少：毛重、HS编码/)).length,
  ).toBeGreaterThan(0);
});
