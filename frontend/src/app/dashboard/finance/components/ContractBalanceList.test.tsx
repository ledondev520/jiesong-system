/** 应付/应收页签：顶部合计取后端统计（与财务概览同源），行内登记只对有余额的合同可用，加载失败可重试。 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContractBalanceList } from "./ContractBalanceList";

const dialog = vi.hoisted(() => vi.fn());
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const mocks = vi.hoisted(() => ({
  getPayables: vi.fn(),
  getReceivables: vi.fn(),
  getStats: vi.fn(),
  createPayment: vi.fn(),
}));
vi.mock("@/services/finance.service", () => ({ financeService: mocks }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("./PaymentDialog", () => ({
  PaymentDialog: (props: {
    contractNo: string;
    remainingAmount: number;
    currency: string;
  }) => {
    dialog(props);
    return (
      <div role="dialog" aria-label="登记">
        {props.contractNo}|{props.remainingAmount}|{props.currency}
      </div>
    );
  },
}));

const page = (items: unknown[]) => ({
  data: {
    items,
    pagination: { page: 1, pageSize: 20, total: items.length, totalPages: 1 },
  },
});
const stats = {
  payable: { total: 1000, paid: 400, unpaid: 600 },
  receivable: { total: 5000, received: 1000, unreceived: 4000 },
};

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  dialog.mockReset();
  toasts.success.mockReset();
  toasts.error.mockReset();
  mocks.getStats.mockResolvedValue(stats);
});

describe("应付页签", () => {
  it("合计来自统计接口，列表行展示未付；已结清的合同没有登记按钮", async () => {
    mocks.getPayables.mockResolvedValue(
      page([
        {
          id: "p1",
          contractNo: "CG2600001",
          status: "SIGNED",
          totalAmount: 1000,
          paidAmount: 400,
          unpaidAmount: 600,
          supplier: { id: "s", name: "合成供应商" },
        },
        {
          id: "p2",
          contractNo: "CG2600002",
          status: "COMPLETED",
          totalAmount: 100,
          paidAmount: 100,
          unpaidAmount: 0,
        },
      ]),
    );
    render(<ContractBalanceList kind="payable" />);
    expect(await screen.findByText("CG2600001")).toBeInTheDocument();
    expect(screen.getByTestId("open-total")).toHaveTextContent("¥600.00");
    expect(screen.getAllByRole("button", { name: "登记付款" })).toHaveLength(1);
    expect(mocks.getPayables).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20, outstandingOnly: true }),
    );
  });

  it("点击登记付款把合同余额和 CNY 交给付款对话框", async () => {
    const user = userEvent.setup();
    mocks.getPayables.mockResolvedValue(
      page([
        {
          id: "p1",
          contractNo: "CG2600001",
          status: "SIGNED",
          totalAmount: 1000,
          paidAmount: 400,
          unpaidAmount: 600,
        },
      ]),
    );
    render(<ContractBalanceList kind="payable" />);
    await user.click(await screen.findByRole("button", { name: "登记付款" }));
    expect(screen.getByRole("dialog", { name: "登记" })).toHaveTextContent(
      "CG2600001|600|CNY",
    );
  });

  it("加载失败显示错误并可重试", async () => {
    const user = userEvent.setup();
    mocks.getPayables.mockRejectedValueOnce({ message: "服务暂时不可用" });
    mocks.getPayables.mockResolvedValue(page([]));
    render(<ContractBalanceList kind="payable" />);
    expect(await screen.findByText(/服务暂时不可用/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /重试/ }));
    await waitFor(() => expect(mocks.getPayables).toHaveBeenCalledTimes(2));
  });
});

describe("应付页签 URL 筛选", () => {
  it("旧链接的 pastDelivery=true 重定向后仍带着该筛选", async () => {
    window.history.pushState(
      {},
      "",
      "/dashboard/finance/payable?pastDelivery=true",
    );
    mocks.getPayables.mockResolvedValue(page([]));
    render(<ContractBalanceList kind="payable" />);
    await waitFor(() =>
      expect(mocks.getPayables).toHaveBeenCalledWith(
        expect.objectContaining({ pastDelivery: true }),
      ),
    );
    window.history.pushState({}, "", "/");
  });
});

describe("应收页签", () => {
  it("用 USD 展示未收合计，逾期筛选使用 overdue 参数", async () => {
    const user = userEvent.setup();
    mocks.getReceivables.mockResolvedValue(
      page([
        {
          id: "o1",
          contractNo: "EXP260101",
          status: "SHIPPED",
          totalAmount: 5000,
          receivedAmount: 1000,
          unreceiveAmount: 4000,
          stores: ["Sacramento 店"],
        },
      ]),
    );
    render(<ContractBalanceList kind="receivable" />);
    expect(await screen.findByText("EXP260101")).toBeInTheDocument();
    expect(screen.getByTestId("open-total")).toHaveTextContent("$4,000.00");
    await user.click(screen.getByRole("button", { name: "已逾期" }));
    await waitFor(() =>
      expect(mocks.getReceivables).toHaveBeenLastCalledWith(
        expect.objectContaining({ overdue: true }),
      ),
    );
    expect(mocks.getPayables).not.toHaveBeenCalled();
  });
  it("切换筛选后，迟到的旧响应不覆盖当前结果（评审 R1-4）", async () => {
    const user = userEvent.setup();
    let resolveOld: (value: unknown) => void = () => {};
    const row = (contractNo: string) => ({
      id: contractNo,
      contractNo,
      status: "SHIPPED",
      totalAmount: 1,
      receivedAmount: 0,
      unreceiveAmount: 1,
    });
    mocks.getReceivables.mockImplementation((query: { overdue?: boolean }) =>
      query.overdue
        ? Promise.resolve(page([row("EXP-OVERDUE")]))
        : new Promise((resolve) => (resolveOld = resolve)),
    );
    render(<ContractBalanceList kind="receivable" />);
    await user.click(screen.getByRole("button", { name: "已逾期" }));
    expect(await screen.findByText("EXP-OVERDUE")).toBeInTheDocument();
    await act(async () => resolveOld(page([row("EXP-STALE")])));
    expect(screen.queryByText("EXP-STALE")).toBeNull();
    expect(screen.getByText("EXP-OVERDUE")).toBeInTheDocument();
  });
});

describe.each([
  {
    kind: "payable" as const,
    list: "getPayables" as const,
    button: "登记付款",
    type: "PAYABLE",
    idField: "purchaseContractId",
    currency: "CNY",
  },
  {
    kind: "receivable" as const,
    list: "getReceivables" as const,
    button: "登记收款",
    type: "RECEIVABLE",
    idField: "salesContractId",
    currency: "USD",
  },
])("$kind 保存（评审 R1-10，移植自旧收付款页）", (c) => {
  const row = {
    id: "synthetic",
    contractNo: "SYNTHETIC",
    status: "SIGNED",
    totalAmount: 100,
    paidAmount: 0,
    unpaidAmount: 100,
    receivedAmount: 0,
    unreceiveAmount: 100,
  };
  const data = {
    amount: "22.6",
    paymentDate: new Date("2026-10-01"),
    paymentMethod: "other",
    note: "合成中文备注",
  };
  const openDialog = async () => {
    mocks[c.list].mockResolvedValue(page([row]));
    render(<ContractBalanceList kind={c.kind} />);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: c.button }));
    return dialog.mock.calls.at(-1)![0] as {
      onSubmit: (value: typeof data) => Promise<void>;
    };
  };

  it("保存失败：拒绝回调，弹窗和所选合同保留，不刷新、不报成功", async () => {
    const props = await openDialog();
    mocks.createPayment.mockRejectedValue({ message: "合成保存失败" });
    const loads = mocks[c.list].mock.calls.length;
    await expect(props.onSubmit(data)).rejects.toEqual({
      message: "合成保存失败",
    });
    expect(mocks.createPayment).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: c.type,
        [c.idField]: "synthetic",
        amount: 22.6,
        currency: c.currency,
        paymentMethod: "other",
        paymentDate: "2026-10-01T00:00:00.000Z",
        note: "合成中文备注",
      }),
    );
    expect(screen.getByRole("dialog", { name: "登记" })).toBeInTheDocument();
    expect(toasts.success).not.toHaveBeenCalled();
    expect(mocks[c.list].mock.calls.length).toBe(loads);
  });

  it("保存成功：关闭弹窗并重新读取列表和统计", async () => {
    const props = await openDialog();
    mocks.createPayment.mockResolvedValue({});
    const loads = mocks[c.list].mock.calls.length;
    const statLoads = mocks.getStats.mock.calls.length;
    await act(async () => props.onSubmit(data));
    expect(toasts.success).toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "登记" })).toBeNull();
    expect(mocks[c.list].mock.calls.length).toBe(loads + 1);
    expect(mocks.getStats.mock.calls.length).toBe(statLoads + 1);
  });
});
