import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi, beforeEach } from "vitest";
import InvoicesPage from "./page";
const invoices = vi.fn();
const stats = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/dashboard/finance/invoices",
}));
vi.mock("@/services/bankFlow.service", () => ({
  getInvoices: (...args: unknown[]) => invoices(...args),
  getInvoiceStats: (...args: unknown[]) => stats(...args),
  getBatches: async () => [],
}));
vi.mock("./components/InvoiceImportDialog", () => ({
  InvoiceImportDialog: () => null,
}));
beforeEach(() => {
  invoices.mockReset();
  stats.mockReset();
  stats.mockResolvedValue({
    validTotal: 0,
    validTax: 0,
    validAmount: 0,
    validCount: 0,
    reversedCount: 0,
    totalCount: 0,
  });
});
it("相似发票可通过完整号码区分，手机和表格均可识别", async () => {
  invoices.mockResolvedValue({
    items: [
      {
        id: "test",
        invNo: "TEST-INV-123",
        seller: "测试",
        invDate: "2026-01-01",
        amount: 1,
        tax: 0,
        total: 1,
        status: "正常",
        isPositive: "是",
      },
    ],
    pagination: { total: 1 },
  });
  render(<InvoicesPage />);
  expect(await screen.findAllByText("TEST-INV-123")).toHaveLength(2);
});
it("加载失败重试并恢复真实空态", async () => {
  invoices
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ items: [], pagination: { total: 0 } });
  render(<InvoicesPage />);
  await screen.findByText("发票台账读取失败");
  expect(screen.queryByText("暂无数据")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("重试"));
  await waitFor(() => expect(screen.getAllByText("暂无数据")).toHaveLength(2));
});

it("KPI 显示负数发票张数，使有效+已红冲+负数=总数", async () => {
  stats.mockResolvedValue({
    validTotal: 1,
    validTax: 0,
    validAmount: 1,
    validCount: 200,
    reversedCount: 19,
    totalCount: 300,
  });
  invoices.mockResolvedValue({ items: [], pagination: { total: 0 } });
  render(<InvoicesPage />);
  expect(await screen.findByTestId("negative-count")).toHaveTextContent("81");
  expect(
    screen.getByText(/有效 200 \+ 已红冲 19 \+ 负数及其他 = 共 300/),
  ).toBeInTheDocument();
});
it("每页条数可选 20/50/100，切换后回到第一页并按新条数请求；销方筛选与流水链接是两个独立控件", async () => {
  invoices.mockResolvedValue({
    items: [
      {
        id: "a",
        invNo: "N1",
        seller: "合成销方",
        invDate: "2026-01-01",
        amount: 1,
        tax: 0,
        total: 1,
        status: "正常",
        isPositive: "是",
      },
    ],
    pagination: { total: 1 },
  });
  render(<InvoicesPage />);
  await screen.findAllByText("N1");
  expect(invoices).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 1, pageSize: 20 }),
  );
  const user = userEvent.setup();
  await user.click(screen.getAllByRole("combobox")[1]);
  await user.click(screen.getByRole("option", { name: "每页 50 条" }));
  await waitFor(() =>
    expect(invoices).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, pageSize: 50 }),
    ),
  );
  const link = screen
    .getAllByRole("link", { name: /流水/ })
    .find((a) => a.getAttribute("href")?.includes("bank-flow"));
  expect(link).toHaveAttribute(
    "href",
    "/dashboard/finance/bank-flow?search=" + encodeURIComponent("合成销方"),
  );
  expect(screen.getByTitle('筛选"合成销方"')).not.toContainElement(link!);
});
