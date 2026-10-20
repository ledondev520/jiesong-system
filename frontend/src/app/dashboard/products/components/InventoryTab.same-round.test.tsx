/**
 * Input: 库存页签、同一轮完成的合成库存列表请求与状态更新请求
 * Output: 旧列表不覆盖新状态、列表/状态更新提示顺序与原 async try/await 一致的回归测试
 * Pos: 库存页签请求回调时序回归测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { InventoryStatus } from "@/types";
import { InventoryTab } from "./InventoryTab";

const mockGetAll = vi.hoisted(() => vi.fn());
const mockUpdateStatus = vi.hoisted(() => vi.fn());
const toastCalls = vi.hoisted(() => [] as string[]);

vi.mock("@/services/inventory.service", () => ({
  inventoryService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
    batchUpdateStatus: vi.fn(),
  },
}));
vi.mock("@/lib/api-cache", () => ({
  cachedFetch: (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: {
    error: (message: string) => toastCalls.push(`E:${message}`),
    success: (message: string) => toastCalls.push(`S:${message}`),
  },
}));

function defer<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

const inventoryItem = (status: InventoryStatus) => ({
  id: "inv-1",
  productId: "p-1",
  quantity: 10,
  status,
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
  product: { customsName: "合成商品" },
});
const listResponse = (items: unknown[]) => ({
  data: { items, pagination: { total: items.length, totalPages: 1 } },
});

/** 搜索列表请求与状态更新都在途时，在同一轮中先完成列表、再完成状态更新 */
async function runListThenUpdate(list: "ok" | "fail", update: "ok" | "fail") {
  toastCalls.length = 0;
  mockGetAll.mockReset();
  mockUpdateStatus.mockReset();
  window.history.replaceState({}, "", "/dashboard/products?tab=inventory");
  mockGetAll.mockResolvedValueOnce(
    listResponse([inventoryItem(InventoryStatus.SHIPPING)]),
  );
  const search = defer<unknown>();
  const statusUpdate = defer<unknown>();
  mockGetAll.mockReturnValueOnce(search.promise);
  mockUpdateStatus.mockReturnValueOnce(statusUpdate.promise);

  const view = render(<InventoryTab />);
  const stockInButtons = await screen.findAllByRole("button", {
    name: /状态更新为 已入库/,
  });
  fireEvent.change(screen.getAllByPlaceholderText("搜索商品/采购合同...")[0], {
    target: { value: "合成" },
  });
  fireEvent.click(stockInButtons[0]);
  await waitFor(() => expect(mockUpdateStatus).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(mockGetAll).toHaveBeenCalledTimes(2), {
    timeout: 3000,
  });

  await act(async () => {
    if (list === "ok") {
      search.resolve(listResponse([inventoryItem(InventoryStatus.SHIPPING)]));
    } else {
      search.reject(new Error("list failed"));
    }
    if (update === "ok") statusUpdate.resolve({});
    else statusUpdate.reject(new Error("update failed"));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const text = document.body.textContent ?? "";
  const toasts = [...toastCalls];
  view.unmount();
  return { text, toasts };
}

describe("库存页签同轮请求回调时序", () => {
  it("同一轮先完成旧列表、后完成状态更新时，新状态不被旧列表覆盖", async () => {
    const { text, toasts } = await runListThenUpdate("ok", "ok");
    expect(text).toContain("当前状态已入库");
    expect(text).not.toContain("运输中");
    expect(toasts).toEqual(["S:状态已更新"]);
  }, 20000);

  it("同一轮列表失败、状态更新成功时，提示顺序与完成顺序一致", async () => {
    const { toasts } = await runListThenUpdate("fail", "ok");
    expect(toasts).toEqual(["E:加载库存失败", "S:状态已更新"]);
  }, 20000);

  it("同一轮列表与状态更新都失败时，提示顺序与完成顺序一致", async () => {
    const { toasts } = await runListThenUpdate("fail", "fail");
    expect(toasts).toEqual(["E:加载库存失败", "E:update failed"]);
  }, 20000);
});
