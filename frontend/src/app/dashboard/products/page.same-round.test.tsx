/**
 * Input: 商品管理页面、同一轮完成的合成防抖列表请求与删除请求
 * Output: 列表失败提示不被删除后的重新加载吞掉、列表/删除提示顺序与原 async try/await 一致的回归测试
 * Pos: 商品档案页面请求回调时序回归测试
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
import ProductsPage from "./page";

const mockGetAll = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());
const toastCalls = vi.hoisted(() => [] as string[]);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/dashboard/products",
}));
vi.mock("@/services/product.service", () => ({
  productService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    create: vi.fn(),
    update: vi.fn(),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));
vi.mock("sonner", () => ({
  toast: {
    error: (message: string) => toastCalls.push(`E:${message}`),
    success: (message: string) => toastCalls.push(`S:${message}`),
  },
}));
vi.mock("./components/ProductDialog", () => ({ ProductDialog: () => null }));

function defer<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

const product = (id: string, customsName: string) => ({
  id,
  customsName,
  specification: "",
  unit: "件",
  stock: 10,
  minStock: 0,
  price: 1,
});
const pageResponse = (items: unknown[]) => ({
  data: {
    items,
    pagination: { total: items.length, page: 1, pageSize: 20, totalPages: 1 },
  },
});

/** 搜索防抖列表请求与删除请求都在途时，在同一轮中先让列表失败、再完成删除 */
async function runListFailThenDelete(deletion: "ok" | "fail") {
  toastCalls.length = 0;
  mockGetAll.mockReset();
  mockDelete.mockReset();
  mockGetAll.mockResolvedValueOnce(
    pageResponse([product("a", "苹果"), product("b", "香蕉")]),
  );
  const search = defer<unknown>();
  const reload = defer<unknown>();
  const remove = defer<unknown>();
  mockGetAll
    .mockReturnValueOnce(search.promise)
    .mockReturnValueOnce(reload.promise);
  mockDelete.mockReturnValueOnce(remove.promise);

  const view = render(<ProductsPage />);
  await screen.findAllByText("苹果");
  fireEvent.change(screen.getByPlaceholderText("搜索商品..."), {
    target: { value: "果" },
  });
  const trashButton = Array.from(document.querySelectorAll("svg"))
    .find((icon) => /trash/i.test(icon.getAttribute("class") ?? ""))
    ?.closest("button");
  expect(trashButton).toBeTruthy();
  fireEvent.click(trashButton as HTMLElement);
  fireEvent.click(await screen.findByRole("button", { name: "确认删除" }));
  await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(mockGetAll).toHaveBeenCalledTimes(2), {
    timeout: 3000,
  });

  await act(async () => {
    search.reject(new Error("list failed"));
    if (deletion === "ok") remove.resolve({});
    else remove.reject(new Error("delete failed"));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const toasts = [...toastCalls];
  await act(async () => {
    reload.resolve(pageResponse([product("c", "青果")]));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  view.unmount();
  return toasts;
}

describe("商品管理页面同轮请求回调时序", () => {
  it("同一轮列表失败、删除成功时，列表失败提示不被删除后的重新加载吞掉", async () => {
    expect(await runListFailThenDelete("ok")).toEqual([
      "E:加载商品失败",
      "S:商品已删除",
    ]);
  }, 20000);

  it("同一轮列表与删除都失败时，提示顺序与完成顺序一致", async () => {
    expect(await runListFailThenDelete("fail")).toEqual([
      "E:加载商品失败",
      "E:删除失败",
    ]);
  }, 20000);
});
