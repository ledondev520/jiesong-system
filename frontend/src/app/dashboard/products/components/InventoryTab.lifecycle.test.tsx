import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
