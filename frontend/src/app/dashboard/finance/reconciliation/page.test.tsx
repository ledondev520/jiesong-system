import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi, beforeEach } from "vitest";
import ReconciliationPage from "./page";
const unmatched = vi.fn();
const contractsFor = vi.fn(async (..._args: unknown[]) => []);
const recon = vi.fn();
const autoMatch = vi.fn(async (..._args: unknown[]) => {});
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
  postAutoMatch: (...args: unknown[]) => autoMatch(...args),
  postManualMatch: async () => {},
  postIgnore: async () => {},
}));
beforeEach(() => {
  autoMatch.mockClear();
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
it("已匹配供应商上百行时按页显示，翻页和搜索都按筛选结果分页", async () => {
  const matched = Array.from({ length: 120 }, (_, i) => ({
    payName: `供应商${String(i).padStart(3, "0")}`,
    invName: `供应商${String(i).padStart(3, "0")}`,
    netPaid: 100,
    totalInvoice: 100,
    gap: 0,
    category: "normal",
  }));
  recon.mockResolvedValue({ ...emptyRecon, matched });
  render(<ReconciliationPage />);
  expect(await screen.findByText("供应商000")).toBeInTheDocument();
  expect(screen.getByText("供应商019")).toBeInTheDocument();
  expect(screen.queryByText("供应商020")).toBeNull();
  expect(screen.getByText(/共 120 条，第 1\/6 页/)).toBeInTheDocument();
  const next = screen.getAllByRole("button", { name: "下一页" }).at(-1)!;
  fireEvent.click(next);
  expect(await screen.findByText("供应商020")).toBeInTheDocument();
  expect(screen.queryByText("供应商000")).toBeNull();
  fireEvent.change(screen.getByPlaceholderText("搜索供应商名称"), {
    target: { value: "供应商11" },
  });
  expect(await screen.findByText("供应商110")).toBeInTheDocument();
  expect(screen.queryByText(/共 120 条/)).toBeNull();
});

const withSummary = (matchedCount: number, unmatchedPaymentCount: number) => ({
  ...emptyRecon,
  summary: { ...emptyRecon.summary, matchedCount, unmatchedPaymentCount },
});
it("匹配率低于 50% 时显示琥珀提示和计数；达到 50% 不提示", async () => {
  recon.mockResolvedValue(withSummary(4, 6));
  const { unmount } = render(<ReconciliationPage />);
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("付款对方共 10 家，仅 4 家已匹配到发票（40%");
  unmount();
  recon.mockResolvedValue(withSummary(5, 5));
  render(<ReconciliationPage />);
  await screen.findByText("已匹配供应商");
  expect(screen.queryByRole("alert")).toBeNull();
});
it("三张表是三个页签，各自带分页器，一次只显示一张", async () => {
  const unpaid = Array.from({ length: 45 }, (_, i) => ({
    counterpart: `付款对方${String(i).padStart(2, "0")}`,
    netPaid: 10,
    txnCount: 1,
  }));
  recon.mockResolvedValue({ ...emptyRecon, unmatchedPayments: unpaid });
  render(<ReconciliationPage />);
  const matchedTab = await screen.findByRole("tab", { name: /供应商汇总/ });
  expect(matchedTab).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByText("付款对方00")).toBeNull();
  fireEvent.mouseDown(screen.getByRole("tab", { name: /无票付款 \(45\)/ }));
  fireEvent.click(screen.getByRole("tab", { name: /无票付款 \(45\)/ }));
  expect(await screen.findByText("付款对方00")).toBeInTheDocument();
  expect(screen.queryByText("付款对方20")).toBeNull();
  expect(screen.getByText(/共 45 条，第 1\/3 页/)).toBeInTheDocument();
});
it("差额符号图例与净付款定义说明显示在供应商汇总上", async () => {
  recon.mockResolvedValue(withSummary(1, 0));
  render(<ReconciliationPage />);
  expect(await screen.findByText(/净付款 = 付款流水合计/)).toBeInTheDocument();
  expect(screen.getByText("差额为正：缺票")).toBeInTheDocument();
  expect(screen.getByText("差额为负：多开")).toBeInTheDocument();
});
it("标题「对账中心」在筛选栏之前；自动匹配先确认范围，取消不调用", async () => {
  render(<ReconciliationPage />);
  const title = await screen.findByRole("heading", { name: "对账中心" });
  const search = screen.getByPlaceholderText("搜索未匹配对手方、发票号或摘要");
  expect(
    title.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /自动匹配/ }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent("未匹配的银行流水 41 条、发票 25 张");
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(autoMatch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /自动匹配/ }));
  fireEvent.click(await screen.findByRole("button", { name: "开始自动匹配" }));
  await waitFor(() => expect(autoMatch).toHaveBeenCalledTimes(1));
});
