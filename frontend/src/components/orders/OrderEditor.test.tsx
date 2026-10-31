/**
 * Input: real OrderEditor with mocked customer/pricing/sales services
 * Output: R1-2 regression — changing FX (or failing to re-price) never submits an obsolete formula price;
 *         non-manual prices are left to the server, manual prices stay explicit
 * Pos: order editor interaction test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { OrderEditor } from "./OrderEditor";

const mocks = vi.hoisted(() => ({
  createWithItems: vi.fn(),
  preview: vi.fn(),
  getAll: vi.fn(),
  getStores: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/services/sales.service", () => ({
  salesService: { createWithItems: mocks.createWithItems },
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
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const customer = {
  id: "c1",
  name: "Seapot",
  isActive: true,
  defaultIncoterm: "FOB",
};
// $ = ceil(13000 / (spot − 0.2)) snapped like the server; enough for the test
const priceAt = (spot: number) => (spot === 6.72 ? 1994 : 4130);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAll.mockResolvedValue({ data: { items: [customer] } });
  mocks.getStores.mockResolvedValue({
    data: { items: [{ id: "s1", name: "Store A", isActive: true }] },
  });
  mocks.createWithItems.mockResolvedValue({ data: { id: "order-1" } });
  mocks.preview.mockImplementation(async (lines: unknown[], spot?: number) => ({
    data: {
      spotRate: spot ?? 6.72,
      results: lines.map(() => ({ unitPriceUsd: priceAt(spot ?? 6.72) })),
    },
  }));
});

const fillLine = async () => {
  await waitFor(() => expect(mocks.getStores).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("现汇 (¥/$) *"), {
    target: { value: "6.72" },
  });
  fireEvent.click(screen.getByLabelText("第 1 行搜索商品"));
  await screen.findByRole("option", { name: "Store A" });
  fireEvent.change(screen.getByLabelText("第 1 行门店"), {
    target: { value: "s1" },
  });
  fireEvent.change(screen.getByLabelText("第 1 行数量"), {
    target: { value: "10" },
  });
  fireEvent.change(screen.getByLabelText("第 1 行采购成本"), {
    target: { value: "10000" },
  });
  await waitFor(() =>
    expect(screen.getByLabelText("第 1 行单价")).toHaveValue("1994"),
  );
};
const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: "创建订单" }));

describe("OrderEditor last confirmed price", () => {
  it("shows 上次成交价 and pre-fills the last confirmed price; new products show no badge", async () => {
    mocks.preview.mockImplementation(async (lines: unknown[]) => ({
      data: {
        spotRate: 6.72,
        results: lines.map(() => ({
          unitPriceUsd: 2500.5,
          formulaPriceUsd: 1994,
          source: "LAST_CONFIRMED",
        })),
      },
    }));
    render(<OrderEditor />);
    await waitFor(() => expect(mocks.getStores).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText("第 1 行搜索商品"));
    await screen.findByRole("option", { name: "Store A" });
    fireEvent.change(screen.getByLabelText("第 1 行采购成本"), {
      target: { value: "10000" },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("第 1 行单价")).toHaveValue("2500.5"),
    );
    expect(screen.getByText("上次成交价")).toBeInTheDocument();
    // the owner edits the price: the badge gives way to 手动价
    fireEvent.change(screen.getByLabelText("第 1 行单价"), {
      target: { value: "2600" },
    });
    expect(screen.queryByText("上次成交价")).not.toBeInTheDocument();
    expect(screen.getByText("手动价")).toBeInTheDocument();
  });
});

describe("OrderEditor pricing (R1-2)", () => {
  it("changing FX and submitting immediately does not save the old formula price", async () => {
    render(<OrderEditor />);
    await fillLine();
    fireEvent.change(screen.getByLabelText("现汇 (¥/$) *"), {
      target: { value: "3.36" },
    });
    // the old $1994 is no longer shown or submittable
    expect(screen.getByLabelText("第 1 行单价")).toHaveValue("");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "正在按最新现汇和成本计算单价",
    );
    expect(mocks.createWithItems).not.toHaveBeenCalled();
    // once re-priced, the payload carries the new rate and lets the server price the line
    await waitFor(() =>
      expect(screen.getByLabelText("第 1 行单价")).toHaveValue("4130"),
    );
    submit();
    await waitFor(() => expect(mocks.createWithItems).toHaveBeenCalledTimes(1));
    const payload = mocks.createWithItems.mock.calls[0][0];
    expect(payload.exchangeRate).toBe(3.36);
    expect(payload.items[0]).toMatchObject({
      productId: "p1",
      storeId: "s1",
      quantity: 10,
      costPrice: 10000,
    });
    expect("sellingPrice" in payload.items[0]).toBe(false);
  });

  it("a failed re-price blocks submission until a retry succeeds; manual prices stay explicit", async () => {
    render(<OrderEditor />);
    await fillLine();
    mocks.preview.mockRejectedValueOnce(new Error("network"));
    fireEvent.change(screen.getByLabelText("现汇 (¥/$) *"), {
      target: { value: "3.36" },
    });
    expect(await screen.findByText(/单价计算失败/)).toBeInTheDocument();
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("单价计算失败");
    expect(mocks.createWithItems).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "重试报价" })),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("第 1 行单价")).toHaveValue("4130"),
    );
    fireEvent.change(screen.getByLabelText("第 1 行单价"), {
      target: { value: "4200" },
    });
    submit();
    await waitFor(() => expect(mocks.createWithItems).toHaveBeenCalledTimes(1));
    expect(mocks.createWithItems.mock.calls[0][0].items[0].sellingPrice).toBe(
      4200,
    );
  });
});
