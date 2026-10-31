/**
 * Input: MobileTabBar、导航配置、认证与 AI 面板 store
 * Output: 手机底栏测试：首页·订单·采购·库存·更多、触控高度、更多面板与 AI 入口
 * Pos: 前端布局组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Role } from "@/types";
import { useAiPanelStore } from "@/store/ai-panel.store";
import { MobileTabBar } from "./MobileTabBar";
import { getMenuNavItems } from "./navigation.config";

const mockPush = vi.fn();
let mockRole: Role = Role.ADMIN;

vi.mock("@/store/auth.store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: { name: "测试用户", username: "tester", role: mockRole },
      logout: vi.fn(),
    }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/orders",
  useRouter: () => ({ push: mockPush }),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/services/auth.service", () => ({
  authService: { logout: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const renderBar = () =>
  render(<MobileTabBar visibleItems={getMenuNavItems(mockRole)} />);

beforeEach(() => {
  mockPush.mockReset();
  mockRole = Role.ADMIN;
  useAiPanelStore.setState({ open: false });
});

describe("MobileTabBar", () => {
  it("底栏顺序为 首页 · 订单 · 采购 · 库存 · 更多，每个按钮有 56px 触控高度，当前页高亮", () => {
    renderBar();
    const bar = screen.getByRole("navigation", { name: "主导航" });
    const buttons = within(bar).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "首页",
      "订单",
      "采购",
      "库存",
      "更多",
    ]);
    for (const button of buttons)
      expect(button.className).toContain("min-h-[56px]");
    expect(within(bar).getByText("订单").closest("button")).toHaveAttribute(
      "aria-current",
      "page",
    );
    fireEvent.click(within(bar).getByText("采购"));
    expect(mockPush).toHaveBeenCalledWith("/dashboard/purchases");
  });

  it("更多面板进入其余模块；AI 助手从这里点开并关闭面板，只在点按后打开", () => {
    renderBar();
    expect(useAiPanelStore.getState().open).toBe(false);
    fireEvent.click(screen.getByText("更多"));
    const sheet = screen.getByRole("dialog");
    fireEvent.click(within(sheet).getByText("AI 助手"));
    expect(useAiPanelStore.getState().open).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("BOSS 的更多面板没有 AI 助手入口", () => {
    mockRole = Role.BOSS;
    renderBar();
    fireEvent.click(screen.getByText("更多"));
    expect(
      within(screen.getByRole("dialog")).queryByText("AI 助手"),
    ).not.toBeInTheDocument();
  });
});
