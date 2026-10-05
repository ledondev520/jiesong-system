/** Synthetic UI tests for inline store creation and interrupted first-use flows. */
import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Role, type Store } from "@/types";
import { StoreSelect } from "./StoreSelect";
import { CreateStoreDialog } from "./CreateStoreDialog";

const mocks = vi.hoisted(() => ({
  role: "SALES" as string | undefined,
  create: vi.fn(),
  getPorts: vi.fn(),
  toast: vi.fn(),
  outerSubmit: vi.fn(),
}));
vi.mock("@/store/auth.store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { role: mocks.role } }),
}));
vi.mock("@/services/store.service", () => ({
  storeService: { create: mocks.create, getPorts: mocks.getPorts },
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toast } }));

const port = {
  id: "synthetic-port",
  name: "合成港口",
  code: "QA",
  isActive: true,
  createdAt: "",
  updatedAt: "",
};
const store: Store = {
  id: "synthetic-store",
  name: "合成门店",
  portId: port.id,
  port,
  isActive: true,
  createdAt: "",
  updatedAt: "",
};
function Harness({ initial = [] }: { initial?: Store[] }) {
  const [stores, setStores] = useState(initial);
  const form = useForm({ defaultValues: { storeId: "" } });
  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mocks.outerSubmit();
        }}
      >
        <FormField
          control={form.control}
          name="storeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>门店 *</FormLabel>
              <StoreSelect
                stores={stores}
                value={field.value}
                onChange={field.onChange}
                onCreated={(created) =>
                  setStores((current) => [...current, created])
                }
              />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "新增门店" }));
  const dialog = await screen.findByRole("dialog", { name: "新增门店" });
  await waitFor(() =>
    expect(
      within(dialog).getByRole("combobox", { name: "港口 *" }),
    ).toBeEnabled(),
  );
  return dialog;
}
async function fill(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
) {
  await user.type(
    within(dialog).getByRole("textbox", { name: "门店名称 *" }),
    "  合成门店  ",
  );
  await user.click(within(dialog).getByRole("combobox", { name: "港口 *" }));
  await user.click(await screen.findByRole("option", { name: "合成港口" }));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = Role.SALES;
  mocks.getPorts.mockReset().mockResolvedValue({ data: [port] });
  mocks.create.mockReset().mockResolvedValue({ data: store });
});

