/**
 * Input: real editor (J18 grid pieces) with mocked services
 * Output: row validation before any request; payload sends cost/manual price but never a formula price; live rule-price
 *         preview feeds the price cell; manual price = 手动价; 保存并标记已发送 flag
 * Pos: quote editor interaction test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QuoteEditor } from "./QuoteEditor";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  error: vi.fn(),
  preview: vi.fn(),
  getAll: vi.fn(),
  getStores: vi.fn(),
}));
vi.mock("@/services/quote.service", () => ({
  quoteService: { create: mocks.create, update: mocks.update },
}));
vi.mock("@/services/customer.service", () => ({
  customerService: { getAll: mocks.getAll, getStores: mocks.getStores },
  INCOTERM_OPTIONS: ["FOB", "CFR", "CIF", "EXW", "DDP"],
}));
vi.mock("@/services/pricing-preview.service", () => ({
  pricingPreviewService: { preview: mocks.preview },
}));
vi.mock("@/components/orders/ProductPicker", () => ({
  ProductPicker: ({
    value,
    onSelect,
    ariaLabel,
  }: {
    value: { name: string } | null;
    onSelect: (p: { id: string; customsName: string; unit?: string }) => void;
    ariaLabel?: string;
  }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() =>
        onSelect({ id: "p1", customsName: "合成商品", unit: "PCS" })
      }
    >
      {value?.name ?? "选商品"}
    </button>
  ),
}));
vi.mock("@/components/orders/PasteRowsDialog", () => ({
  PasteRowsDialog: () => <div data-testid="paste" />,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));

const customer = {
  id: "c1",
  name: "Seapot",
  isActive: true,
  defaultIncoterm: "FOB",
  defaultPaymentTerms: "T/T",
  defaultPortOfLoading: "Shanghai",
};
const store = { id: "s1", name: "Store A", code: "SAC", isActive: true };
const saved = {
  id: "q1",
  quoteNo: "QT2610-001",
  status: "DRAFT",
  customerId: "c1",
  incoterm: "FOB",
  spotRate: 6.72,
  paymentTerms: "T/T",
  portOfLoading: "Shanghai",
  validUntil: null,
  note: null,
  items: [
    {
      id: "i1",
      productId: "p1",
      storeId: "s1",
      quantity: 10,
      unit: "PCS",
      note: null,
      costCny: 10000,
      isManualPrice: false,
      unitPrice: 1994,
      formulaPrice: 1994,
      totalPrice: 19940,
      product: { customsName: "合成商品" },
    },
  ],
};

describe("quote editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAll.mockResolvedValue({ data: { items: [customer] } });
    mocks.getStores.mockResolvedValue({ data: { items: [store] } });
    mocks.preview.mockResolvedValue({
      data: { results: [{ unitPriceUsd: 1994 }], spotRate: 6.72 },
    });
  });

  it("refuses to save an empty row without calling the API", async () => {
    render(<QuoteEditor onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText("保存草稿"));
    expect(mocks.error).toHaveBeenCalledWith("第 1 行：请选择商品");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects a non-positive spot rate", () => {
    render(<QuoteEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("现汇（留空用报价规则现汇）"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByText("保存草稿"));
    expect(mocks.error).toHaveBeenCalledWith("现汇必须为正数");
  });

  it("a single active customer is preselected with its default terms", async () => {
    render(<QuoteEditor onSaved={vi.fn()} />);
    await waitFor(() => expect(mocks.getStores).toHaveBeenCalledWith("c1"));
    expect((screen.getByLabelText("客户") as HTMLSelectElement).value).toBe(
      "c1",
    );
    expect(screen.getByDisplayValue("Shanghai")).toBeTruthy();
    expect(screen.getByDisplayValue("T/T")).toBeTruthy();
  });

  it("new quote: picking a product and cost shows the live rule price; saving sends cost, never formulaPrice", async () => {
    mocks.create.mockResolvedValue({ data: saved });
    const onSaved = vi.fn();
    render(<QuoteEditor onSaved={onSaved} />);
    await waitFor(() => expect(mocks.getStores).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText("第 1 行搜索商品"));
    fireEvent.change(screen.getByLabelText("第 1 行门店"), {
      target: { value: "s1" },
    });
    fireEvent.change(screen.getByLabelText("第 1 行数量"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("第 1 行参考成本"), {
      target: { value: "10000" },
    });
    await waitFor(() =>
      expect(
        (screen.getByLabelText("第 1 行单价") as HTMLInputElement).value,
      ).toBe("1994"),
    );
    expect(mocks.preview).toHaveBeenCalledWith(
      [{ productId: "p1", costCny: 10000 }],
      undefined,
      undefined, // 新报价：没有要排除的单据
    );
    fireEvent.click(screen.getByText("保存草稿"));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    const body = mocks.create.mock.calls[0][0];
    expect(body.customerId).toBe("c1");
    expect(body.items).toEqual([
      {
        productId: "p1",
        storeId: "s1",
        quantity: 10,
        unit: "PCS",
        costCny: 10000,
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("formulaPrice");
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(saved, { markSent: false }),
    );
  });

  it("typing a different price marks 手动价 and sends isManualPrice + unitPrice (any value >= 0)", async () => {
    mocks.update.mockResolvedValue({ data: saved });
    render(<QuoteEditor quote={saved as never} onSaved={vi.fn()} />);
    await waitFor(() => expect(mocks.getStores).toHaveBeenCalledWith("c1"));
    fireEvent.change(screen.getByLabelText("第 1 行单价"), {
      target: { value: "0" },
    });
    expect(screen.getAllByText("手动价").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("保存修改"));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(mocks.update.mock.calls[0][1].items[0]).toMatchObject({
      isManualPrice: true,
      unitPrice: 0,
      costCny: 10000,
    });
  });

  it("saving an existing draft PUTs header + items and reports markSent", async () => {
    const onSaved = vi.fn();
    mocks.update.mockResolvedValue({ data: saved });
    render(<QuoteEditor quote={saved as never} onSaved={onSaved} />);
    await waitFor(() => expect(mocks.getStores).toHaveBeenCalledWith("c1"));
    expect(mocks.getAll).toHaveBeenCalled();
    // the quote being edited is excluded from its own last-price pre-fill
    await waitFor(() =>
      expect(mocks.preview).toHaveBeenCalledWith(expect.anything(), 6.72, "q1"),
    );
    fireEvent.click(screen.getByText("保存并标记已发送"));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    const [id, body] = mocks.update.mock.calls[0];
    expect(id).toBe("q1");
    expect(body).toMatchObject({
      customerId: "c1",
      incoterm: "FOB",
      spotRate: 6.72,
      paymentTerms: "T/T",
      portOfLoading: "Shanghai",
      validUntil: null,
    });
    expect(body.items).toEqual([
      {
        productId: "p1",
        storeId: "s1",
        quantity: 10,
        unit: "PCS",
        costCny: 10000,
      },
    ]);
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(saved, { markSent: true }),
    );
  });
});
