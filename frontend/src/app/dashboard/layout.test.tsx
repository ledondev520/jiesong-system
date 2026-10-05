/**
 * Input: DashboardLayout、认证状态仓库、路由能力
 * Output: dashboard 布局渲染与重定向逻辑测试
 * Pos: 前端路由布局测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setAuthToken, clearAuthToken } from "@/lib/auth-token";
import userEvent from "@testing-library/user-event";
import { setBrowserCsrf } from "@/lib/browser-session";
import DashboardLayout from "./layout";
const restoreSession = vi.hoisted(() => vi.fn());
vi.mock("@/services/auth.service", () => ({
  authService: { restoreSession, logout: vi.fn() },
}));
const mocks = vi.hoisted(() => {
  const replace = vi.fn();
  const authState = { isAuthenticated: true, user: { role: "ADMIN" } };
  let hasHydrated = true;
  let hydrationCallback: (() => void) | null = null;
  let pathname = "/dashboard";

  const useAuthStore = ((selector: (state: typeof authState) => unknown) =>
    selector(authState)) as {
    (selector: (state: typeof authState) => unknown): unknown;
    persist?: {
      hasHydrated: () => boolean;
      onFinishHydration: (callback: () => void) => () => void;
    };
  };

  useAuthStore.persist = {
    hasHydrated: () => hasHydrated,
    onFinishHydration: (callback: () => void) => {
      hydrationCallback = callback;
      return () => {
        hydrationCallback = null;
      };
    },
  };

  return {
    replace,
    authState,
    useAuthStore,
    setPathname: (value: string) => {
      pathname = value;
    },
    getPathname: () => pathname,
    setHasHydrated: (value: boolean) => {
      hasHydrated = value;
    },
    getHydrationCallback: () => hydrationCallback,
    resetHydrationCallback: () => {
      hydrationCallback = null;
    },
  };
});

vi.mock("@/store/auth.store", () => ({
  useAuthStore: mocks.useAuthStore,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
    push: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => mocks.getPathname(),
}));

vi.mock("@/components/layout/Sidebar", () => ({
  Sidebar: () => <div>SidebarMock</div>,
}));

vi.mock("@/components/layout/Header", () => ({
  Header: () => <div>HeaderMock</div>,
}));

describe("DashboardLayout", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    restoreSession.mockReset();
    setBrowserCsrf(null);
    mocks.authState.isAuthenticated = true;
    mocks.authState.user.role = "ADMIN";
    mocks.setPathname("/dashboard");
    mocks.setHasHydrated(true);
    mocks.resetHydrationCallback();
    sessionStorage.clear();
    clearAuthToken();
    setAuthToken("synthetic-current-token");
  });

  it("已登录时渲染布局框架与页面内容", () => {
    render(
      <DashboardLayout>
        <div>页面内容</div>
      </DashboardLayout>,
    );

    expect(screen.getByText("SidebarMock")).toBeInTheDocument();
    expect(screen.getByText("HeaderMock")).toBeInTheDocument();
    expect(screen.getByText("页面内容")).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("未登录且无持久化认证时跳转登录页", async () => {
    mocks.authState.isAuthenticated = false;

    render(
      <DashboardLayout>
        <div>页面内容</div>
      </DashboardLayout>,
    );

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/login");
    });
  });

  it("未登录但等待持久化认证同步时不渲染保护内容", async () => {
    mocks.authState.isAuthenticated = false;
    sessionStorage.setItem(
      "auth-storage",
      JSON.stringify({
        state: {
          isAuthenticated: true,
          token: "persisted-token",
          user: { id: "u-1" },
        },
      }),
    );

    render(
      <DashboardLayout>
        <div>页面内容</div>
      </DashboardLayout>,
    );

    expect(screen.queryByText("页面内容")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("未完成 hydration 但已登录时仍渲染内容（避免闪烁）", async () => {
    // 已登录时，即使 hydration 未完成也直接渲染，避免白屏闪烁
    mocks.authState.isAuthenticated = true;
    mocks.setHasHydrated(false);

    render(
      <DashboardLayout>
        <div>页面内容</div>
      </DashboardLayout>,
    );

    // 已认证时不应阻塞渲染
    await waitFor(() => {
      expect(screen.getByText("页面内容")).toBeInTheDocument();
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("未完成 hydration 且未登录时不渲染内容", async () => {
    mocks.authState.isAuthenticated = false;
    mocks.setHasHydrated(false);

    const { queryByText } = render(
      <DashboardLayout>
        <div>页面内容</div>
      </DashboardLayout>,
    );

    // 未认证且未 hydrated 时，返回 null
    expect(queryByText("页面内容")).toBeNull();
  });

  it("非管理员进入系统管理路径时跳回默认 dashboard 落点", async () => {
    mocks.authState.user.role = "SALES";
    mocks.setPathname("/dashboard/settings");

    render(
      <DashboardLayout>
        <div>页面内容</div>
      </DashboardLayout>,
    );

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
    });
  });
  it("Cookie恢复期间不渲染保护内容或使用旧角色重定向，确认后才显示", async () => {
    clearAuthToken();
    mocks.authState.user.role = "SALES";
    mocks.setPathname("/dashboard/settings");
    let finish!: (value: unknown) => void;
    restoreSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const login = vi.fn();
    Object.assign(mocks.useAuthStore, {
      getState: () => ({ login, logout: vi.fn() }),
    });
    render(
      <DashboardLayout>
        <div>保护内容</div>
      </DashboardLayout>,
    );
    expect(screen.queryByText("保护内容")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    await act(async () => {
      mocks.authState.user.role = "ADMIN";
      setBrowserCsrf("csrf-proof");
      finish({
        code: 200,
        data: { user: { role: "ADMIN" }, csrfToken: "csrf-proof" },
      });
    });
    expect(screen.getByText("保护内容")).toBeInTheDocument();
    expect(login).toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("验证503保留重试入口且不显示保护内容或误报会话失效", async () => {
    clearAuthToken();
    restoreSession.mockRejectedValue({ code: 503 });
    render(
      <DashboardLayout>
        <div>保护内容</div>
      </DashboardLayout>,
    );
    await screen.findByRole("button", { name: "重试" });
    expect(screen.queryByText("保护内容")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    const previous = restoreSession.mock.calls.length;
    await userEvent.setup().click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() =>
      expect(restoreSession.mock.calls.length).toBeGreaterThan(previous),
    );
  });
});
