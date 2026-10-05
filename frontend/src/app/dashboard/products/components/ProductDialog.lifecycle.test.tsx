/**
 * Input: 商品编辑会话、关闭/重开/切换操作、可延迟的 HSCode 查询
 * Output: 取消恢复已保存资料、建议稳定后验证详情顺序及当前会话异步隔离
 * Pos: 商品档案组件生命周期测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { useState } from "react";
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
import { ProductDialog } from "./ProductDialog";

const mockSearch = vi.fn();
const mockGetByCode = vi.fn();

vi.mock("@/services/hsCode.service", () => ({
  hsCodeService: {
    searchByProductName: (...args: unknown[]) => mockSearch(...args),
    searchByHsCode: (...args: unknown[]) => mockGetByCode(...args),
  },
}));

const savedProduct: Product = {
  id: "qa-product-1",
  customsName: "甲",
  specification: "合成测试规格",
  hsCode: "11111111",
  unit: "件",
  grossWeight: 2,
  isActive: true,
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
};

const firstMatch = {
  id: "qa-hs-1",
  hsCode: "69072190",
  productName: "合成瓷砖",
  taxRate: 13,
  unit: "平方米",
};
const secondMatch = {
  ...firstMatch,
  id: "qa-hs-2",
  hsCode: "69072290",
  productName: "合成玻璃",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function EditorHarness({
  product = savedProduct,
}: {
  product?: Product | null;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>重新打开</button>
      <ProductDialog
        open={open}
        product={product}
        onOpenChange={setOpen}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />
    </>
  );
}

describe("ProductDialog 编辑会话", () => {
  beforeEach(() => {
    mockSearch.mockReset().mockResolvedValue({ data: [] });
    mockGetByCode.mockReset().mockResolvedValue({ data: firstMatch });
  });

  it("重复关闭同一商品后重新打开，恢复已保存规格和其他字段", async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      fireEvent.change(screen.getByLabelText("规格"), {
        target: { value: "QA未保存规格取消验证" },
      });
      fireEvent.change(screen.getByLabelText("毛重 (kg/箱)"), {
        target: { value: "99" },
      });
      await user.click(screen.getByRole("button", { name: "关闭" }));
      await user.click(screen.getByRole("button", { name: "重新打开" }));

      expect(screen.getByLabelText("规格")).toHaveValue("合成测试规格");
      expect(screen.getByLabelText("毛重 (kg/箱)")).toHaveValue(2);
    }
  });

  it("Escape 取消新增，再次打开时清空未保存输入和校验状态", async () => {
    const user = userEvent.setup();
    render(<EditorHarness product={null} />);
    fireEvent.change(screen.getByLabelText("报关名称 *"), {
      target: { value: "合成未保存商品" },
    });
    fireEvent.change(screen.getByLabelText("规格"), {
      target: { value: "未保存规格" },
    });
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "重新打开" }));

    expect(screen.getByLabelText("报关名称 *")).toHaveValue("");
    expect(screen.getByLabelText("规格")).toHaveValue("");
    expect(screen.queryByText("请输入报关名称")).not.toBeInTheDocument();
  });

  it("从编辑切换到新增，再切换另一商品，不带入上一份输入", () => {
    const props = { open: true, onOpenChange: vi.fn(), onSubmit: vi.fn() };
    const { rerender } = render(
      <ProductDialog {...props} product={savedProduct} />,
    );
    fireEvent.change(screen.getByLabelText("规格"), {
      target: { value: "取消的规格" },
    });

    rerender(<ProductDialog {...props} product={null} />);
    expect(screen.getByLabelText("报关名称 *")).toHaveValue("");
    expect(screen.getByLabelText("规格")).toHaveValue("");
    expect(screen.getByLabelText("HS编码")).toHaveValue("");

    rerender(
      <ProductDialog
        {...props}
        product={{
          ...savedProduct,
          id: "qa-product-2",
          specification: "另一商品规格",
        }}
      />,
    );
    expect(screen.getByLabelText("规格")).toHaveValue("另一商品规格");
  });

  it.each(["resolve", "reject"] as const)(
    "关闭重开后忽略上次手动匹配的迟到 %s",
    async (outcome) => {
      const pending = deferred<{ data: (typeof firstMatch)[] }>();
      mockSearch.mockReturnValue(pending.promise);
      const user = userEvent.setup();
      render(<EditorHarness />);
      fireEvent.change(screen.getByLabelText("报关名称 *"), {
        target: { value: "合成瓷砖" },
      });
      await user.click(screen.getByRole("button", { name: "HSCode 智能匹配" }));
      expect(mockSearch).toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "关闭" }));
      await user.click(screen.getByRole("button", { name: "重新打开" }));
      await act(async () => {
        if (outcome === "resolve") pending.resolve({ data: [firstMatch] });
        else pending.reject(new Error("synthetic lookup failure"));
      });

      expect(
        screen.queryByRole("button", { name: /合成瓷砖.*69072190/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("HSCode 建议加载失败，请稍后重试"),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText("报关名称 *")).toHaveValue("甲");
    },
  );

  it("关闭重开同一商品后，迟到的 HS 详情不会修改已保存编码和单位", async () => {
    const pending = deferred<{ data: typeof firstMatch }>();
    mockSearch.mockResolvedValue({ data: [firstMatch] });
    mockGetByCode.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<EditorHarness />);
    fireEvent.change(screen.getByLabelText("报关名称 *"), {
      target: { value: "合成瓷砖" },
    });
    // Settle automatic suggestions before testing detail selection order. Mixing
    // a manual lookup here would leave a separate debounced search in flight.
    const recommendation = await screen.findByRole(
      "button",
      { name: /合成瓷砖.*69072190/ },
      { timeout: 5000 },
    );
    fireEvent.click(recommendation);
    expect(mockGetByCode).toHaveBeenCalledWith("69072190");
    await user.click(screen.getByRole("button", { name: "关闭" }));
    await user.click(screen.getByRole("button", { name: "重新打开" }));
    await act(async () => pending.resolve({ data: firstMatch }));

    expect(screen.getByLabelText("HS编码")).toHaveValue("11111111");
    expect(screen.getByLabelText("单位")).toHaveValue("件");
    expect(
      screen.queryByText("已匹配 HSCode 69072190"),
    ).not.toBeInTheDocument();
  });

  it("输入新名称后，旧手动匹配不能覆盖新的自动建议", async () => {
    const pending = deferred<{ data: (typeof firstMatch)[] }>();
    mockSearch.mockImplementation((keyword: string) =>
      keyword === "合成瓷砖"
        ? pending.promise
        : Promise.resolve({ data: [secondMatch] }),
    );
    const user = userEvent.setup();
    render(<EditorHarness />);
    fireEvent.change(screen.getByLabelText("报关名称 *"), {
      target: { value: "合成瓷砖" },
    });
    await user.click(screen.getByRole("button", { name: "HSCode 智能匹配" }));
    fireEvent.change(screen.getByLabelText("报关名称 *"), {
      target: { value: "合成玻璃" },
    });
    await screen.findByRole("button", { name: /合成玻璃.*69072290/ });
    await act(async () => pending.resolve({ data: [firstMatch] }));

    expect(
      screen.getByRole("button", { name: /合成玻璃.*69072290/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /合成瓷砖.*69072190/ }),
    ).not.toBeInTheDocument();
  });

  it("连续选不同 HS 建议时，后选编码优先于迟到的旧详情", async () => {
    const older = deferred<{ data: typeof firstMatch }>();
    const newer = deferred<{ data: typeof secondMatch }>();
    mockSearch.mockResolvedValue({ data: [firstMatch, secondMatch] });
    mockGetByCode.mockImplementation((code: string) =>
      code === firstMatch.hsCode ? older.promise : newer.promise,
    );
    render(<EditorHarness />);
    fireEvent.change(screen.getByLabelText("报关名称 *"), {
      target: { value: "合成商品" },
    });
    // Settle automatic suggestions before testing detail selection order. Mixing
    // a manual lookup here would leave a separate debounced search in flight.
    const recommendation = await screen.findByRole(
      "button",
      { name: /合成瓷砖.*69072190/ },
      { timeout: 5000 },
    );
    fireEvent.click(recommendation);
    fireEvent.click(screen.getByRole("button", { name: /合成玻璃.*69072290/ }));
    await act(async () => newer.resolve({ data: secondMatch }));
    await waitFor(() =>
      expect(screen.getByLabelText("HS编码")).toHaveValue(secondMatch.hsCode),
    );
    await act(async () => older.resolve({ data: firstMatch }));

    expect(screen.getByLabelText("HS编码")).toHaveValue(secondMatch.hsCode);
    expect(
      screen.getByText(`已匹配 HSCode ${secondMatch.hsCode}`),
    ).toBeInTheDocument();
  });

  it("手动匹配后的防抖到期不隐藏已有建议或清除刚选择的编码提示", async () => {
    vi.useFakeTimers();
    try {
      const retry = deferred<{ data: (typeof firstMatch)[] }>();
      mockSearch
        .mockResolvedValueOnce({ data: [firstMatch] })
        .mockReturnValue(retry.promise);
      render(<EditorHarness />);
      fireEvent.change(screen.getByLabelText("报关名称 *"), {
        target: { value: "合成瓷砖" },
      });
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "HSCode 智能匹配" }),
        );
      });
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: /合成瓷砖.*69072190/ }),
        );
      });
      await act(async () => vi.advanceTimersByTimeAsync(350));

      expect(
        screen.getByRole("button", { name: /合成瓷砖.*69072190/ }),
      ).toBeInTheDocument();
      expect(screen.getByText("已匹配 HSCode 69072190")).toBeInTheDocument();
      expect(mockSearch).toHaveBeenCalledTimes(1);

      // A second explicit match remains a real retry rather than a cached no-op.
      fireEvent.click(screen.getByRole("button", { name: "HSCode 智能匹配" }));
      expect(mockSearch).toHaveBeenCalledTimes(2);
      await act(async () => retry.resolve({ data: [firstMatch] }));
      expect(
        screen.getByRole("button", { name: /合成瓷砖.*69072190/ }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("同名手动匹配失败后不会在防抖到期时自动重试，但允许显式重试", async () => {
    vi.useFakeTimers();
    try {
      mockSearch
        .mockRejectedValueOnce(new Error("synthetic lookup failure"))
        .mockResolvedValue({ data: [firstMatch] });
      render(<EditorHarness />);
      fireEvent.change(screen.getByLabelText("报关名称 *"), {
        target: { value: "合成瓷砖" },
      });
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "HSCode 智能匹配" }),
        );
      });
      await act(async () => vi.advanceTimersByTimeAsync(350));

      expect(
        screen.getByText("HSCode 建议加载失败，请稍后重试"),
      ).toBeInTheDocument();
      expect(mockSearch).toHaveBeenCalledTimes(1);
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "HSCode 智能匹配" }),
        );
      });
      expect(mockSearch).toHaveBeenCalledTimes(2);
      expect(
        screen.getByRole("button", { name: /合成瓷砖.*69072190/ }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("改名自动匹配和 A→B→A 返回不会复用旧名称的去重标记", async () => {
    vi.useFakeTimers();
    try {
      mockSearch.mockImplementation((keyword: string) =>
        Promise.resolve({
          data: [keyword === "合成瓷砖" ? firstMatch : secondMatch],
        }),
      );
      render(<EditorHarness />);
      const name = screen.getByLabelText("报关名称 *");
      fireEvent.change(name, { target: { value: "合成瓷砖" } });
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "HSCode 智能匹配" }),
        );
      });
      await act(async () => vi.advanceTimersByTimeAsync(350));
      expect(mockSearch).toHaveBeenCalledTimes(1);

      fireEvent.change(name, { target: { value: "合成玻璃" } });
      await act(async () => vi.advanceTimersByTimeAsync(350));
      expect(
        screen.getByRole("button", { name: /合成玻璃.*69072290/ }),
      ).toBeInTheDocument();
      fireEvent.change(name, { target: { value: "合成瓷砖" } });
      await act(async () => vi.advanceTimersByTimeAsync(350));
      expect(mockSearch.mock.calls.map(([keyword]) => keyword)).toEqual([
        "合成瓷砖",
        "合成玻璃",
        "合成瓷砖",
      ]);

      // Return to the stable name before B's debounce expires; it is still a new
      // name generation and must not leave the recommendations permanently blank.
      fireEvent.change(name, { target: { value: "合成玻璃" } });
      fireEvent.change(name, { target: { value: "合成瓷砖" } });
      await act(async () => vi.advanceTimersByTimeAsync(350));
      expect(mockSearch).toHaveBeenCalledTimes(4);
      expect(mockSearch).toHaveBeenLastCalledWith("合成瓷砖");
      expect(
        screen.getByRole("button", { name: /合成瓷砖.*69072190/ }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
