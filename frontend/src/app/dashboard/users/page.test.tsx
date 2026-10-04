/**
 * Input: 用户管理页面、userService、UserDialog、toast
 * Output: 用户管理页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UsersPage from "./page";

const mockGetAll = vi.fn();
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
    delete: vi.fn(),
  },
}));

vi.mock("@/services/agent.service", () => ({
  agentService: { getAll: vi.fn().mockResolvedValue({ data: { items: [] } }) },
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
    mockToastError.mockReset();
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
});
