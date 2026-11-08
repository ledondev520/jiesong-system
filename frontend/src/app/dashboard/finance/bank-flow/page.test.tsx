import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi, beforeEach } from "vitest";
import BankFlowPage from "./page";
const transactions = vi.fn();
const stats = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/dashboard/finance/bank-flow",
}));
vi.mock("@/services/bankFlow.service", () => ({
  getTransactions: (...args: unknown[]) => transactions(...args),
  getTransactionStats: (...args: unknown[]) => stats(...args),
  getBatches: async () => [],
}));
vi.mock("./components/BankFlowImportDialog", () => ({
  BankFlowImportDialog: () => null,
}));
beforeEach(() => {
  transactions.mockReset();
  stats.mockReset();
  stats.mockResolvedValue({
    totalIn: 0,
    totalOut: 0,
    netFlow: 0,
    txnCount: 0,
    currency: "CNY",
  });
  transactions.mockResolvedValue({ items: [], pagination: { total: 21 } });
});
it("金额筛选进入列表和统计请求，下一页保持同条件", async () => {
  render(<BankFlowPage />);
  await waitFor(() => expect(transactions).toHaveBeenCalled());
  fireEvent.change(screen.getByPlaceholderText("最小金额"), {
    target: { value: "1000000" },
  });
  await waitFor(() =>
    expect(transactions).toHaveBeenLastCalledWith(
      expect.objectContaining({ amountMin: 1000000, currency: "CNY", page: 1 }),
    ),
  );
  expect(stats).toHaveBeenLastCalledWith(
    expect.objectContaining({ amountMin: 1000000, currency: "CNY" }),
  );
  fireEvent.click(
    screen
      .getAllByRole("button")
      .find((button) => button.querySelector(".lucide-chevron-right"))!,
  );
  await waitFor(() =>
    expect(transactions).toHaveBeenLastCalledWith(
      expect.objectContaining({ amountMin: 1000000, page: 2 }),
    ),
  );
});
it("请求失败有明确重试，不能当空流水", async () => {
  transactions.mockRejectedValueOnce(new Error("offline"));
  render(<BankFlowPage />);
  await screen.findByText("银行流水读取失败");
  expect(screen.queryByText("暂无数据")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("重试"));
  await waitFor(() => expect(transactions).toHaveBeenCalledTimes(2));
});
it("银行账户列只显示开户行与脱敏尾号；结汇和内部划转带标签，普通转账不带", async () => {
  const base = {
    batchId: "b",
    currency: "CNY",
    txnTime: "2026-01-01 10:00:00",
    txnDate: "2026-01-01",
    payer: null,
    payee: null,
    txnId: null,
    balance: null,
    matchedContractId: null,
    matchedContractType: null,
    matchScore: null,
    matchStatus: "PENDING",
    matchedAt: null,
  };
  transactions.mockResolvedValue({
    items: [
      {
        ...base,
        id: "1",
        amount: -100,
        direction: "OUT",
        counterpart: "甲",
        summary: "货款",
        txnType: "转账",
        bankName: "招商银行",
        accountNoMasked: "****0001",
      },
      {
        ...base,
        id: "2",
        amount: -200,
        direction: "OUT",
        counterpart: "乙",
        summary: "结汇",
        txnType: "对公结汇",
        bankName: null,
        accountNoMasked: null,
      },
      {
        ...base,
        id: "3",
        amount: 300,
        direction: "IN",
        counterpart: "丙",
        summary: "账户间划转",
        txnType: "转账",
        bankName: null,
        accountNoMasked: "****0002",
      },
    ],
    pagination: { total: 3 },
  });
  render(<BankFlowPage />);
  expect(await screen.findByText("招商银行 ****0001")).toBeInTheDocument();
  expect(screen.getByText("****0002")).toBeInTheDocument();
  expect(
    screen.getByRole("columnheader", { name: "账户" }),
  ).toBeInTheDocument();
  expect(screen.getAllByText("结汇").length).toBeGreaterThan(0);
  expect(screen.getAllByText("内部划转")).toHaveLength(1);
});
