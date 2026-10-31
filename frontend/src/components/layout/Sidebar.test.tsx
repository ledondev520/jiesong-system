/**
 * Input: Sidebar组件
 * Output: Sidebar组件单元测试
 * Pos: 前端布局组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Role } from "@/types";
import { Sidebar } from "./Sidebar";

const mockLogout = vi.fn();
const mockPrefetch = vi.fn();
const mockPush = vi.fn();
let mockPathname = "/dashboard/contracts";

const mockUser = {
  role: Role.ADMIN,
};

vi.mock("@/store/auth.store", () => ({
  useAuthStore: (
    selector: (state: {
      user: typeof mockUser | null;
      logout: () => void;
    }) => unknown,
  ) =>
    selector({
      user: mockUser,
      logout: mockLogout,
    }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    prefetch: mockPrefetch,
    push: mockPush,
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
  }) => {
    return (
      <a
        href={href}
        data-prefetch={prefetch === undefined ? "auto" : String(prefetch)}
        {...props}
      >
        {children}
      </a>
    );
  },
}));

describe("Sidebar", () => {
  beforeEach(() => {
    mockLogout.mockReset();
    mockPrefetch.mockReset();
    mockPush.mockReset();
    mockUser.role = Role.ADMIN;
    mockPathname = "/dashboard/contracts";
  });

  it("渲染分组导航并标记当前路由", () => {
    const { getByText } = render(<Sidebar />);

    // 当前路由是 /dashboard/contracts，对应 "采购"
    const current = getByText("采购").closest("a");
    expect(current?.className.includes("bg-sidebar-accent")).toBe(true);
    for (const label of [
      "首页",
      "业务",
      "出口订单",
      "库存",
      "单证与退税",
      "财务",
      "资料",
      "供应商",
      "商品",
      "HS 编码",
      "设置",
    ]) {
      expect(getByText(label)).toBeInTheDocument();
    }
  });

  it("不渲染 AI 助手菜单项，也不渲染尚未上线的报价与客户与门店", () => {
    const { queryByText } = render(<Sidebar />);

    expect(queryByText("AI 助手")).not.toBeInTheDocument();
    expect(queryByText("报价")).not.toBeInTheDocument();
    expect(queryByText("客户与门店")).not.toBeInTheDocument();
    expect(queryByText("仓储物流")).not.toBeInTheDocument();
  });

  it("菜单链接指向现有 URL", () => {
    const { getByText } = render(<Sidebar />);

    expect(getByText("出口订单").closest("a")).toHaveAttribute(
      "href",
      "/dashboard/sales",
    );
    expect(getByText("库存").closest("a")).toHaveAttribute(
      "href",
      "/dashboard/inventory-status",
    );
    expect(getByText("商品").closest("a")).toHaveAttribute(
      "href",
      "/dashboard/products",
    );
    expect(getByText("设置").closest("a")).toHaveAttribute(
      "href",
      "/dashboard/settings",
    );
  });

  it("侧边栏不再渲染退出登录按钮", () => {
    const { queryByRole } = render(<Sidebar />);
    expect(queryByRole("button", { name: "退出登录" })).not.toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("设置路由下设置菜单激活并展开子页面", () => {
    mockPathname = "/dashboard/settings/users";
    const { getByText } = render(<Sidebar />);

    expect(
      getByText("设置").closest("a")?.className.includes("bg-sidebar-accent"),
    ).toBe(true);
    expect(getByText("账号管理").closest("a")).toHaveAttribute(
      "href",
      "/dashboard/settings/users",
    );
  });

  it("单证与退税下报关单与出口退税分别激活", () => {
    mockPathname = "/dashboard/customs-declarations/create";
    const { getByText } = render(<Sidebar />);

    expect(getByText("报关单").closest("a")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(getByText("出口退税").closest("a")).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("非管理员角色不显示设置入口", () => {
    mockUser.role = Role.SALES;
    mockPathname = "/dashboard/settings";
    const { queryByText } = render(<Sidebar />);
    expect(queryByText("设置")).not.toBeInTheDocument();
  });

  it("PURCHASE 仍可从资料看到商品", () => {
    mockUser.role = Role.PURCHASE;
    const { getByText } = render(<Sidebar />);
    expect(getByText("商品").closest("a")).toHaveAttribute(
      "href",
      "/dashboard/products",
    );
  });

  it("初始渲染和空闲阶段不批量预取业务路由", () => {
    vi.useFakeTimers();
    render(<Sidebar />);
    vi.runOnlyPendingTimers();

    expect(mockPrefetch).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
