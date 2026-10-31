import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi, beforeEach } from "vitest";
import ReconciliationPage from "./page";
const unmatched = vi.fn();
const contractsFor = vi.fn(async (..._args: unknown[]) => []);
const recon = vi.fn();
const emptyRecon = {
  matched: [],
  unmatchedPayments: [],
  unmatchedInvoices: [],
  summary: {
    matchedCount: 0,
    normalCount: 0,
    underInvoicedCount: 0,
    underInvoicedGap: 0,
    overInvoicedCount: 0,
    overInvoicedGap: 0,
    unmatchedPaymentCount: 0,
    unmatchedPaymentTotal: 0,
    unmatchedInvoiceCount: 0,
    unmatchedInvoiceTotal: 0,
  },
};
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/finance/reconciliation",
}));
vi.mock("@/services/bankFlow.service", () => ({
  getFullReconciliation: (...args: unknown[]) => recon(...args),
  getUnmatchedItems: (...args: unknown[]) => unmatched(...args),
  getContractsForMatch: (...args: unknown[]) => contractsFor(...args),
  postAutoMatch: async () => {},
  postManualMatch: async () => {},
  postIgnore: async () => {},
}));
beforeEach(() => {
  unmatched.mockReset();
  recon.mockReset();
  recon.mockResolvedValue(emptyRecon);
  unmatched.mockResolvedValue({
    bankItems: [],
    invoiceItems: [],
    bankTotal: 41,
    invoiceTotal: 25,
  });
});
it("历史未匹配记录可翻页，搜索由服务端检索并回第一页", async () => {
  render(<ReconciliationPage />);
  await waitFor(() =>
    expect(unmatched).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      search: undefined,
    }),
  );
  // 下一页 stays disabled until the mocked totals resolve into state; clicking earlier is a no-op (CI race).
  await waitFor(() =>
    expect(screen.getByText("下一页").closest("button")).toBeEnabled(),
  );
  fireEvent.click(screen.getByText("下一页"));
  await waitFor(() =>
    expect(unmatched).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
      search: undefined,
    }),
  );
  fireEvent.change(
    screen.getByPlaceholderText("搜索未匹配对手方、发票号或摘要"),
    { target: { value: "synthetic-invoice" } },
  );
  await waitFor(() =>
    expect(unmatched).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      search: "synthetic-invoice",
    }),
  );
});
it("汇总失败可重试，保留失败边界", async () => {
  recon.mockRejectedValueOnce(new Error("offline"));
  render(<ReconciliationPage />);
  await screen.findByText("对账数据读取失败");
  fireEvent.click(screen.getByText("重试"));
  await waitFor(() =>
    expect(screen.queryByText("对账数据读取失败")).not.toBeInTheDocument(),
  );
  expect(recon).toHaveBeenCalledTimes(2);
});
it("没有选中银行流水时，合同选择器按发票关联用途读取（含草稿采购合同的那一类）", async () => {
  render(<ReconciliationPage />);
  await waitFor(() =>
    expect(contractsFor).toHaveBeenCalledWith("PURCHASE", undefined, "INVOICE"),
  );
});
