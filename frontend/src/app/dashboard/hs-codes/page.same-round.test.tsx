/**
 * Input: HS 编码页面、同一轮完成的合成列表刷新与税则保存请求
 * Output: 列表刷新与保存的成功/失败回调顺序与原 async try/await 一致的回归测试（旧列表不覆盖新保存结果、提示顺序不变）
 * Pos: HS 编码页面请求回调时序回归测试
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
import HsCodesPage from "./page";

const mockList = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const toastCalls = vi.hoisted(() => [] as string[]);

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard/hs-codes",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));
vi.mock("@/services/hsCode.service", () => ({
  hsCodeService: {
    list: (...args: unknown[]) => mockList(...args),
    search: vi.fn(),
    getByCode: vi.fn(),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));
vi.mock("sonner", () => ({
  toast: {
    error: (message: string) => toastCalls.push(`E:${message}`),
    success: (message: string) => toastCalls.push(`S:${message}`),
    info: vi.fn(),
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

const record = (refundRate: number) => ({
  id: "hs-1",
  hsCode: "69072190",
  productName: "抛光瓷砖",
  unit: "平方米",
  refundRate,
});
const listResponse = (items: unknown[]) => ({
  data: {
    items,
    pagination: { page: 1, pageSize: 20, total: items.length, totalPages: 1 },
  },
});

/** 列表刷新与税则保存都在途时，在同一轮中先完成列表、再完成保存 */
async function runListThenSave(list: "ok" | "fail", save: "ok" | "fail") {
  toastCalls.length = 0;
  mockList.mockReset();
  mockUpdate.mockReset();
  mockList.mockResolvedValueOnce(listResponse([record(13)]));
  const refresh = defer<unknown>();
  const update = defer<unknown>();
  mockList.mockReturnValueOnce(refresh.promise);
  mockUpdate.mockReturnValueOnce(update.promise);

  const view = render(<HsCodesPage />);
  fireEvent.click(await screen.findByRole("cell", { name: "抛光瓷砖" }));
  fireEvent.change(screen.getByPlaceholderText("商品名称（支持模糊匹配）"), {
    target: { value: "瓷砖" },
  });
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2), {
    timeout: 2000,
  });
  fireEvent.click(await screen.findByRole("button", { name: "人工更新税则" }));
  fireEvent.change(screen.getByLabelText("出口退税率（%）"), {
    target: { value: "0" },
  });
  fireEvent.change(screen.getByLabelText("生效日期"), {
    target: { value: "2026-01-01" },
  });
  fireEvent.change(screen.getByLabelText("官方来源链接"), {
    target: { value: "https://www.chinatax.gov.cn/example" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存税则证据" }));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));

  await act(async () => {
    if (list === "ok") refresh.resolve(listResponse([record(13)]));
    else refresh.reject(new Error("list failed"));
    if (save === "ok") {
      update.resolve({
        data: {
          ...record(0),
          effectiveDate: "2026-01-01T00:00:00.000Z",
          sourceUrl: "https://www.chinatax.gov.cn/example",
        },
      });
    } else {
      update.reject(new Error("save failed"));
    }
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  // 关闭保存对话框与详情，回到列表查看表格中的退税率
  for (let i = 0; i < 2; i++) {
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }
  fireEvent.click(screen.getByRole("button", { name: /返回列表/ }));
  const cells = Array.from(document.querySelectorAll("td")).map(
    (cell) => cell.textContent ?? "",
  );
  const text = cells.join("|");
  const toasts = [...toastCalls];
  view.unmount();
  return { text, toasts };
}

describe("HS 编码页面同轮请求回调时序", () => {
  it("同一轮先完成旧列表、后完成保存时，保存结果不被旧列表覆盖", async () => {
    const { text, toasts } = await runListThenSave("ok", "ok");
    expect(text).toContain("0%");
    expect(text).not.toContain("13%");
    expect(toasts).toEqual(["S:HS 税则证据已更新"]);
  }, 20000);

  it("同一轮列表失败、保存成功时，提示顺序与列表/保存完成顺序一致", async () => {
    const { toasts } = await runListThenSave("fail", "ok");
    expect(toasts).toEqual(["E:搜索失败，请稍后重试", "S:HS 税则证据已更新"]);
  }, 20000);

  it("同一轮列表与保存都失败时，提示顺序与完成顺序一致", async () => {
    const { toasts } = await runListThenSave("fail", "fail");
    expect(toasts).toEqual([
      "E:搜索失败，请稍后重试",
      "E:HS 税则更新失败，请检查税率、日期和来源链接",
    ]);
  }, 20000);
});
