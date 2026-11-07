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
vi.mock("@/services/store.service", () => ({
  storeService: {
    getAll: vi.fn(async () => ({
      data: { items: [{ id: "store-2", name: "第二店" }] },
    })),
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

it("数量列只显示数量和有效单位，纯数字单位不冒充第二个数字；包装中为警示色而非红色", async () => {
  const row = (
    id: string,
    quantity: number,
    unit: string,
    status: InventoryStatus,
  ) => ({
    id,
    productId: `p-${id}`,
    product: { customsName: `商品${id}`, unit },
    quantity,
    status,
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
  });
  getAll.mockResolvedValueOnce({
    data: {
      items: [
        row("a", 40, "41.0", InventoryStatus.PACKING),
        row("b", 6, "件", InventoryStatus.SHIPPING),
      ] as unknown as Inventory[],
      pagination: { total: 2, totalPages: 1 },
    },
  });
  render(<InventoryTab />);
  expect((await screen.findAllByText("40")).length).toBeGreaterThan(0);
  expect(screen.getAllByText("6 件").length).toBeGreaterThan(0);
  expect(screen.queryByText(/41\.0/)).not.toBeInTheDocument();
  const badges = screen
    .getAllByText("包装中")
    .filter((el) => el.className.includes("border-"));
  expect(badges.length).toBeGreaterThan(0);
  for (const badge of badges) {
    expect(badge.className).toContain("amber");
    // Badge 基类自带 aria-invalid:*destructive，只排除红色变体本身
    expect(badge.className).not.toContain("bg-destructive");
  }
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
    "/dashboard/inventory?inventoryStore=store-2",
  );
  getAll.mockClear();
  render(<InventoryTab />);
  await waitFor(() =>
    expect(getAll).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: "store-2" }),
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

it("「详情」打开只读库存详情，不触发任何状态变更 (B17)", async () => {
  batchUpdateStatus.mockClear();
  getAll.mockResolvedValueOnce({
    data: {
      items: [
        {
          id: "synthetic-stock",
          productId: "synthetic-product",
          quantity: 10,
          status: InventoryStatus.INBOUND,
          note: "合成备注",
          inboundAt: "2026-10-02T08:00:00.000Z",
          createdAt: "2026-10-01",
          updatedAt: "2026-10-01",
          product: {
            id: "synthetic-product",
            customsName: "合成瓷砖",
            unit: "箱",
          } as Inventory["product"],
        },
      ],
      pagination: { total: 1, totalPages: 1 },
    },
  });
  const user = userEvent.setup();
  render(<InventoryTab />);
  await user.click(
    (await screen.findAllByRole("button", { name: "查看 合成瓷砖 详情" }))[0],
  );
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("合成瓷砖");
  expect(dialog).toHaveTextContent("合成备注");
  expect(dialog).toHaveTextContent("2026-10-02");
  expect(dialog).toHaveTextContent("手工流转");
  expect(batchUpdateStatus).not.toHaveBeenCalled();
});

const stockRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  productId: `p-${id}`,
  product: { customsName: `商品${id}`, unit: "件" },
  quantity: 5,
  status: InventoryStatus.INBOUND,
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
  ...over,
});

it("显示入库日期；没有入库时间的行显示「—」，并解释可用库存口径与系统不记录仓库/批次", async () => {
  getAll.mockResolvedValueOnce({
    data: {
      items: [
        stockRow("a", { inboundAt: "2026-10-05T03:00:00.000Z" }),
        stockRow("b"),
      ] as unknown as Inventory[],
      pagination: { total: 2, totalPages: 1 },
    },
  });
  render(<InventoryTab />);
  expect(
    await screen.findByRole("columnheader", { name: "入库日期" }),
  ).toBeInTheDocument();
  expect(screen.getAllByText("2026-10-05").length).toBeGreaterThan(0);
  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  expect(screen.getByText(/只统计状态为「已入库」的数量/)).toBeInTheDocument();
  expect(
    screen.getByText(/系统目前不记录仓库\/库位和批次号/),
  ).toBeInTheDocument();
});

it("当前页没有任何采购合同来源时隐藏整列「采购合同」；有来源时显示", async () => {
  getAll.mockResolvedValueOnce({
    data: {
      items: [stockRow("a")] as unknown as Inventory[],
      pagination: { total: 1, totalPages: 1 },
    },
  });
  const { unmount } = render(<InventoryTab />);
  await screen.findByRole("columnheader", { name: "入库日期" });
  expect(screen.queryByRole("columnheader", { name: /采购合同/ })).toBeNull();
  unmount();

  getAll.mockResolvedValueOnce({
    data: {
      items: [
        stockRow("a", {
          purchaseItem: {
            store: { name: "S-合成店" },
            purchaseContract: {
              contractNo: "PC-9",
              supplier: { name: "合成供应商" },
            },
          },
        }),
      ] as unknown as Inventory[],
      pagination: { total: 1, totalPages: 1 },
    },
  });
  render(<InventoryTab />);
  expect(
    await screen.findByRole("columnheader", { name: /采购合同/ }),
  ).toBeInTheDocument();
  expect(screen.getAllByText("PC-9").length).toBeGreaterThan(0);
  expect(screen.getAllByText("S-合成店").length).toBeGreaterThan(0);
  expect(screen.getAllByText("合成供应商").length).toBeGreaterThan(0);
});
