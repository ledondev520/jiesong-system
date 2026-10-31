/**
 * Input: real editor with mocked services
 * Output: row validation before any request; the payload sends cost/manual price but never a formula price; 保存并标记已发送 flag
 * Pos: quote editor interaction test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QuoteEditor } from "./QuoteEditor";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), error: vi.fn() }));
vi.mock("@/services/quote.service", () => ({ quoteService: { create: mocks.create, update: mocks.update } }));
vi.mock("@/services/product.service", () => ({ productService: { getAll: vi.fn().mockResolvedValue({ data: { items: [] } }) } }));
vi.mock("@/services/store.service", () => ({ storeService: { getAll: vi.fn().mockResolvedValue({ data: { items: [] } }) } }));
vi.mock("@/app/dashboard/sales/create/components/StoreSelect", () => ({ StoreSelect: () => <div /> }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));

const saved = {
  id: "q1", quoteNo: "QT2610-001", status: "DRAFT", spotRate: 6.72, paymentTerms: "T/T", portOfLoading: "Shanghai", validUntil: null, note: null,
  items: [{ id: "i1", productId: "p1", storeId: "s1", quantity: 10, unit: "PCS", note: null, costCny: 10000, isManualPrice: false, unitPrice: 1995, formulaPrice: 1995, totalPrice: 19950 }],
};

describe("quote editor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses to save an empty row without calling the API", async () => {
    render(<QuoteEditor onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText("保存草稿"));
    expect(mocks.error).toHaveBeenCalledWith("第1行请选择商品");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects a non-positive spot rate", () => {
    render(<QuoteEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("现汇（留空用系统配置）"), { target: { value: "0" } });
    fireEvent.click(screen.getByText("保存草稿"));
    expect(mocks.error).toHaveBeenCalledWith("现汇必须为正数");
  });

  it("saving an existing draft PUTs header + items without formulaPrice and reports markSent", async () => {
    const onSaved = vi.fn();
    mocks.update.mockResolvedValue({ data: saved });
    render(<QuoteEditor quote={saved as never} onSaved={onSaved} />);
    expect(screen.getByDisplayValue("Shanghai")).toBeTruthy();
    // server-computed rule price is shown, not editable
    expect(screen.getAllByText("USD 1,995.00").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("保存并标记已发送"));
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    const [id, body] = mocks.update.mock.calls[0];
    expect(id).toBe("q1");
    expect(body).toMatchObject({ spotRate: 6.72, paymentTerms: "T/T", portOfLoading: "Shanghai", validUntil: null });
    expect(body.items).toEqual([{ productId: "p1", storeId: "s1", quantity: 10, unit: "PCS", note: undefined, costCny: 10000 }]);
    expect(JSON.stringify(body)).not.toContain("formulaPrice");
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved, { markSent: true }));
  });
});
