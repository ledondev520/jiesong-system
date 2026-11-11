/**
 * Input: 用户管理页面、userService、UserDialog、toast
 * Output: 用户管理页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UsersPage from "./page";
import { useAuthStore } from "@/store/auth.store";

const mockGetAll = vi.fn();
const mockDelete = vi.fn();
const mockToastError = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("@/services/user.service", () => ({
  userService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    create: vi.fn(),
    update: vi.fn(),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));


vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

vi.mock("./components/UserDialog", () => ({
  UserDialog: ({
    open,
    onSubmit,
  }: {
    open: boolean;
    onSubmit: (data: { isActive: boolean }) => Promise<void>;
  }) =>
    open ? (
      <div>
        用户弹窗已打开
        <button onClick={() => void onSubmit({ isActive: true })}>
          合成确认开通
        </button>
      </div>
    ) : null,
}));

vi.mock("@/lib/api-cache", () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

describe("UsersPage 交互逻辑", () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockDelete.mockReset();
    mockToastError.mockReset();
    useAuthStore.setState({ user: null });
  });

  it("无数据时展示空态", async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    render(<UsersPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "账号管理" }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("暂无用户")).toBeInTheDocument();
  });

  it("点击新增用户会打开弹窗", async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<UsersPage />);

    await user.click(screen.getByRole("button", { name: /新增用户/ }));
    expect(screen.getByText("用户弹窗已打开")).toBeInTheDocument();
  });

  it("展示头像占位与最后登录时间", async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [
          {
            id: "u-1",
            username: "admin",
            name: "管理员",
            role: "ADMIN",
            isActive: true,
            lastLoginAt: "2026-03-01T10:00:00",
            createdAt: "2026-03-01T09:00:00",
            updatedAt: "2026-03-01T09:00:00",
          },
        ],
      },
    });

    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText("管理员").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText("admin").length).toBeGreaterThan(0);
      expect(screen.getAllByText("2026-03-01 10:00").length).toBeGreaterThan(0);
    });
  });

  it("未开通筛选覆盖后续 API 页，核对入口不会直接开通", async () => {
    const active = {
      id: "active",
      username: "active@example.com",
      name: "已开通用户",
      role: "SALES",
      isActive: true,
    };
    const inactive = {
      id: "inactive",
      username: "pending@example.com",
      name: "待核对用户",
      role: "SALES",
      isActive: false,
    };
    mockGetAll.mockImplementation(({ page }) =>
      Promise.resolve({
        data: {
          items: page === 1 ? [active] : [inactive],
          pagination: { totalPages: 2 },
        },
      }),
    );
    const user = userEvent.setup();
    render(<UsersPage />);
    await screen.findByRole("button", { name: "未开通/已停用（1）" });
    expect(mockGetAll).toHaveBeenCalledWith({ page: 2, pageSize: 100 });
    await user.click(
      screen.getByRole("button", { name: "未开通/已停用（1）" }),
    );
    expect(screen.queryByText("已开通用户")).not.toBeInTheDocument();
    expect(screen.getAllByText("待核对用户").length).toBeGreaterThan(0);
    expect(screen.getByText(/此列表也包含已停用账号/)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "核对并开通 pending@example.com" }),
    );
    expect(screen.getByText("用户弹窗已打开")).toBeInTheDocument();
  });

  it("加载失败时提示错误", async () => {
    mockGetAll.mockRejectedValue(new Error("load failed"));
    render(<UsersPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("加载用户失败");
    });
  });
  it("末页唯一未开通账号保存后回到有效页，仍展示剩余账号", async () => {
    const accounts = Array.from({ length: 21 }, (_, index) => ({
      id: `p${index}`,
      username: `p${index}@example.com`,
      name: `待核对${String(index).padStart(2, "0")}`,
      role: "SALES",
      isActive: false,
    }));
    mockGetAll
      .mockResolvedValueOnce({ data: { items: accounts } })
      .mockResolvedValue({ data: { items: accounts.slice(0, 20) } });
    const user = userEvent.setup();
    render(<UsersPage />);
    await user.click(
      await screen.findByRole("button", { name: "未开通/已停用（21）" }),
    );
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await user.click(
      screen.getByRole("button", { name: "核对并开通 p20@example.com" }),
    );
    await user.click(screen.getByRole("button", { name: "合成确认开通" }));
    await screen.findByRole("button", { name: "未开通/已停用（20）" });
    expect(screen.getAllByText("待核对00").length).toBeGreaterThan(0);
    expect(
      screen.queryByText("没有匹配的未开通/已停用账号"),
    ).not.toBeInTheDocument();
  });

  describe("B43 账号列表", () => {
    const account = (
      id: string,
      role: string,
      isActive: boolean,
      name = `账号${id}`,
    ) => ({ id, username: `${id}@example.com`, name, role, isActive });
    // 合成数据：6 个账号 = 4 在用（含 2 个管理员）+ 2 已停用（含 1 个管理员）
    const accounts = [
      account("me", "ADMIN", true, "当前用户"),
      account("a2", "ADMIN", true),
      account("s1", "SALES", true),
      account("f1", "FINANCE", true),
      account("d1", "ADMIN", false, "停用管理员"),
      account("d2", "SALES", false, "停用销售"),
    ];

    beforeEach(() => {
      mockGetAll.mockResolvedValue({ data: { items: accounts } });
      useAuthStore.setState({ user: { id: "me", role: "ADMIN" } as never });
    });

    it("默认只列在用账号；停用账号在「未开通/已停用」或「全部」里，置灰并如实标「未开通/已停用」", async () => {
      const user = userEvent.setup();
      render(<UsersPage />);
      await screen.findByRole("button", { name: "在用账号（4）" });
      expect(screen.getAllByText("账号s1").length).toBeGreaterThan(0);
      expect(screen.queryByText("停用管理员")).toBeNull();
      expect(screen.queryByText("未开通/已停用")).toBeNull();

      await user.click(screen.getByRole("button", { name: "全部账号（6）" }));
      // 手机卡片在前、桌面表格在后：取表格行
      const rowOf = (text: string) =>
        screen
          .getAllByText(text)
          .map((el) => el.closest("tr"))
          .find(Boolean)!;
      const row = rowOf("停用管理员");
      expect(row).toHaveClass("opacity-60");
      // 注册后尚未开通的同事同样是 isActive=false，不能把他们标成「已停用」
      expect(within(row).getByText("未开通/已停用")).toBeInTheDocument();
      expect(within(row).queryByText("已停用")).toBeNull();
      const activeRow = rowOf("账号s1");
      expect(activeRow).not.toHaveClass("opacity-60");

      await user.click(
        screen.getByRole("button", { name: "未开通/已停用（2）" }),
      );
      expect(screen.queryByText("账号s1")).toBeNull();
      expect(screen.getAllByText("停用销售").length).toBeGreaterThan(0);
    });

    it("头部统计与表格同源：总数/在用/已停用/在用管理员，加载中显示「—」不先闪 0", async () => {
      let resolve!: (value: unknown) => void;
      mockGetAll.mockReturnValueOnce(new Promise((r) => (resolve = r)));
      render(<UsersPage />);
      const stats = screen.getByTestId("user-stats");
      expect(stats).toHaveTextContent("共 — 个账号");
      expect(stats).not.toHaveTextContent("共 0");
      await act(async () => resolve({ data: { items: accounts } }));
      await waitFor(() =>
        expect(stats).toHaveTextContent(
          "共 6 个账号 · 在用 4 · 已停用 2 · 在用管理员 2 · 当前列表显示 4 个",
        ),
      );
    });

    it("当前登录账号没有删除入口并标明「当前账号」，其他账号有", async () => {
      render(<UsersPage />);
      await screen.findByRole("button", { name: "在用账号（4）" });
      expect(screen.getAllByText("当前账号").length).toBeGreaterThan(0);
      expect(
        screen.queryByRole("button", { name: "删除 me@example.com" }),
      ).toBeNull();
      expect(
        screen.getAllByRole("button", { name: "删除 s1@example.com" }).length,
      ).toBeGreaterThan(0);
    });

    it("删除先弹确认框并点名账号；取消不删除，确认才调用并从列表消失", async () => {
      mockDelete.mockResolvedValue({});
      const user = userEvent.setup();
      render(<UsersPage />);
      await screen.findByRole("button", { name: "在用账号（4）" });
      await user.click(
        screen.getAllByRole("button", { name: "删除 s1@example.com" })[0],
      );
      const dialog = await screen.findByRole("alertdialog");
      expect(dialog).toHaveTextContent("账号s1");
      expect(dialog).toHaveTextContent("s1@example.com");
      expect(dialog).toHaveTextContent("账号开通");
      await user.click(within(dialog).getByRole("button", { name: "取消" }));
      expect(mockDelete).not.toHaveBeenCalled();

      await user.click(
        screen.getAllByRole("button", { name: "删除 s1@example.com" })[0],
      );
      await user.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", {
          name: "确认删除",
        }),
      );
      await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("s1"));
      await waitFor(() => expect(screen.queryByText("账号s1")).toBeNull());
    });
  });
});
