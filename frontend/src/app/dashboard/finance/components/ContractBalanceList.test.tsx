/** 应付/应收页签：顶部合计取后端统计（与财务概览同源），行内登记只对有余额的合同可用，加载失败可重试。 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContractBalanceList } from "./ContractBalanceList";

const mocks = vi.hoisted(() => ({ getPayables: vi.fn(), getReceivables: vi.fn(), getStats: vi.fn(), createPayment: vi.fn() }));
vi.mock("@/services/finance.service", () => ({ financeService: mocks }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./PaymentDialog", () => ({
  PaymentDialog: ({ contractNo, remainingAmount, currency }: { contractNo: string; remainingAmount: number; currency: string }) => (
    <div role="dialog" aria-label="登记">{contractNo}|{remainingAmount}|{currency}</div>
  ),
}));

const page = (items: unknown[]) => ({ data: { items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: 1 } } });
const stats = { payable: { total: 1000, paid: 400, unpaid: 600 }, receivable: { total: 5000, received: 1000, unreceived: 4000 } };

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.getStats.mockResolvedValue(stats);
});

describe("应付页签", () => {
  it("合计来自统计接口，列表行展示未付；已结清的合同没有登记按钮", async () => {
    mocks.getPayables.mockResolvedValue(page([
      { id: "p1", contractNo: "CG2600001", status: "SIGNED", totalAmount: 1000, paidAmount: 400, unpaidAmount: 600, supplier: { id: "s", name: "合成供应商" } },
      { id: "p2", contractNo: "CG2600002", status: "COMPLETED", totalAmount: 100, paidAmount: 100, unpaidAmount: 0 },
    ]));
    render(<ContractBalanceList kind="payable" />);
    expect(await screen.findByText("CG2600001")).toBeInTheDocument();
    expect(screen.getByTestId("open-total")).toHaveTextContent("¥600.00");
    expect(screen.getAllByRole("button", { name: "登记付款" })).toHaveLength(1);
    expect(mocks.getPayables).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20, outstandingOnly: true }));
  });

  it("点击登记付款把合同余额和 CNY 交给付款对话框", async () => {
    const user = userEvent.setup();
    mocks.getPayables.mockResolvedValue(page([{ id: "p1", contractNo: "CG2600001", status: "SIGNED", totalAmount: 1000, paidAmount: 400, unpaidAmount: 600 }]));
    render(<ContractBalanceList kind="payable" />);
    await user.click(await screen.findByRole("button", { name: "登记付款" }));
    expect(screen.getByRole("dialog", { name: "登记" })).toHaveTextContent("CG2600001|600|CNY");
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

describe("应收页签", () => {
  it("用 USD 展示未收合计，逾期筛选使用 overdue 参数", async () => {
    const user = userEvent.setup();
    mocks.getReceivables.mockResolvedValue(page([
      { id: "o1", contractNo: "EXP260101", status: "SHIPPED", totalAmount: 5000, receivedAmount: 1000, unreceiveAmount: 4000, stores: ["Sacramento 店"] },
    ]));
    render(<ContractBalanceList kind="receivable" />);
    expect(await screen.findByText("EXP260101")).toBeInTheDocument();
    expect(screen.getByTestId("open-total")).toHaveTextContent("$4,000.00");
    await user.click(screen.getByRole("button", { name: "已逾期" }));
    await waitFor(() => expect(mocks.getReceivables).toHaveBeenLastCalledWith(expect.objectContaining({ overdue: true })));
    expect(mocks.getPayables).not.toHaveBeenCalled();
  });
});
