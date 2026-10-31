/**
 * Input: real quote detail component with mocked service/auth
 * Output: the quote → order flow (客户已接受 → 转为出口订单 → order page), one primary button per status, role gating, export/print/copy
 * Pos: quote detail interaction test (frontend acceptance for quote → order)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QuoteDetailPageContent } from "./QuoteDetailPageContent";

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn() },
  role: "SALES",
  getById: vi.fn(),
  transition: vi.fn(),
  create: vi.fn(),
  downloadXlsx: vi.fn(),
  openPrintView: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/store/auth.store", () => ({
  useAuthStore: (selector: (s: { user: { role: string } }) => unknown) =>
    selector({ user: { role: mocks.role } }),
}));
vi.mock("@/services/quote.service", () => ({
  quoteService: {
    getById: mocks.getById,
    transition: mocks.transition,
    create: mocks.create,
    downloadXlsx: mocks.downloadXlsx,
    openPrintView: mocks.openPrintView,
    update: vi.fn(),
  },
}));
vi.mock("./QuoteEditor", () => ({
  QuoteEditor: () => <div data-testid="editor" />,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const item = {
  id: "i1",
  productId: "p1",
  storeId: "s1",
  quantity: 10,
  unit: "PCS",
  costCny: null,
  unitPrice: 1995,
  isManualPrice: true,
  totalPrice: 19950,
  product: { id: "p1", customsName: "Synthetic good" },
  store: { id: "s1", name: "Store A", code: "SAC" },
};
const quote = (status: string, extra = {}) => ({
  id: "q1",
  quoteNo: "QT2610-001",
  status,
  currency: "USD",
  incoterm: "FOB",
  portOfLoading: "Shanghai",
  totalAmount: 19950,
  customer: { id: "c1", name: "Seapot" },
  spotRate: 6.72,
  pricingRate: 6.52,
  items: [item],
  ...extra,
});

const renderWith = async (status: string, extra = {}) => {
  mocks.getById.mockResolvedValue({ data: quote(status, extra) });
  render(<QuoteDetailPageContent id="q1" />);
  await screen.findByText("QT2610-001");
};

describe("quote detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "SALES";
  });

  it("DRAFT shows the editor and a 作废 action, no read-only grid", async () => {
    await renderWith("DRAFT");
    expect(screen.getByTestId("editor")).toBeTruthy();
    expect(screen.getByText("作废")).toBeTruthy();
  });

  it("SENT: primary 客户已接受 transitions to ACCEPTED", async () => {
    await renderWith("SENT");
    mocks.transition.mockResolvedValue({ data: quote("ACCEPTED") });
    fireEvent.click(screen.getByText("客户已接受"));
    await waitFor(() =>
      expect(mocks.transition).toHaveBeenCalledWith("q1", "ACCEPTED"),
    );
    expect(await screen.findByText("转为出口订单")).toBeTruthy();
  });

  it("ACCEPTED → 转为出口订单 converts and opens the new order", async () => {
    await renderWith("ACCEPTED");
    mocks.transition.mockResolvedValue({
      data: quote("CONVERTED", {
        convertedOrder: { id: "ord1", contractNo: "EXP202600001" },
      }),
    });
    fireEvent.click(screen.getByText("转为出口订单"));
    await waitFor(() =>
      expect(mocks.transition).toHaveBeenCalledWith("q1", "CONVERTED"),
    );
    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith("/dashboard/sales/ord1"),
    );
  });

  it("CONVERTED links to the order", async () => {
    await renderWith("CONVERTED", {
      salesContract: { id: "ord1", contractNo: "EXP202600001" },
    });
    expect(
      screen.getByText("查看订单").closest("a")?.getAttribute("href"),
    ).toBe("/dashboard/sales/ord1");
  });

  it("cancelling asks for confirmation first", async () => {
    await renderWith("ACCEPTED");
    fireEvent.click(screen.getByText("作废"));
    expect(mocks.transition).not.toHaveBeenCalled();
    mocks.transition.mockResolvedValue({ data: quote("CANCELLED") });
    fireEvent.click(await screen.findByText("确认"));
    await waitFor(() =>
      expect(mocks.transition).toHaveBeenCalledWith("q1", "CANCELLED"),
    );
  });

  it("shows 缺成本 / 手动价 and never the formula inputs of a hidden cost", async () => {
    await renderWith("SENT");
    expect(screen.getByText("缺成本")).toBeTruthy();
    expect(screen.getByText("手动价")).toBeTruthy();
  });

  it("export, print and copy call the service", async () => {
    await renderWith("SENT");
    fireEvent.click(screen.getByText("导出 Excel"));
    await waitFor(() =>
      expect(mocks.downloadXlsx).toHaveBeenCalledWith("q1", "QT2610-001.xlsx"),
    );
    fireEvent.click(screen.getByText("打印"));
    await waitFor(() => expect(mocks.openPrintView).toHaveBeenCalledWith("q1"));
    mocks.create.mockResolvedValue({
      data: { id: "q9", quoteNo: "QT2610-009" },
    });
    fireEvent.click(screen.getByText("复制为新报价"));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({ copyFromQuoteId: "q1" }),
    );
    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith("/dashboard/quotes/q9"),
    );
  });

  it("PURCHASE can export but has no write buttons; BOSS has neither", async () => {
    mocks.role = "PURCHASE";
    await renderWith("ACCEPTED");
    expect(screen.getByText("导出 Excel")).toBeTruthy();
    expect(screen.queryByText("转为出口订单")).toBeNull();
    expect(screen.queryByText("复制为新报价")).toBeNull();
  });

  it("BOSS sees the quote read-only without export", async () => {
    mocks.role = "BOSS";
    await renderWith("SENT");
    expect(screen.queryByText("导出 Excel")).toBeNull();
    expect(screen.queryByText("客户已接受")).toBeNull();
  });
});
