import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth.store";
import BankFlowPage from "./page";

const batch = {
  id: "batch-1",
  type: "BANK_FLOW",
  fileName: "synthetic-bank-statement.xlsx",
  recordCount: 3,
  dataStartDate: "2026-01-01",
  dataEndDate: "2026-01-31",
  note: null,
  importedAt: "2026-02-01T00:00:00Z",
  _count: { bankTransactions: 3, invoiceRecords: 0 },
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/dashboard/finance/bank-flow",
}));
vi.mock("@/services/bankFlow.service", () => ({
  getTransactions: async () => ({ items: [], pagination: { total: 0 } }),
  getTransactionStats: async () => ({
    totalIn: 0,
    totalOut: 0,
    netFlow: 0,
    txnCount: 0,
    currency: "CNY",
  }),
  getBatches: async () => [batch],
}));
vi.mock("./components/BankFlowImportDialog", () => ({
  BankFlowImportDialog: () => null,
}));

// 来源文件名属 Confidential 财务资料 (B46)
describe("bank flow import batch strip", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["ADMIN", "FINANCE"])("%s 可见来源文件名", async (role) => {
    useAuthStore.setState({ user: { id: "u", role } as never });
    render(<BankFlowPage />);
    expect(
      await screen.findByText("synthetic-bank-statement.xlsx"),
    ).toBeInTheDocument();
  });

  it.each(["BOSS", "SALES"])("%s 只看到批次序号，不见文件名", async (role) => {
    useAuthStore.setState({ user: { id: "u", role } as never });
    render(<BankFlowPage />);
    expect(await screen.findByText("第1批")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText("synthetic-bank-statement.xlsx"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/数据来源/)).not.toBeInTheDocument();
  });
});
