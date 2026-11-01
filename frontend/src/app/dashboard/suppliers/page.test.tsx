/**
 * Input: 供应商管理表单页、supplierService、toast
 * Output: 供应商档案编辑会话、失败重试及晚到请求隔离测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
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
import SuppliersPage from "./page";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types";

const mockIsMobile = vi.fn(() => false);

vi.mock("@/lib/hooks/useMobile", () => ({ useMobile: () => mockIsMobile() }));

const mockGetAll = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockHardPreview = vi.fn();
const mockHardDelete = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/suppliers",
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("@/services/supplier.service", () => ({
  supplierService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    hardDeletePreview: (...args: unknown[]) => mockHardPreview(...args),
    hardDelete: (...args: unknown[]) => mockHardDelete(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

vi.mock("@/lib/api-cache", () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

describe("SuppliersPage 表单页交互逻辑", () => {
  beforeEach(() => {
    mockIsMobile.mockReturnValue(false);
    mockGetAll.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  it("无数据时展示供应商档案表单", async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });

    render(<SuppliersPage />);

    expect(
      await screen.findByRole("heading", { name: "供应商管理" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "供应商档案表单" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("暂无供应商")).toBeInTheDocument();
    expect(screen.getByLabelText("公司名称 *")).toBeInTheDocument();
    expect(screen.getByLabelText("收款户名")).toBeInTheDocument();
    expect(screen.getByLabelText("开户支行")).toBeInTheDocument();
    expect(screen.getByLabelText("联行号 / 银行编号")).toBeInTheDocument();
    expect(screen.queryByText("供应商弹窗已打开")).not.toBeInTheDocument();
  });

  it("已归档供应商默认隐藏，仅在「已归档」筛选下显示", async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [
          { id: "live-1", name: "合成在用供应商", isActive: true },
          { id: "arch-1", name: "合成归档供应商", isActive: false },
        ],
      },
    });
    const user = userEvent.setup();

    render(<SuppliersPage />);

    expect(
      await screen.findByRole("button", { name: "选择供应商 合成在用供应商" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "选择供应商 合成归档供应商" }),
    ).not.toBeInTheDocument();
    expect(mockGetAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: "all" }),
    );

    await user.click(screen.getByRole("button", { name: "已归档" }));
    expect(
      await screen.findByRole("button", { name: "选择供应商 合成归档供应商" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "选择供应商 合成在用供应商" }),
    ).not.toBeInTheDocument();
  });

  it("在表单页创建供应商", async () => {
    mockGetAll
      .mockResolvedValueOnce({ data: { items: [] } })
      .mockResolvedValueOnce({ data: { items: [] } });
    mockCreate.mockResolvedValue({ data: { id: "supplier-new" } });
    const user = userEvent.setup();

    render(<SuppliersPage />);

    await user.type(
      await screen.findByLabelText("公司名称 *"),
      "广州玻璃制品有限公司",
    );
    await user.type(screen.getByLabelText("联系人"), "王经理");
    await user.click(screen.getByRole("button", { name: "创建供应商" }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "广州玻璃制品有限公司",
          contactName: "王经理",
          hasQualityIssue: false,
        }),
      );
      expect(mockToastSuccess).toHaveBeenCalledWith("供应商创建成功");
    });
  });

  it("手机选择供应商后定位表单并编辑保存", async () => {
    mockIsMobile.mockReturnValue(true);
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    mockGetAll
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "supplier-1",
              name: "佛山陶瓷有限公司",
              shortName: "佛山陶瓷",
              contactName: "李总",
              contactPhone: "13800000000",
              contactEmail: "",
              hasQualityIssue: true,
              qualityNote: "曾有破损",
              aliases: [
                {
                  id: "alias-1",
                  alias: "陶瓷厂",
                  supplierId: "supplier-1",
                  createdAt: "2026-01-01",
                },
              ],
            },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { items: [] } });
    mockUpdate.mockResolvedValue({ data: { id: "supplier-1" } });
    const user = userEvent.setup();

    render(<SuppliersPage />);

    await user.click(
      await screen.findByRole("button", {
        name: "选择供应商 佛山陶瓷有限公司",
      }),
    );
    expect(screen.getByLabelText("公司名称 *")).toHaveValue("佛山陶瓷有限公司");
    expect(screen.getByLabelText("联系人")).toHaveValue("李总");
    expect(screen.getByText("编辑现有档案")).toBeInTheDocument();
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    scroll.mockRestore();

    await user.clear(screen.getByLabelText("联系人"));
    await user.type(screen.getByLabelText("联系人"), "李经理");
    await user.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        "supplier-1",
        expect.objectContaining({
          name: "佛山陶瓷有限公司",
          contactName: "李经理",
          hasQualityIssue: true,
        }),
      );
      expect(mockToastSuccess).toHaveBeenCalledWith("供应商更新成功");
    });
  });

  it("加载失败时提示错误", async () => {
    mockGetAll.mockRejectedValue(new Error("load failed"));

    render(<SuppliersPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("加载供应商失败");
    });
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
const syntheticSuppliers = [
  {
    id: "synthetic-a",
    name: "合成供应商甲",
    contactName: "合成甲联系人",
    hasQualityIssue: false,
    aliases: [],
  },
  {
    id: "synthetic-b",
    name: "合成供应商乙",
    contactName: "合成乙联系人",
    hasQualityIssue: false,
    aliases: [],
  },
];

describe("supplier editor interrupted sessions (synthetic fixtures)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMobile.mockReturnValue(false);
    mockGetAll.mockReset().mockResolvedValue({
      data: { items: syntheticSuppliers.map((item) => ({ ...item })) },
    });
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
  });

  it("keeps the entered draft after a failed save and permits an explicit retry", async () => {
    mockUpdate
      .mockRejectedValueOnce(new Error("synthetic failure"))
      .mockResolvedValueOnce({ data: syntheticSuppliers[0] });
    const user = userEvent.setup();
    render(<SuppliersPage />);
    await user.click(
      await screen.findByRole("button", { name: "选择供应商 合成供应商甲" }),
    );
    await user.clear(screen.getByLabelText("联系人"));
    await user.type(screen.getByLabelText("联系人"), "合成修改草稿");
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("更新失败"),
    );
    expect(screen.getByLabelText("联系人")).toHaveValue("合成修改草稿");
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockUpdate).toHaveBeenLastCalledWith(
      "synthetic-a",
      expect.objectContaining({ contactName: "合成修改草稿" }),
    );
  });

  it("late save refresh cannot reset another selected supplier or its search", async () => {
    const pending = deferred<{ data: (typeof syntheticSuppliers)[number] }>();
    const refresh = deferred<{ data: { items: typeof syntheticSuppliers } }>();
    mockGetAll
      .mockResolvedValueOnce({ data: { items: syntheticSuppliers } })
      .mockReturnValueOnce(refresh.promise);
    mockUpdate.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<SuppliersPage />);
    await user.click(
      await screen.findByRole("button", { name: "选择供应商 合成供应商甲" }),
    );
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    await user.click(
      screen.getByRole("button", { name: "选择供应商 合成供应商乙" }),
    );
    await user.clear(screen.getByLabelText("联系人"));
    await user.type(screen.getByLabelText("联系人"), "合成乙新草稿");
    await user.type(
      screen.getByPlaceholderText("搜索名称、联系人、别名..."),
      "合成供应商乙",
    );
    await act(async () => pending.resolve({ data: syntheticSuppliers[0] }));
    await waitFor(() => expect(mockGetAll).toHaveBeenCalledTimes(2));
    await act(async () =>
      refresh.resolve({
        data: {
          items: syntheticSuppliers.map((item) => ({
            ...item,
            contactName: "合成服务端旧值",
          })),
        },
      }),
    );
    await screen.findByRole("button", { name: "选择供应商 合成供应商乙" });
    expect(screen.getByLabelText("公司名称 *")).toHaveValue("合成供应商乙");
    expect(screen.getByLabelText("联系人")).toHaveValue("合成乙新草稿");
    expect(
      screen.getByPlaceholderText("搜索名称、联系人、别名..."),
    ).toHaveValue("合成供应商乙");
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("cancelled creation cannot replace the new draft when its save completes", async () => {
    const created = {
      ...syntheticSuppliers[0],
      id: "synthetic-created",
      name: "合成已提交供应商",
    };
    const pending = deferred<{ data: typeof created }>();
    mockCreate.mockReturnValue(pending.promise);
    mockGetAll
      .mockResolvedValueOnce({ data: { items: syntheticSuppliers } })
      .mockResolvedValue({ data: { items: [...syntheticSuppliers, created] } });
    const user = userEvent.setup();
    render(<SuppliersPage />);
    await screen.findByRole("button", { name: "选择供应商 合成供应商甲" });
    await user.type(screen.getByLabelText("公司名称 *"), created.name);
    await user.click(screen.getByRole("button", { name: "创建供应商" }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "取消并新建" }));
    await user.type(screen.getByLabelText("公司名称 *"), "合成新草稿");
    await act(async () => pending.resolve({ data: created }));
    await waitFor(() => expect(mockGetAll).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("公司名称 *")).toHaveValue("合成新草稿");
    expect(screen.getByText("新建档案")).toBeInTheDocument();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("blocks a second submit event while the same save is pending", async () => {
    const pending = deferred<{ data: (typeof syntheticSuppliers)[number] }>();
    mockUpdate.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<SuppliersPage />);
    await user.click(
      await screen.findByRole("button", { name: "选择供应商 合成供应商甲" }),
    );
    const form = screen.getByLabelText("公司名称 *").closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ data: syntheticSuppliers[0] }));
  });

  it("ignores the old save error after cancel and reselecting the same record", async () => {
    const pending = deferred<{ data: (typeof syntheticSuppliers)[number] }>();
    mockUpdate.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<SuppliersPage />);
    await user.click(
      await screen.findByRole("button", { name: "选择供应商 合成供应商甲" }),
    );
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "取消并新建" }));
    await user.click(
      screen.getByRole("button", { name: "选择供应商 合成供应商甲" }),
    );
    await user.clear(screen.getByLabelText("联系人"));
    await user.type(screen.getByLabelText("联系人"), "合成重开草稿");
    await act(async () => pending.reject(new Error("synthetic late failure")));
    expect(screen.getByLabelText("联系人")).toHaveValue("合成重开草稿");
    expect(mockToastError).not.toHaveBeenCalled();
  });
});

describe("supplier catalog identity and deletion sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Archiving is ADMIN/PURCHASE only (server enforces the same).
    useAuthStore.setState({
      user: { id: "synthetic-purchase", role: Role.PURCHASE } as never,
    });
    mockGetAll
      .mockReset()
      .mockResolvedValue({ data: { items: syntheticSuppliers } });
    mockUpdate.mockReset().mockResolvedValue({ data: syntheticSuppliers[0] });
    mockCreate.mockReset();
    mockDelete.mockReset();
  });

  it.each([Role.SALES, Role.FINANCE, Role.WAREHOUSE])(
    "%s does not see the archive button",
    async (role) => {
      useAuthStore.setState({ user: { id: "synthetic", role } as never });
      render(<SuppliersPage />);
      await screen.findByRole("button", { name: "选择供应商 合成供应商甲" });
      expect(
        screen.queryByRole("button", { name: "归档当前" }),
      ).not.toBeInTheDocument();
    },
  );

  it.each([Role.PURCHASE, Role.SALES, Role.FINANCE, Role.WAREHOUSE])(
    "%s does not see the permanent delete button",
    async (role) => {
      useAuthStore.setState({ user: { id: "synthetic", role } as never });
      render(<SuppliersPage />);
      await screen.findByRole("button", { name: "选择供应商 合成供应商甲" });
      expect(
        screen.queryByRole("button", { name: "永久删除" }),
      ).not.toBeInTheDocument();
    },
  );

  it("ADMIN permanent delete lists counts and needs the typed name before sending the preview token", async () => {
    useAuthStore.setState({
      user: { id: "synthetic-admin", role: Role.ADMIN } as never,
    });
    mockHardPreview.mockResolvedValue({
      data: {
        counts: { contracts: 3, items: 7 },
        blockers: [],
        canDelete: true,
        confirmToken: "synthetic-token",
      },
    });
    mockHardDelete.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<SuppliersPage />);
    await user.click(
      await screen.findByRole("button", { name: "选择供应商 合成供应商甲" }),
    );
    await user.click(screen.getByRole("button", { name: "永久删除" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("采购合同");
    expect(dialog).toHaveTextContent("3");
    const confirmButton = within(dialog).getByRole("button", {
      name: "永久删除",
    });
    expect(confirmButton).toBeDisabled();
    await user.type(
      within(dialog).getByLabelText("输入供应商名称确认"),
      "合成供应商甲",
    );
    await user.click(confirmButton);
    await waitFor(() =>
      expect(mockHardDelete).toHaveBeenCalledExactlyOnceWith(
        "synthetic-a",
        "synthetic-token",
      ),
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("供应商已永久删除");
  });

  it("blocked permanent delete shows the reason and cannot be confirmed", async () => {
    useAuthStore.setState({
      user: { id: "synthetic-admin", role: Role.ADMIN } as never,
    });
    mockHardPreview.mockResolvedValue({
      data: {
        counts: { contracts: 1 },
        blockers: ["存在 2 条付款/应付核销记录"],
        canDelete: false,
        confirmToken: null,
      },
    });
    const user = userEvent.setup();
    render(<SuppliersPage />);
    await user.click(
      await screen.findByRole("button", { name: "选择供应商 合成供应商甲" }),
    );
    await user.click(screen.getByRole("button", { name: "永久删除" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("存在 2 条付款/应付核销记录");
    expect(
      within(dialog).getByRole("button", { name: "永久删除" }),
    ).toBeDisabled();
    expect(mockHardDelete).not.toHaveBeenCalled();
  });

  it("a refreshed catalog omitting the selected record cannot turn its draft into creation", async () => {
    mockGetAll
      .mockResolvedValueOnce({ data: { items: syntheticSuppliers } })
      .mockResolvedValueOnce({ data: { items: [] } });
    const user = userEvent.setup();
    render(<SuppliersPage />);
    await user.click(
      await screen.findByRole("button", { name: "选择供应商 合成供应商甲" }),
    );
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    await screen.findByText("暂无供应商");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存修改" })).toBeEnabled(),
    );
    await user.type(screen.getByLabelText("联系人"), "合成后续草稿");
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockUpdate.mock.calls.map(([id]) => id)).toEqual([
      "synthetic-a",
      "synthetic-a",
    ]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("late deletion cannot clear a newer selected supplier draft", async () => {
    const pending = deferred<{ data: null }>();
    mockDelete.mockReturnValue(pending.promise);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<SuppliersPage />);
    await user.click(
      await screen.findByRole("button", { name: "选择供应商 合成供应商甲" }),
    );
    await user.click(screen.getByRole("button", { name: "归档当前" }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    await user.click(
      screen.getByRole("button", { name: "选择供应商 合成供应商乙" }),
    );
    await user.type(screen.getByLabelText("联系人"), "合成保留草稿");
    await act(async () => pending.resolve({ data: null }));
    expect(screen.getByLabelText("公司名称 *")).toHaveValue("合成供应商乙");
    expect(screen.getByLabelText("联系人")).toHaveValue(
      "合成乙联系人合成保留草稿",
    );
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledExactlyOnceWith("synthetic-a");
    confirm.mockRestore();
  });
});
