/** The real sales page's empty-catalog flow; only HTTP services/auth/router are mocked. */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreateSalesPage from "./page";

const mocks = vi.hoisted(() => ({
  createStore: vi.fn(),
  createSale: vi.fn(),
  addItem: vi.fn(),
  push: vi.fn(),
  stores: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, back: vi.fn() }),
}));
vi.mock("@/store/auth.store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { role: "SALES" } }),
}));
vi.mock("@/services/product.service", () => ({
  productService: {
    getAll: vi.fn().mockResolvedValue({
      data: { items: [{ id: "synthetic-product", customsName: "合成商品" }] },
    }),
  },
}));
vi.mock("@/services/store.service", () => ({
  storeService: {
    getAll: mocks.stores,
    getPorts: vi.fn().mockResolvedValue({
      data: [{ id: "synthetic-port", name: "合成港口" }],
    }),
    create: mocks.createStore,
  },
}));
vi.mock("@/services/sales.service", () => ({
  salesService: {
    getNextContractNo: vi
      .fn()
      .mockResolvedValue({ data: { contractNo: "SYNTHETIC-001" } }),
    calculatePrice: vi.fn(() => 2),
    create: mocks.createSale,
    createWithItems: mocks.createSale,
    addItem: mocks.addItem,
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stores.mockResolvedValue({ data: { items: [] } });
  mocks.createStore.mockResolvedValue({
    data: { id: "synthetic-store", name: "合成门店", portId: "synthetic-port" },
  });
});

describe("SALES empty-store first use on the real creation page", () => {
  it("creates and selects a store on the invoking line, preserves other fields, and makes it available on other lines", async () => {
    const user = userEvent.setup();
    render(<CreateSalesPage />);
    await waitFor(() =>
      expect(screen.getByDisplayValue("SYNTHETIC-001")).toBeInTheDocument(),
    );
    await user.type(
      screen.getByRole("textbox", { name: "备注" }),
      "合成合同备注",
    );
    await user.click(screen.getByRole("button", { name: "下一步：出口明细" }));
    await user.click(screen.getByRole("combobox", { name: "商品 *" }));
    await user.click(screen.getByRole("option", { name: "合成商品" }));
    await user.click(screen.getByRole("button", { name: /添加商品/ }));
    await user.click(screen.getAllByRole("button", { name: "新增门店" })[1]);
    const dialog = await screen.findByRole("dialog", { name: "新增门店" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "门店名称 *" }),
      "合成门店",
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("combobox", { name: "港口 *" }),
      ).toBeEnabled(),
    );
    await user.click(within(dialog).getByRole("combobox", { name: "港口 *" }));
    await user.click(screen.getByRole("option", { name: "合成港口" }));
    await user.click(
      within(dialog).getByRole("button", { name: "保存并选中" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const selectors = screen.getAllByRole("combobox", { name: "门店 *" });
    expect(selectors[0]).toHaveTextContent("选择门店");
    expect(selectors[1]).toHaveTextContent("合成门店");
    expect(
      screen.getAllByRole("combobox", { name: "商品 *" })[0],
    ).toHaveTextContent("合成商品");
    expect(mocks.createStore).toHaveBeenCalledTimes(1);
    expect(mocks.createSale).not.toHaveBeenCalled();
    expect(mocks.addItem).not.toHaveBeenCalled();
    await user.click(selectors[0]);
    await user.click(screen.getByRole("option", { name: "合成门店" }));
    await user.click(screen.getByRole("button", { name: /上一步/ }));
    expect(screen.getByRole("textbox", { name: "备注" })).toHaveValue(
      "合成合同备注",
    );
    await user.click(screen.getByRole("button", { name: "下一步：出口明细" }));
    expect(
      screen.getAllByRole("combobox", { name: "门店 *" })[0],
    ).toHaveTextContent("合成门店");
    expect(
      screen.getAllByRole("combobox", { name: "门店 *" })[1],
    ).toHaveTextContent("合成门店");
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("keeps the created selection when a late initial catalog response arrives", async () => {
    let resolveCatalog!: (value: {
      data: { items: { id: string; name: string }[] };
    }) => void;
    mocks.stores.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCatalog = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<CreateSalesPage />);
    await user.click(screen.getByRole("button", { name: "下一步：出口明细" }));
    await user.click(screen.getByRole("button", { name: "新增门店" }));
    const dialog = await screen.findByRole("dialog", { name: "新增门店" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "门店名称 *" }),
      "合成门店",
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("combobox", { name: "港口 *" }),
      ).toBeEnabled(),
    );
    await user.click(within(dialog).getByRole("combobox", { name: "港口 *" }));
    await user.click(screen.getByRole("option", { name: "合成港口" }));
    await user.click(
      within(dialog).getByRole("button", { name: "保存并选中" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await act(async () =>
      resolveCatalog({
        data: { items: [{ id: "existing-store", name: "已有门店" }] },
      }),
    );
    const selector = screen.getByRole("combobox", { name: "门店 *" });
    expect(selector).toHaveTextContent("合成门店");
    await user.click(selector);
    expect(
      screen.getByRole("option", { name: "合成门店" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "已有门店" }),
    ).toBeInTheDocument();
    expect(mocks.createStore).toHaveBeenCalledTimes(1);
    expect(mocks.createSale).not.toHaveBeenCalled();
  });
  it("includes the newly created store in one atomic contract submission", async () => {
    mocks.createSale.mockResolvedValueOnce({ data: { id: "synthetic-sale" } });
    const user = userEvent.setup();
    render(<CreateSalesPage />);
    await waitFor(() =>
      expect(screen.getByDisplayValue("SYNTHETIC-001")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "下一步：出口明细" }));
    await user.click(screen.getByRole("combobox", { name: "商品 *" }));
    await user.click(screen.getByRole("option", { name: "合成商品" }));
    await user.clear(screen.getByRole("spinbutton", { name: /数量/ }));
    await user.type(screen.getByRole("spinbutton", { name: /数量/ }), "12");
    await user.clear(screen.getByRole("spinbutton", { name: /成本/ }));
    await user.type(screen.getByRole("spinbutton", { name: /成本/ }), "125");
    await user.click(screen.getByRole("button", { name: "新增门店" }));
    const dialog = await screen.findByRole("dialog", { name: "新增门店" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "门店名称 *" }),
      "合成门店",
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("combobox", { name: "港口 *" }),
      ).toBeEnabled(),
    );
    await user.click(within(dialog).getByRole("combobox", { name: "港口 *" }));
    await user.click(screen.getByRole("option", { name: "合成港口" }));
    await user.click(
      within(dialog).getByRole("button", { name: "保存并选中" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(mocks.createSale).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "创建合同" }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/dashboard/sales/synthetic-sale",
      ),
    );
    expect(mocks.createSale).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        contractNo: "SYNTHETIC-001",
        items: [
          expect.objectContaining({
            productId: "synthetic-product",
            storeId: "synthetic-store",
            quantity: 12,
            costPrice: 125,
            sellingPrice: 2,
          }),
        ],
      }),
      expect.any(String),
    );
    expect(mocks.createStore).toHaveBeenCalledTimes(1);
    expect(mocks.addItem).not.toHaveBeenCalled();
  });
});
