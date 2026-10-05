/**
 * Input: 真实采购表单与合成目录/API响应
 * Output: 编号边界与内联供应商草稿、取消重开、迟到保存隔离回归
 * Pos: 采购表单编号边界测试
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreatePurchasePage from "./CreatePurchasePageContent";

const mocks = vi.hoisted(() => ({
  editId: null as string | null,
  push: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  getNextContractNo: vi.fn(),
  getById: vi.fn(),
  supplierCreate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, back: vi.fn() }),
  useSearchParams: () => ({ get: () => mocks.editId }),
}));
vi.mock("@/services/purchase.service", () => ({
  purchaseService: {
    create: mocks.create,
    update: mocks.update,
    getNextContractNo: mocks.getNextContractNo,
    getById: mocks.getById,
    getProductPriceHistory: vi
      .fn()
      .mockResolvedValue({ data: { count: 0, averagePrice: null } }),
    getSuppliersByProducts: vi
      .fn()
      .mockResolvedValue({ data: { supplierIds: [] } }),
  },
}));
vi.mock("@/services/supplier.service", () => ({
  supplierService: {
    create: mocks.supplierCreate,
    getAll: vi.fn().mockResolvedValue({
      data: { items: [{ id: "supplier-1", name: "合成供应商" }] },
    }),
  },
}));
vi.mock("@/services/product.service", () => ({
  productService: {
    getAll: vi.fn().mockResolvedValue({
      data: {
        items: [{ id: "product-1", customsName: "合成商品", unit: "件" }],
      },
    }),
  },
}));
vi.mock("@/services/contractTemplate.service", () => ({
  contractTemplateService: {
    getByType: vi.fn().mockResolvedValue({ data: [] }),
  },
}));
vi.mock("@/components/purchase/PriceGuard", () => ({ PriceGuard: () => null }));
vi.mock("@/lib/api-cache", () => ({ invalidateCache: vi.fn() }));
vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    warning: vi.fn(),
  },
}));

describe("采购表单编号", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.editId = null;
    mocks.getNextContractNo.mockResolvedValue({
      data: { contractNo: "CG2600004" },
    });
    mocks.create.mockResolvedValue({
      data: { id: "created-purchase", contractNo: "CG2600005" },
    });
    mocks.update.mockResolvedValue({ data: {} });
    mocks.getById.mockResolvedValue({
      data: {
        id: "draft-1",
        supplierId: "supplier-1",
        contractNo: "SYNTHETIC-EXPLICIT",
        status: "DRAFT",
        taxRate: 13,
        items: [
          { productId: "product-1", quantity: 2, unitPrice: 10, unit: "件" },
        ],
      },
    });
  });

  it("新增提交由后端重新分配编号，不发送禁用预览；前后切步保留表单", async () => {
    const user = userEvent.setup();
    render(<CreatePurchasePage />);
    await waitFor(() => expect(mocks.getNextContractNo).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("combobox", { name: /商品/ }));
    await user.click(await screen.findByRole("option", { name: "合成商品" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /数量/ }), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: /单价/ }), {
      target: { value: "10" },
    });
    await user.click(screen.getByRole("button", { name: "下一步：合同信息" }));
    expect(await screen.findByLabelText("合同编号")).toHaveValue("CG2600004");
    expect(screen.getByLabelText("合同编号")).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: /供应商/ }));
    await user.click(await screen.findByRole("option", { name: "合成供应商" }));
    await user.click(screen.getByRole("button", { name: "上一步" }));
    await user.click(screen.getByRole("button", { name: "下一步：合同信息" }));
    await user.click(screen.getByRole("button", { name: "创建合同" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    const payload = mocks.create.mock.calls[0][0];
    expect(payload).not.toHaveProperty("contractNo");
    expect(payload).toMatchObject({
      supplierId: "supplier-1",
      items: [{ productId: "product-1", quantity: 2, unitPrice: 10 }],
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/contracts");
  });

  it("草稿更正继续发送原始显式编号，不查询新增预览", async () => {
    mocks.editId = "draft-1";
    const user = userEvent.setup();
    render(<CreatePurchasePage />);
    await waitFor(() =>
      expect(screen.getByRole("spinbutton", { name: /数量/ })).toHaveValue(2),
    );
    await user.click(screen.getByRole("button", { name: "下一步：合同信息" }));
    expect(await screen.findByLabelText("合同编号")).toHaveValue(
      "SYNTHETIC-EXPLICIT",
    );
    await user.click(screen.getByRole("button", { name: "保存更正" }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        "draft-1",
        expect.objectContaining({ contractNo: "SYNTHETIC-EXPLICIT" }),
      ),
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.getNextContractNo).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/purchase/draft-1");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const syntheticCreatedSupplier = {
  id: "synthetic-supplier-created",
  name: "合成已提交供应商",
  hasQualityIssue: false,
};
async function openSupplierDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "新增" }));
  return screen.findByRole("dialog", { name: "新增供应商" });
}
async function showContractStep(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() =>
    expect(screen.getByRole("spinbutton", { name: /数量/ })).toHaveValue(2),
  );
  await user.click(screen.getByRole("button", { name: "下一步：合同信息" }));
}

describe("purchase inline supplier editor sessions (synthetic fixtures)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.editId = "synthetic-draft";
    mocks.getById.mockResolvedValue({
      data: {
        id: "synthetic-draft",
        supplierId: "supplier-1",
        contractNo: "SYNTHETIC-DRAFT",
        status: "DRAFT",
        taxRate: 13,
        items: [
          { productId: "product-1", quantity: 2, unitPrice: 10, unit: "件" },
        ],
      },
    });
    mocks.supplierCreate
      .mockReset()
      .mockResolvedValue({ data: syntheticCreatedSupplier });
  });

  it.each(["取消", "Escape", "关闭"])(
    "%s discards unsaved values before reopening",
    async (dismiss) => {
      const user = userEvent.setup();
      render(<CreatePurchasePage />);
      await showContractStep(user);
      const dialog = await openSupplierDialog(user);
      await user.type(
        within(dialog).getByLabelText("供应商名称 *"),
        "合成未提交草稿",
      );
      await user.type(
        within(dialog).getByLabelText("联系人"),
        "合成临时联系人",
      );
      if (dismiss === "Escape") await user.keyboard("{Escape}");
      else
        await user.click(within(dialog).getByRole("button", { name: dismiss }));
      const reopened = await openSupplierDialog(user);
      expect(within(reopened).getByLabelText("供应商名称 *")).toHaveValue("");
      expect(within(reopened).getByLabelText("联系人")).toHaveValue("");
      expect(mocks.supplierCreate).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );

  it("failed save keeps optional draft values and retries only on request", async () => {
    mocks.supplierCreate.mockRejectedValueOnce(
      new Error("synthetic save failure"),
    );
    const user = userEvent.setup();
    render(<CreatePurchasePage />);
    await showContractStep(user);
    const dialog = await openSupplierDialog(user);
    await user.type(
      within(dialog).getByLabelText("供应商名称 *"),
      "合成已提交供应商",
    );
    await user.type(within(dialog).getByLabelText("联系人"), "合成联系人");
    await user.click(
      within(dialog).getByRole("button", { name: "保存供应商" }),
    );
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("创建供应商失败"),
    );
    expect(within(dialog).getByLabelText("联系人")).toHaveValue("合成联系人");
    expect(mocks.supplierCreate).toHaveBeenCalledTimes(1);
    await user.click(
      within(dialog).getByRole("button", { name: "保存供应商" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(mocks.supplierCreate).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("combobox", { name: /供应商/ })).toHaveTextContent(
      "合成已提交供应商",
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("late cancelled save cannot close a reopened dialog or replace the purchase selection", async () => {
    const pending = deferred<{ data: typeof syntheticCreatedSupplier }>();
    mocks.supplierCreate.mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    render(<CreatePurchasePage />);
    await showContractStep(user);
    const dialog = await openSupplierDialog(user);
    await user.type(
      within(dialog).getByLabelText("供应商名称 *"),
      syntheticCreatedSupplier.name,
    );
    await user.click(
      within(dialog).getByRole("button", { name: "保存供应商" }),
    );
    await waitFor(() => expect(mocks.supplierCreate).toHaveBeenCalledTimes(1));
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    const reopened = await openSupplierDialog(user);
    await user.clear(within(reopened).getByLabelText("供应商名称 *"));
    await user.type(
      within(reopened).getByLabelText("供应商名称 *"),
      "合成新会话草稿",
    );
    await act(async () => pending.resolve({ data: syntheticCreatedSupplier }));
    expect(reopened).toBeInTheDocument();
    expect(within(reopened).getByLabelText("供应商名称 *")).toHaveValue(
      "合成新会话草稿",
    );
    expect(
      screen
        .getAllByRole("combobox", { hidden: true })
        .find((element) => element.textContent?.includes("合成供应商")),
    ).toBeDefined();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("late success after navigation cannot announce or select the supplier", async () => {
    const pending = deferred<{ data: typeof syntheticCreatedSupplier }>();
    mocks.supplierCreate.mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    const view = render(<CreatePurchasePage />);
    await showContractStep(user);
    const dialog = await openSupplierDialog(user);
    await user.type(
      within(dialog).getByLabelText("供应商名称 *"),
      syntheticCreatedSupplier.name,
    );
    await user.click(
      within(dialog).getByRole("button", { name: "保存供应商" }),
    );
    await waitFor(() => expect(mocks.supplierCreate).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => pending.resolve({ data: syntheticCreatedSupplier }));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("blocks duplicate save clicks synchronously and preserves every optional input", async () => {
    const pending = deferred<{ data: typeof syntheticCreatedSupplier }>();
    mocks.supplierCreate.mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    render(<CreatePurchasePage />);
    await showContractStep(user);
    const dialog = await openSupplierDialog(user);
    await user.type(
      within(dialog).getByLabelText("供应商名称 *"),
      syntheticCreatedSupplier.name,
    );
    await user.type(within(dialog).getByLabelText("联系人"), "合成测试联系人");
    await user.type(
      within(dialog).getByLabelText("联系电话"),
      "synthetic-phone",
    );
    await user.type(within(dialog).getByLabelText("公司地址"), "合成测试地址");
    const save = within(dialog).getByRole("button", { name: "保存供应商" });
    act(() => {
      save.click();
      save.click();
    });
    expect(mocks.supplierCreate).toHaveBeenCalledTimes(1);
    expect(mocks.supplierCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: syntheticCreatedSupplier.name,
        contactName: "合成测试联系人",
        contactPhone: "synthetic-phone",
        address: "合成测试地址",
        taxId: "",
        bankAccountName: "",
        bankName: "",
        bankBranch: "",
        bankCode: "",
        bankAccount: "",
      }),
    );
    expect(within(dialog).getByLabelText("供应商名称 *")).toBeDisabled();
    await act(async () => pending.resolve({ data: syntheticCreatedSupplier }));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("late old failure cannot show an error or disable a reopened supplier editor", async () => {
    const pending = deferred<{ data: typeof syntheticCreatedSupplier }>();
    mocks.supplierCreate.mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    render(<CreatePurchasePage />);
    await showContractStep(user);
    const dialog = await openSupplierDialog(user);
    await user.type(
      within(dialog).getByLabelText("供应商名称 *"),
      syntheticCreatedSupplier.name,
    );
    await user.click(
      within(dialog).getByRole("button", { name: "保存供应商" }),
    );
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    const reopened = await openSupplierDialog(user);
    await user.type(
      within(reopened).getByLabelText("供应商名称 *"),
      "合成保留新草稿",
    );
    await act(async () => pending.reject(new Error("synthetic old failure")));
    expect(within(reopened).getByLabelText("供应商名称 *")).toHaveValue(
      "合成保留新草稿",
    );
    expect(
      within(reopened).getByRole("button", { name: "保存供应商" }),
    ).toBeEnabled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("cannot start supplier creation while the selected contract is still loading", async () => {
    const pending = deferred<{ data: unknown }>();
    const user = userEvent.setup();
    const view = render(<CreatePurchasePage />);
    await showContractStep(user);
    mocks.getById.mockReturnValueOnce(pending.promise);
    mocks.editId = "synthetic-new-target";
    view.rerender(<CreatePurchasePage />);
    await waitFor(() =>
      expect(mocks.getById).toHaveBeenCalledWith("synthetic-new-target"),
    );
    expect(screen.getByRole("button", { name: "新增" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: /供应商/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "新增" }));
    expect(
      screen.queryByRole("dialog", { name: "新增供应商" }),
    ).not.toBeInTheDocument();
    await act(async () =>
      pending.resolve({
        data: {
          id: "synthetic-new-target",
          supplierId: "supplier-1",
          contractNo: "SYNTHETIC-NEW-TARGET",
          status: "DRAFT",
          taxRate: 13,
          items: [
            { productId: "product-1", quantity: 3, unitPrice: 11, unit: "件" },
          ],
        },
      }),
    );
    expect(screen.getByRole("button", { name: "新增" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: /供应商/ })).toHaveTextContent(
      "合成供应商",
    );
    expect(mocks.supplierCreate).not.toHaveBeenCalled();
  });
  it("closes the old supplier search when the selected contract changes", async () => {
    const pending = deferred<{ data: unknown }>();
    const user = userEvent.setup();
    const view = render(<CreatePurchasePage />);
    await showContractStep(user);
    await user.click(screen.getByRole("combobox", { name: /供应商/ }));
    await user.type(
      screen.getByPlaceholderText("输入供应商名称搜索..."),
      "合成旧查询",
    );
    mocks.getById.mockReturnValueOnce(pending.promise);
    mocks.editId = "synthetic-new-query-target";
    view.rerender(<CreatePurchasePage />);
    await waitFor(() =>
      expect(mocks.getById).toHaveBeenCalledWith("synthetic-new-query-target"),
    );
    expect(
      screen.queryByPlaceholderText("输入供应商名称搜索..."),
    ).not.toBeInTheDocument();
    await act(async () =>
      pending.resolve({
        data: {
          id: "synthetic-new-query-target",
          supplierId: "supplier-1",
          contractNo: "SYNTHETIC-QUERY-TARGET",
          status: "DRAFT",
          taxRate: 13,
          items: [
            { productId: "product-1", quantity: 3, unitPrice: 11, unit: "件" },
          ],
        },
      }),
    );
    await user.click(screen.getByRole("combobox", { name: /供应商/ }));
    expect(screen.getByPlaceholderText("输入供应商名称搜索...")).toHaveValue(
      "",
    );
  });
});
