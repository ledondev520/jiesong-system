import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InventoryStatus, type Inventory } from "@/types";
import { InventoryTab } from "./InventoryTab";

const getAll = vi.fn(async (_params: unknown) => ({
  data: {
    items: [] as Inventory[],
    pagination: { total: 302, totalPages: 16 },
  },
}));
const batchUpdateStatus = vi.fn(async (_ids: string[], _status: string) => ({
  data: { success: 2, failed: 0 },
}));
vi.mock("@/services/inventory.service", () => ({
  inventoryService: {
    getAll: (...args: unknown[]) => getAll(args[0]),
    batchUpdateStatus: (ids: string[], status: string) =>
      batchUpdateStatus(ids, status),
  },
}));
vi.mock("@/services/purchase.service", () => ({
  purchaseService: {
    getAll: vi.fn(async () => ({ data: { summary: { stores: ["第二店"] } } })),
  },
}));
vi.mock("@/lib/api-cache", () => ({
  cachedFetch: (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
}));

beforeEach(() => window.history.replaceState({}, "", "/dashboard/inventory"));

it("库存后端总数与实际页码一致，第二页继续请求服务端", async () => {
  const user = userEvent.setup();
  render(<InventoryTab />);
  expect(await screen.findByText(/共 302 条/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "下一页" }));
  await waitFor(() =>
    expect(getAll).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
      keyword: undefined,
    }),
  );
  expect(screen.getByText(/第 2\/16 页/)).toBeInTheDocument();
});

it("采购来源库存不再要求手工设置入库/出库", async () => {
  getAll.mockResolvedValueOnce({
    data: {
      items: [
        {
          id: "synthetic-stock",
          productId: "synthetic-product",
          purchaseItemId: "synthetic-purchase",
          quantity: 10,
          status: InventoryStatus.INBOUND,
          createdAt: "2026-10-01",
          updatedAt: "2026-10-01",
        },
      ],
      pagination: { total: 1, totalPages: 1 },
    },
  });
  render(<InventoryTab />);
  expect(await screen.findByText("自动流转")).toBeInTheDocument();
  expect(screen.queryByText("批量设为已入库")).not.toBeInTheDocument();
  expect(screen.queryByText("批量设为已出库")).not.toBeInTheDocument();
  expect(
    screen
      .getAllByRole("checkbox", { name: /选择库存/ })
      .every((e) => e.getAttribute("data-disabled") !== null),
  ).toBe(true);
});

it("URL 中的店铺筛选发送到后端并可见", async () => {
  window.history.replaceState(
    {},
    "",
    "/dashboard/inventory?inventoryStore=%E7%AC%AC%E4%BA%8C%E5%BA%97",
  );
  getAll.mockClear();
  render(<InventoryTab />);
  await waitFor(() =>
    expect(getAll).toHaveBeenCalledWith(
      expect.objectContaining({ storeName: "第二店" }),
    ),
  );
  expect((await screen.findAllByText("第二店")).length).toBeGreaterThan(0);
});

it("批量变更确认弹窗的条数与实际提交的库存一致", async () => {
  getAll.mockResolvedValueOnce({
    data: {
      items: ["a", "b"].map((id) => ({
        id: `manual-${id}`,
        productId: "synthetic-product",
        product: { customsName: `手工库存${id}` },
        quantity: 5,
        status: InventoryStatus.PACKING,
        createdAt: "2026-10-01",
        updatedAt: "2026-10-01",
      })) as unknown as Inventory[],
      pagination: { total: 2, totalPages: 1 },
    },
  });
  batchUpdateStatus.mockClear();
  const user = userEvent.setup();
  render(<InventoryTab />);
  const selectAll = await screen.findAllByRole("checkbox", {
    name: "全选库存记录",
  });
  await user.click(selectAll[0]);
  await user.click(
    screen.getAllByRole("button", { name: "批量设为已入库" })[0],
  );
  expect(
    await screen.findByText(/将选中的 2 条库存设为已入库/),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "确认" }));
  await waitFor(() =>
    expect(batchUpdateStatus).toHaveBeenCalledWith(
      ["manual-a", "manual-b"],
      InventoryStatus.INBOUND,
    ),
  );
});