describe("inline sales store creation", () => {
  it("empty catalog explains the next step, validates required fields and email before any write", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(
      screen.getByText("暂无门店，可先新增门店后继续填写。"),
    ).toBeInTheDocument();
    const dialog = await open(user);
    await user.click(
      within(dialog).getByRole("button", { name: "保存并选中" }),
    );
    expect(
      await within(dialog).findByText("请输入门店名称"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("请选择港口")).toBeInTheDocument();
    await user.type(
      within(dialog).getByRole("textbox", { name: "门店名称 *" }),
      "   ",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "保存并选中" }),
    );
    expect(within(dialog).getByText("请输入门店名称")).toBeInTheDocument();
    await user.clear(
      within(dialog).getByRole("textbox", { name: "门店名称 *" }),
    );
    await fill(user, dialog);
    await user.type(
      within(dialog).getByRole("textbox", { name: "联系邮箱" }),
      "invalid",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "保存并选中" }),
    );
    expect(
      await within(dialog).findByText("请输入有效邮箱"),
    ).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.outerSubmit).not.toHaveBeenCalled();
  });

  it("saves optional details once, updates the catalog and selects the result despite a prior search", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(
      screen.getByRole("textbox", { name: "搜索门店" }),
      "no-match",
    );
    const dialog = await open(user);
    await fill(user, dialog);
    await user.type(
      within(dialog).getByRole("textbox", { name: "联系人" }),
      "合成联系人",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "联系电话" }),
      "test-phone",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "联系邮箱" }),
      "store@example.invalid",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "地址" }),
      "合成地址",
    );
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({
      name: "合成门店",
      portId: port.id,
      contactName: "合成联系人",
      contactPhone: "test-phone",
      contactEmail: "store@example.invalid",
      address: "合成地址",
    });
    expect(screen.getByRole("combobox", { name: "门店 *" })).toHaveTextContent(
      "合成门店",
    );
    expect(screen.getByRole("textbox", { name: "搜索门店" })).toHaveValue("");
    expect(mocks.outerSubmit).not.toHaveBeenCalled();
  });

  it.each(["取消", "Escape", "关闭"])(
    "%s discards the unsaved dialog without writing or changing selection",
    async (dismiss) => {
      const user = userEvent.setup();
      render(<Harness initial={[store]} />);
      await user.click(screen.getByRole("combobox", { name: "门店 *" }));
      await user.click(screen.getByRole("option", { name: /合成门店/ }));
      const dialog = await open(user);
      await fill(user, dialog);
      if (dismiss === "Escape") await user.keyboard("{Escape}");
      else
        await user.click(within(dialog).getByRole("button", { name: dismiss }));
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(mocks.create).not.toHaveBeenCalled();
      expect(
        screen.getByRole("combobox", { name: "门店 *" }),
      ).toHaveTextContent("合成门店");
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "新增门店" })).toHaveFocus(),
      );
      const reopened = await open(user);
      expect(
        within(reopened).getByRole("textbox", { name: "门店名称 *" }),
      ).toHaveValue("");
      expect(
        within(reopened).getByRole("combobox", { name: "港口 *" }),
      ).toHaveTextContent("选择港口");
    },
  );

  it("retains values after a server failure and allows an explicit successful retry", async () => {
    mocks.create.mockRejectedValueOnce(new Error("synthetic failure"));
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = await open(user);
    await fill(user, dialog);
    await user.click(
      within(dialog).getByRole("button", { name: "保存并选中" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "门店保存失败",
    );
    expect(
      within(dialog).getByRole("textbox", { name: "门店名称 *" }),
    ).toHaveValue("  合成门店  ");
    expect(
      screen.getAllByRole("combobox", { hidden: true })[0],
    ).not.toHaveTextContent("合成门店");
    await user.click(
      within(dialog).getByRole("button", { name: "保存并选中" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("combobox", { name: "门店 *" })).toHaveTextContent(
      "合成门店",
    );
  });

  it("blocks repeated submits and dismissal during a pending save", async () => {
    const pending = deferred<{ data: Store }>();
    mocks.create.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = await open(user);
    await fill(user, dialog);
    await user.dblClick(
      within(dialog).getByRole("button", { name: "保存并选中" }),
    );
    expect(
      within(dialog).getByRole("button", { name: "保存中..." }),
    ).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
    fireEvent.submit(dialog.querySelector("form")!);
    await user.keyboard("{Escape}");
    await user.click(within(dialog).getByRole("button", { name: "关闭" }));
    expect(dialog).toBeInTheDocument();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ data: store }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(mocks.outerSubmit).not.toHaveBeenCalled();
  });

  it("ignores a pending save result after navigation unmounts or replaces its dialog", async () => {
    const pending = deferred<{ data: Store }>();
    mocks.create.mockReturnValueOnce(pending.promise);
    const created = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <CreateStoreDialog
        key="old"
        onClose={vi.fn()}
        onRestoreFocus={vi.fn()}
        onCreated={created}
      />,
    );
    const oldDialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(
        within(oldDialog).getByRole("combobox", { name: "港口 *" }),
      ).toBeEnabled(),
    );
    await fill(user, oldDialog);
    await user.click(
      within(oldDialog).getByRole("button", { name: "保存并选中" }),
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
    view.rerender(
      <CreateStoreDialog
        key="new"
        onClose={vi.fn()}
        onRestoreFocus={vi.fn()}
        onCreated={created}
      />,
    );
    await act(async () => pending.resolve({ data: store }));
    expect(created).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "门店名称 *" })).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("can retry port loading and cannot save with a failed or empty port catalog", async () => {
    mocks.getPorts
      .mockRejectedValueOnce(new Error("synthetic load failure"))
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [port] });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "新增门店" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "港口加载失败",
    );
    expect(
      within(dialog).getByRole("button", { name: "保存并选中" }),
    ).toBeDisabled();
    await user.click(
      within(dialog).getByRole("button", { name: "重新加载港口" }),
    );
    expect(await within(dialog).findByRole("status")).toHaveTextContent(
      "暂无可用港口",
    );
    expect(
      within(dialog).getByRole("button", { name: "保存并选中" }),
    ).toBeDisabled();
    await user.click(
      within(dialog).getByRole("button", { name: "重新加载港口" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("combobox", { name: "港口 *" }),
      ).toBeEnabled(),
    );
    expect(mocks.getPorts).toHaveBeenCalledTimes(3);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("ignores a cancelled open's late port response after reopening", async () => {
    const old = deferred<{ data: (typeof port)[] }>();
    mocks.getPorts.mockReturnValueOnce(old.promise);
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "新增门店" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }),
    );
    const dialog = await open(user);
    await act(async () => old.resolve({ data: [] }));
    expect(
      within(dialog).getByRole("combobox", { name: "港口 *" }),
    ).toBeEnabled();
    expect(within(dialog).queryByText(/暂无可用港口/)).not.toBeInTheDocument();
  });

  it.each([
    Role.ADMIN,
    Role.PURCHASE,
    Role.SALES,
    Role.FINANCE,
    Role.WAREHOUSE,
  ])("offers creation for the existing %s write role", (role) => {
    mocks.role = role;
    render(<Harness />);
    expect(
      screen.getByRole("button", { name: "新增门店" }),
    ).toBeInTheDocument();
  });
  it.each([Role.BOSS, undefined, "UNKNOWN"])(
    "does not offer writes for %s",
    (role) => {
      mocks.role = role;
      render(<Harness />);
      expect(
        screen.queryByRole("button", { name: "新增门店" }),
      ).not.toBeInTheDocument();
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.getPorts).not.toHaveBeenCalled();
    },
  );
});
