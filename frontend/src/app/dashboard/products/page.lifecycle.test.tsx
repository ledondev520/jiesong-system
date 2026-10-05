/**
 * Input: 商品管理页面、真实编辑对话框、延迟或失败的合成保存请求
 * Output: 保存失败可重试、旧会话保存不会关闭新编辑或恢复旧筛选的回归测试
 * Pos: 商品档案页面生命周期集成测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/types";
import ProductsPage from "./page";

const mockGetAll = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockToastError = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/layout/ModuleTabHeader", () => ({
  ModuleTabHeader: () => null,
  PROCUREMENT_TABS: [],
}));
vi.mock("./components/InventoryTab", () => ({ InventoryTab: () => null }));
vi.mock("@/services/product.service", () => ({
  productService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));
vi.mock("@/services/hsCode.service", () => ({
  hsCodeService: {
    searchByProductName: vi.fn().mockResolvedValue({ data: [] }),
  },
}));
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

const savedProduct: Product = {
  id: "qa-product-1",
  customsName: "合成测试商品",
  specification: "合成测试规格",
  isActive: true,
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
};

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("ProductsPage 保存会话", () => {
  beforeEach(() => {
    mockGetAll
      .mockReset()
      .mockResolvedValue({ data: { items: [savedProduct] } });
    mockCreate.mockReset().mockResolvedValue({ data: { id: "qa-created" } });
    mockUpdate.mockReset().mockResolvedValue({ data: savedProduct });
    mockToastError.mockReset();
  });

  it.each(["create", "edit"] as const)(
    "保存 %s 失败保留整份草稿，重试成功才关闭",
    async (mode) => {
      const persist = mode === "create" ? mockCreate : mockUpdate;
      persist.mockRejectedValueOnce(new Error("synthetic persistence failure"));
      const user = userEvent.setup();
      render(<ProductsPage />);
      if (mode === "create")
        await user.click(screen.getByRole("button", { name: /新增商品/ }));
      else
        await user.click(
          (await screen.findAllByRole("button", { name: "编辑" }))[0],
        );

      fireEvent.change(screen.getByLabelText("报关名称 *"), {
        target: { value: "合成保存失败商品" },
      });
      fireEvent.change(screen.getByLabelText("规格"), {
        target: { value: "重试时应保留规格" },
      });
      fireEvent.change(screen.getByLabelText("毛重 (kg/箱)"), {
        target: { value: "7" },
      });
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "保存" })).toBeEnabled(),
      );
      await user.click(screen.getByRole("button", { name: "保存" }));
      await waitFor(() => expect(mockToastError).toHaveBeenCalled());

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByLabelText("报关名称 *")).toHaveValue(
        "合成保存失败商品",
      );
      expect(screen.getByLabelText("规格")).toHaveValue("重试时应保留规格");
      expect(screen.getByLabelText("毛重 (kg/箱)")).toHaveValue(7);
      await user.click(screen.getByRole("button", { name: "保存" }));
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(persist).toHaveBeenCalledTimes(2);
      expect(persist.mock.calls[1]).toEqual(persist.mock.calls[0]);
    },
  );

  it("关闭待保存编辑后打开新增，旧保存完成仍保留新草稿和当前搜索", async () => {
    const pending = deferred();
    mockUpdate.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<ProductsPage />);
    await user.click(
      (await screen.findAllByRole("button", { name: "编辑" }))[0],
    );
    fireEvent.change(screen.getByLabelText("规格"), {
      target: { value: "原会话提交规格" },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.change(screen.getByPlaceholderText("搜索商品..."), {
      target: { value: "新筛选" },
    });
    await waitFor(() =>
      expect(mockGetAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: "新筛选" }),
      ),
    );
    await user.click(screen.getByRole("button", { name: /新增商品/ }));
    fireEvent.change(screen.getByLabelText("报关名称 *"), {
      target: { value: "另一个新草稿" },
    });
    fireEvent.change(screen.getByLabelText("规格"), {
      target: { value: "不应被旧保存清空" },
    });
    await act(async () => pending.resolve({ data: savedProduct }));

    expect(
      screen.getByRole("dialog", { name: "新增商品" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("规格")).toHaveValue("不应被旧保存清空");
    expect(mockGetAll).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: "新筛选" }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("重复提交待保存表单，只发送一次商品更新", async () => {
    const pending = deferred();
    mockUpdate.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<ProductsPage />);
    await user.click(
      (await screen.findAllByRole("button", { name: "编辑" }))[0],
    );
    fireEvent.change(screen.getByLabelText("规格"), {
      target: { value: "一次保存" },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存" })).toBeEnabled(),
    );
    const form = screen.getByRole("button", { name: "保存" }).closest("form")!;
    fireEvent.submit(form);
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    fireEvent.submit(form);
    await act(async () => {});
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "保存中..." })).toBeDisabled();
    expect(screen.getByLabelText("规格")).toBeDisabled();
    await act(async () => pending.resolve({ data: savedProduct }));
  });

  it("取消编辑后列表为空，从空列表新增入口打开一份空白表单", async () => {
    const user = userEvent.setup();
    render(<ProductsPage />);
    await user.click(
      (await screen.findAllByRole("button", { name: "编辑" }))[0],
    );
    await user.click(screen.getByRole("button", { name: "关闭" }));
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    fireEvent.change(screen.getByPlaceholderText("搜索商品..."), {
      target: { value: "没有合成商品" },
    });
    await screen.findByText("暂无商品");
    await user.click(screen.getAllByRole("button", { name: /新增商品/ })[1]);

    expect(
      screen.getByRole("dialog", { name: "新增商品" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("报关名称 *")).toHaveValue("");
    expect(screen.getByLabelText("规格")).toHaveValue("");
  });
});
