import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AllocateDialog } from "./AllocateDialog";
import type { Payment } from "@/types";
const getReceivables = vi.fn();
vi.mock("@/services/finance.service", () => ({
  financeService: {
    getReceivables: (...args: unknown[]) => getReceivables(...args),
  },
}));
it("打开分配时初始化并加载全部分页，不受收付当前列表页限制", async () => {
  getReceivables.mockImplementation(async ({ page }: { page: number }) => ({
    data: {
      items: [
        {
          id: `contract-${page}`,
          contractNo: `EXP-PAGE-${page}`,
          totalAmount: 100,
          receivedAmount: 0,
          unreceiveAmount: 100,
        },
      ],
      pagination: { totalPages: 2 },
    },
  }));
  render(
    <AllocateDialog
      open
      onOpenChange={() => {}}
      payment={{ id: "synthetic", amount: 100, currency: "USD" } as Payment}
      onSubmit={vi.fn()}
    />,
  );
  await screen.findByText("EXP-PAGE-2");
  await waitFor(() =>
    expect(getReceivables).toHaveBeenCalledWith({
      page: 2,
      pageSize: 100,
      outstandingOnly: true,
    }),
  );
  expect(screen.getByText("EXP-PAGE-1")).toBeInTheDocument();
});

const rowsOf = (
  items: Array<{ id: string; contractNo: string; unreceiveAmount: number }>,
) =>
  getReceivables.mockImplementation(async () => ({
    data: {
      items: items.map((i) => ({
        ...i,
        totalAmount: i.unreceiveAmount,
        receivedAmount: 0,
      })),
      pagination: { totalPages: 1 },
    },
  }));
const open = (onSubmit = vi.fn(), amount = 100) =>
  render(
    <AllocateDialog
      open
      onOpenChange={() => {}}
      payment={{ id: "p", amount, currency: "USD" } as Payment}
      onSubmit={onSubmit}
    />,
  );
it("自动填入可重复点击，结果不变，且不超过合同待收", async () => {
  rowsOf([{ id: "c1", contractNo: "EXP-A", unreceiveAmount: 60 }]);
  open();
  await screen.findByText("EXP-A");
  const input = screen.getByPlaceholderText("0.00") as HTMLInputElement;
  fireEvent.click(screen.getByText("自动"));
  expect(input.value).toBe("60.00");
  fireEvent.click(screen.getByText("自动"));
  expect(input.value).toBe("60.00");
});
it("单行金额超过待收时提示并禁止提交", async () => {
  rowsOf([{ id: "c1", contractNo: "EXP-A", unreceiveAmount: 60 }]);
  open();
  await screen.findByText("EXP-A");
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByPlaceholderText("0.00"), {
    target: { value: "70" },
  });
  expect(screen.getByText("超出该合同待收金额")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /确认分配/ })).toBeDisabled();
});
it("提交中同步防重：双击只提交一次", async () => {
  rowsOf([{ id: "c1", contractNo: "EXP-A", unreceiveAmount: 60 }]);
  let release: () => void = () => {};
  const onSubmit = vi.fn(
    () =>
      new Promise<void>((r) => {
        release = r;
      }),
  );
  open(onSubmit);
  await screen.findByText("EXP-A");
  fireEvent.click(screen.getByText("自动"));
  const btn = screen.getByRole("button", { name: /确认分配/ });
  fireEvent.click(btn);
  fireEvent.click(btn);
  expect(onSubmit).toHaveBeenCalledTimes(1);
  release();
});
