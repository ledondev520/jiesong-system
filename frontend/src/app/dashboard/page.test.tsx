/**
 * Input: 首页、router、合成待办响应（按角色）
 * Output: 各角色待办展示、BOSS 数字、失败重试与快捷入口测试结果
 * Pos: 前端首页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardPage from "./page";
import { Role } from "@/types";
import type { DashboardTodos } from "@/services/dashboardTodos.service";

const mockPush = vi.fn();
const mockGet = vi.fn();
let mockRole: Role = Role.ADMIN;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/store/auth.store", () => ({
  useAuthStore: () => ({
    user: { id: "u-1", name: "合成用户", role: mockRole },
  }),
}));

vi.mock("@/lib/hooks/useBusinessReadOnly", () => ({
  BusinessWrite: ({ children }: { children: React.ReactNode }) =>
    mockRole === Role.BOSS ? null : <>{children}</>,
}));

vi.mock("@/services/dashboardTodos.service", () => ({
  dashboardTodosService: { get: (...args: unknown[]) => mockGet(...args) },
}));

const item = (
  id: string,
  contractNo: string,
  amount: number | null = null,
) => ({
  id,
  contractNo,
  party: "合成供应商",
  amount,
  date: null,
});

const respond = (data: DashboardTodos) =>
  mockGet.mockResolvedValue({ code: 200, message: "ok", data });

describe("DashboardPage 待办首页", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockGet.mockReset();
    mockRole = Role.ADMIN;
  });

  it("PURCHASE：只展示后端返回的列表，金额按币种格式化并链接详情", async () => {
    mockRole = Role.PURCHASE;
    respond({
      role: "PURCHASE",
      lists: {
        ordersToPurchase: {
          label: "订单待采购",
          count: 7,
          items: [item("s-1", "EXP-001", 1200)],
        },
        paymentsDue: {
          label: "待付款",
          count: 1,
          items: [item("p-1", "CG-001", 600)],
        },
      },
    });
    render(<DashboardPage />);

    expect(await screen.findByText("订单待采购")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("$1,200")).toBeInTheDocument();
    expect(screen.getByText("¥600")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "EXP-001" })).toHaveAttribute(
      "href",
      "/dashboard/sales/s-1",
    );
    expect(screen.getByRole("link", { name: "CG-001" })).toHaveAttribute(
      "href",
      "/dashboard/purchase/p-1",
    );
    expect(screen.queryByText("可申报退税")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("关键数字")).not.toBeInTheDocument();
  });

  it("BOSS：显示应收/应付/本月毛利及口径说明，不显示写入口", async () => {
    mockRole = Role.BOSS;
    respond({
      role: "BOSS",
      lists: {
        overdueReceivables: {
          label: "逾期未收款",
          count: 0,
          items: [],
        },
      },
      figures: {
        receivable: 5000,
        payable: 600,
        monthGrossProfit: null,
        definitions: {
          receivable: "应收口径说明",
          payable: "已生效采购合同未付余额，草稿/已取消不计",
          monthGrossProfit: "毛利口径说明",
        },
      },
    });
    render(<DashboardPage />);

    const figures = await screen.findByLabelText("关键数字");
    expect(within(figures).getByText("$5,000")).toBeInTheDocument();
    expect(within(figures).getByText("¥600")).toBeInTheDocument();
    expect(within(figures).getByText("—")).toBeInTheDocument();
    expect(within(figures).getByText(/草稿\/已取消不计/)).toBeInTheDocument();
    expect(screen.getByText("全部处理完毕")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /新建采购合同/ }),
    ).not.toBeInTheDocument();
  });

  it("没有任何待办列表时给出空态", async () => {
    respond({ role: "WAREHOUSE", lists: {} });
    render(<DashboardPage />);
    expect(await screen.findByText("暂无待办。")).toBeInTheDocument();
  });

  it("读取失败显示错误并可重试，不冒充没有待办", async () => {
    mockGet.mockRejectedValueOnce(new Error("synthetic"));
    mockGet.mockResolvedValueOnce({
      code: 200,
      message: "ok",
      data: { role: "ADMIN", lists: {} },
    });
    const user = userEvent.setup();
    render(<DashboardPage />);

    expect(await screen.findByText("待办加载失败")).toBeInTheDocument();
    expect(screen.queryByText("暂无待办。")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("暂无待办。")).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("快捷入口跳转到对应路径", async () => {
    respond({ role: "ADMIN", lists: {} });
    const user = userEvent.setup();
    render(<DashboardPage />);

    await user.click(
      await screen.findByRole("button", { name: /新建采购合同/ }),
    );
    expect(mockPush).toHaveBeenCalledWith("/dashboard/purchase/create");
    await user.click(screen.getByRole("button", { name: /新建出口合同/ }));
    expect(mockPush).toHaveBeenCalledWith("/dashboard/sales/create");
  });
});
