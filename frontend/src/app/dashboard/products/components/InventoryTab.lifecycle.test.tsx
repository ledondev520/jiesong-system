import { beforeEach, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { InventoryStatus, type Inventory } from "@/types";
import { clearAllCache } from "@/lib/api-cache";
import { InventoryTab } from "./InventoryTab";

const getAll = vi.fn();
const batchUpdateStatus = vi.fn();
vi.mock("@/services/inventory.service", () => ({
  inventoryService: {
    getAll: (...args: unknown[]) => getAll(...args),
    batchUpdateStatus: (...args: unknown[]) => batchUpdateStatus(...args),
  },
}));
vi.mock("@/lib/hooks/useBusinessReadOnly", () => ({
  BusinessWrite: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const stock: Inventory = {
  id: "synthetic-stock",
  productId: "synthetic-product",
  quantity: 10,
  status: InventoryStatus.SHIPPING,
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
};
const response = (items: Inventory[]) => ({
  data: { items, pagination: { total: items.length, totalPages: 1 } },
});
beforeEach(() => {
  clearAllCache();
  getAll.mockReset();
  batchUpdateStatus.mockReset();
  getAll.mockResolvedValue(response([stock]));
  batchUpdateStatus.mockResolvedValue({
    data: { success: 1, failed: 0, errors: [] },
  });
});

it("成功批量入库后立即读取新库存，不从页面缓存恢复旧状态", async () => {
  render(<InventoryTab />);
  const checkbox = (
    await screen.findAllByRole("checkbox", { name: "选择库存 synthetic-stock" })
  )[0];
  fireEvent.click(checkbox);
  getAll.mockResolvedValue(
    response([{ ...stock, status: InventoryStatus.INBOUND }]),
  );
  fireEvent.click(screen.getByRole("button", { name: "批量设为已入库" }));
  await waitFor(() =>
    expect(batchUpdateStatus).toHaveBeenCalledWith(
      ["synthetic-stock"],
      "INBOUND",
    ),
  );
  await waitFor(() => expect(getAll).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("运输中")).not.toBeInTheDocument();
  expect(screen.getAllByText("已入库").length).toBeGreaterThan(0);
});

it("验货后重新进入库存页面立即读取新增合格库存", async () => {
  getAll.mockResolvedValue(response([]));
  const first = render(<InventoryTab />);
  await screen.findAllByText("暂无库存记录");
  first.unmount();
  getAll.mockResolvedValue(
    response([
      {
        ...stock,
        purchaseItemId: "synthetic-purchase",
        status: InventoryStatus.INBOUND,
      },
    ]),
  );
  render(<InventoryTab />);
  await waitFor(() => expect(getAll).toHaveBeenCalledTimes(2));
  expect(await screen.findByText("自动流转")).toBeInTheDocument();
});

it("批量更新等待期间切换搜索，完成后只刷新当前搜索结果", async () => {
  let finish!: (value: {
    data: { success: number; failed: number; errors: never[] };
  }) => void;
  batchUpdateStatus.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const filteredStock = { ...stock, id: "synthetic-filtered-stock" };
  getAll.mockImplementation(async ({ keyword }: { keyword?: string }) =>
    response(keyword ? [filteredStock] : [stock]),
  );
  render(<InventoryTab />);
  fireEvent.click(
    (
      await screen.findAllByRole("checkbox", {
        name: "选择库存 synthetic-stock",
      })
    )[0],
  );
  fireEvent.click(screen.getByRole("button", { name: "批量设为已入库" }));
  await waitFor(() => expect(batchUpdateStatus).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByPlaceholderText("搜索商品/采购合同..."), {
    target: { value: "新搜索" },
  });
  await screen.findAllByRole("checkbox", {
    name: "选择库存 synthetic-filtered-stock",
  });
  await act(async () => {
    finish({ data: { success: 1, failed: 0, errors: [] } });
  });
  await waitFor(() => expect(getAll).toHaveBeenCalledTimes(3));
  expect(getAll).toHaveBeenLastCalledWith({
    page: 1,
    pageSize: 20,
    keyword: "新搜索",
  });
  expect(
    await screen.findAllByRole("checkbox", {
      name: "选择库存 synthetic-filtered-stock",
    }),
  ).toHaveLength(2);
  expect(
    screen.queryByRole("checkbox", { name: "选择库存 synthetic-stock" }),
  ).not.toBeInTheDocument();
});

it("批量更新等待期间翻页，完成后继续显示当前页", async () => {
  let finish!: (value: {
    data: { success: number; failed: number; errors: never[] };
  }) => void;
  batchUpdateStatus.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  getAll.mockImplementation(async ({ page }: { page: number }) => ({
    data: {
      items: [{ ...stock, id: `synthetic-page-${page}` }],
      pagination: { total: 40, totalPages: 2 },
    },
  }));
  render(<InventoryTab />);
  fireEvent.click(
    (
      await screen.findAllByRole("checkbox", {
        name: "选择库存 synthetic-page-1",
      })
    )[0],
  );
  fireEvent.click(screen.getByRole("button", { name: "批量设为已入库" }));
  await waitFor(() => expect(batchUpdateStatus).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  await screen.findAllByRole("checkbox", { name: "选择库存 synthetic-page-2" });
  await act(async () => {
    finish({ data: { success: 1, failed: 0, errors: [] } });
  });
  await waitFor(() => expect(getAll).toHaveBeenCalledTimes(3));
  expect(getAll).toHaveBeenLastCalledWith({
    page: 2,
    pageSize: 20,
    keyword: undefined,
  });
  expect(
    await screen.findAllByRole("checkbox", {
      name: "选择库存 synthetic-page-2",
    }),
  ).toHaveLength(2);
  expect(
    screen.queryByRole("checkbox", { name: "选择库存 synthetic-page-1" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/第 2\/2 页/)).toBeInTheDocument();
});
