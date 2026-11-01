/**
 * Input: 根路由页面（公开落地页）、router、auth store
 * Output: 落地页内容与登录入口；已登录者才被转去 /dashboard，未登录访客留在落地页
 * Pos: 前端入口页面测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import RootPage from "./page";

const mockPush = vi.fn();
const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  hasHydrated: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: (...args: unknown[]) => mockPush(...args),
  }),
}));

vi.mock("@/store/auth.store", () => {
  type Selector<T> = (state: { isAuthenticated: boolean }) => T;

  const useAuthStore = ((selector: Selector<unknown>) => {
    return selector({ isAuthenticated: authState.isAuthenticated });
  }) as ((selector: Selector<unknown>) => unknown) & {
    persist: { hasHydrated: () => boolean };
  };

  useAuthStore.persist = {
    hasHydrated: () => authState.hasHydrated,
  };

  return { useAuthStore };
});

describe("RootPage 公开落地页", () => {
  beforeEach(() => {
    mockPush.mockReset();
    authState.isAuthenticated = false;
    authState.hasHydrated = false;
  });

  it("hydration 未完成时不触发跳转", async () => {
    authState.isAuthenticated = true;
    render(<RootPage />);

    await waitFor(() => {
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it("已登录用户跳转到 dashboard", async () => {
    authState.hasHydrated = true;
    authState.isAuthenticated = true;

    render(<RootPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("未登录访客留在落地页，不再被转去 /login", async () => {
    authState.hasHydrated = true;
    authState.isAuthenticated = false;

    render(<RootPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "从报价到退税，出口业务一站走完",
      }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it("只有一个 h1，且有 header / main / footer 地标", () => {
    render(<RootPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("登录与申请账号入口指向 /login 和 /register；页脚带找回密码", () => {
    render(<RootPage />);
    for (const link of screen.getAllByRole("link", { name: /^登录/ })) {
      expect(link).toHaveAttribute("href", "/login");
    }
    for (const link of screen.getAllByRole("link", { name: "申请账号" })) {
      expect(link).toHaveAttribute("href", "/register");
    }
    expect(screen.getByRole("link", { name: "忘记密码" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("业务链八个环节、三张功能卡都在", () => {
    render(<RootPage />);
    for (const step of [
      "报价",
      "出口订单",
      "采购",
      "收货入库",
      "装柜发运",
      "单证报关",
      "发票与财务",
      "出口退税",
    ]) {
      expect(screen.getAllByText(step).length).toBeGreaterThan(0);
    }
    for (const title of ["全程可追溯", "权限分明", "AI 助手随页可用"]) {
      expect(
        screen.getByRole("heading", { level: 3, name: title }),
      ).toBeInTheDocument();
    }
  });

  it("内容规则：所有链接与资源都是站内地址，没有外部字体、脚本或框架", () => {
    const { container } = render(<RootPage />);
    for (const el of container.querySelectorAll("[src], [href]")) {
      const url = el.getAttribute("src") ?? el.getAttribute("href") ?? "";
      expect(url, el.outerHTML.slice(0, 80)).toMatch(/^\//);
    }
    expect(container.querySelectorAll("script, iframe, link")).toHaveLength(0);
  });

  it("权限卡片只声称后端真实做到的：账簿明细与凭证仅财务/管理员，不声称整个财务数据", () => {
    render(<RootPage />);
    expect(
      screen.getByText(/账簿明细与财务凭证仅财务和管理员可见/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/财务数据只对财务和管理员可见/)).toBeNull();
  });

  it("功能卡的 h3 在一个 h2 之下（屏幕阅读器标题层级不跳级）", () => {
    render(<RootPage />);
    expect(
      screen.getByRole("heading", { level: 2, name: "系统特点" }),
    ).toBeInTheDocument();
  });
});
