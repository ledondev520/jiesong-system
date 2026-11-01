/** 收款池：待分配款项展示、自动匹配、记录到账、分配的成功/失败路径（评审 R1-10，移植自旧收付款页）。 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnallocatedReceiptsPanel } from "./UnallocatedReceiptsPanel";

const mocks = vi.hoisted(() => ({
  getUnallocatedPayments: vi.fn(),
  autoMatchUnallocatedPayments: vi.fn(),
  createPayment: vi.fn(),
  allocatePayment: vi.fn(),
}));
const toasts = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  message: vi.fn(),
}));
const dialogs = vi.hoisted(() => ({
  receipt: vi.fn(),
  allocate: vi.fn(),
}));
vi.mock("@/services/finance.service", () => ({ financeService: mocks }));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/api-cache", () => ({ invalidateCache: vi.fn() }));
vi.mock("@/lib/hooks/useBusinessReadOnly", () => ({
  useBusinessReadOnly: () => false,
  BusinessWrite: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./ReceiptDialog", () => ({
  ReceiptDialog: (props: { open: boolean }) => {
    dialogs.receipt(props);
    return props.open ? <div role="dialog" aria-label="记录到账" /> : null;
  },
}));
vi.mock("./AllocateDialog", () => ({
  AllocateDialog: (props: { open: boolean }) => {
    dialogs.allocate(props);
    return props.open ? <div role="dialog" aria-label="分配" /> : null;
  },
}));

const receipt = {
  id: "receipt-1",
  type: "RECEIVABLE_RECEIPT",
  amount: 33000,
  allocatedAmount: 30000,
  remainingAmount: 3000,
  customerName: "合成客户",
  currency: "USD",
  paymentDate: "2026-03-20T00:00:00.000Z",
  note: "客户整笔回款",
};
const last = <T,>(spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.at(-1)![0] as T;
type ReceiptProps = {
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
};
type AllocateProps = {
  onSubmit: (
    id: string,
    allocations: { salesContractId: string; amount: number }[],
  ) => Promise<void>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUnallocatedPayments.mockResolvedValue({ data: [receipt] });
});

describe("UnallocatedReceiptsPanel", () => {
  it("shows each pending receipt with its customer and remaining amount", async () => {
    render(<UnallocatedReceiptsPanel onChanged={vi.fn()} />);
    expect(await screen.findByText("合成客户")).toBeInTheDocument();
    expect(screen.getByText(/剩余待分配 USD 3,000/)).toBeInTheDocument();
    expect(screen.getByText(/待分配款项（1 笔）/)).toBeInTheDocument();
  });

  it("a failed pool read is reported and retry reloads it", async () => {
    mocks.getUnallocatedPayments.mockRejectedValueOnce(new Error("down"));
    render(<UnallocatedReceiptsPanel onChanged={vi.fn()} />);
    expect(await screen.findByText(/收款池读取失败/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("合成客户")).toBeInTheDocument();
    expect(screen.queryByText(/收款池读取失败/)).toBeNull();
  });

  it("auto-match calls the API, reloads the pool and asks the list to refresh", async () => {
    mocks.autoMatchUnallocatedPayments.mockResolvedValue({
      data: { matchedCount: 1, skippedCount: 0 },
    });
    const onChanged = vi.fn();
    render(<UnallocatedReceiptsPanel onChanged={onChanged} />);
    await userEvent.click(
      await screen.findByRole("button", { name: /自动匹配/ }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mocks.autoMatchUnallocatedPayments).toHaveBeenCalledTimes(1);
    expect(mocks.getUnallocatedPayments.mock.calls.length).toBeGreaterThan(1);
    expect(toasts.success).toHaveBeenCalled();
  });

  it("a failed auto-match reports the error and does not refresh", async () => {
    mocks.autoMatchUnallocatedPayments.mockRejectedValue(new Error("down"));
    const onChanged = vi.fn();
    render(<UnallocatedReceiptsPanel onChanged={onChanged} />);
    await userEvent.click(
      await screen.findByRole("button", { name: /自动匹配/ }),
    );
    await waitFor(() => expect(toasts.error).toHaveBeenCalled());
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /自动匹配/ })).toBeEnabled();
  });

  describe("record receipt", () => {
    const data = {
      customerName: "合成客户",
      amount: 500,
      currency: "USD",
      paymentMethod: "wire",
      paymentDate: new Date("2026-10-01"),
      contractRef: "EXP1",
      note: "备注",
    };
    const open = async () => {
      render(<UnallocatedReceiptsPanel onChanged={vi.fn()} />);
      await userEvent.click(
        await screen.findByRole("button", { name: /记录到账/ }),
      );
      return last<ReceiptProps>(dialogs.receipt);
    };

    it("saves a receipt without a contract and reloads the pool", async () => {
      mocks.createPayment.mockResolvedValue({});
      const props = await open();
      const loads = mocks.getUnallocatedPayments.mock.calls.length;
      await act(async () => props.onSubmit(data));
      expect(mocks.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "RECEIVABLE_RECEIPT",
          customerName: "合成客户",
          amount: 500,
          currency: "USD",
          paymentMethod: "wire",
          paymentDate: "2026-10-01T00:00:00.000Z",
        }),
      );
      expect(mocks.createPayment.mock.calls[0][0]).not.toHaveProperty(
        "salesContractId",
      );
      expect(toasts.success).toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).toBeNull();
      await waitFor(() =>
        expect(mocks.getUnallocatedPayments.mock.calls.length).toBe(loads + 1),
      );
    });

    it("a failed save keeps the dialog open, reports it and does not reload", async () => {
      mocks.createPayment.mockRejectedValue(new Error("boom"));
      const props = await open();
      const loads = mocks.getUnallocatedPayments.mock.calls.length;
      await act(async () => props.onSubmit(data));
      expect(toasts.error).toHaveBeenCalled();
      expect(toasts.success).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "记录到账" })).toBeVisible();
      expect(mocks.getUnallocatedPayments.mock.calls.length).toBe(loads);
    });
  });

  describe("allocate", () => {
    const allocations = [{ salesContractId: "sc-1", amount: 3000 }];
    const open = async (onChanged = vi.fn()) => {
      render(<UnallocatedReceiptsPanel onChanged={onChanged} />);
      await userEvent.click(
        await screen.findByRole("button", { name: /分配/ }),
      );
      return last<AllocateProps>(dialogs.allocate);
    };

    it("sends the allocations, closes the dialog and refreshes pool and list", async () => {
      mocks.allocatePayment.mockResolvedValue({});
      const onChanged = vi.fn();
      const props = await open(onChanged);
      await act(async () => props.onSubmit("receipt-1", allocations));
      expect(mocks.allocatePayment).toHaveBeenCalledWith(
        "receipt-1",
        allocations,
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it("a failed allocation keeps the dialog open and does not refresh", async () => {
      mocks.allocatePayment.mockRejectedValue(new Error("boom"));
      const onChanged = vi.fn();
      const props = await open(onChanged);
      await act(async () => props.onSubmit("receipt-1", allocations));
      expect(toasts.error).toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "分配" })).toBeVisible();
      expect(onChanged).not.toHaveBeenCalled();
    });
  });
});
