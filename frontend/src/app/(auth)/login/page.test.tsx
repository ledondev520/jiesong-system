/**
 * Input: Login页面、router、auth store、axios API
 * Output: 登录交互、键盘顺序与密码校验语义的回归测试结果
 * Pos: 前端认证页面交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  clearRegistrationReceipt,
  saveRegistrationReceipt,
} from "@/lib/registration-receipt";
import LoginPage from "./page";
import {
  LEGACY_AUTH_CLEANUP_VERSION,
  LEGACY_AUTH_CLEANUP_VERSION_KEY,
} from "@/lib/legacy-auth-cleanup";

const mockPush = vi.fn();
const mockRestoreSession = vi.fn();
const mockRouter = { push: mockPush, replace: mockPush };
const mockAuthStoreLogin = vi.fn();
const mockAuthServiceLogin = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => ({
    get: vi.fn(() => null),
  }),
}));

vi.mock("@/store/auth.store", () => ({
  useAuthStore: (
    selector: (state: {
      login: (user: unknown, token: string) => void;
    }) => unknown,
  ) =>
    selector({
      login: mockAuthStoreLogin,
    }),
}));

vi.mock("@/services/auth.service", () => ({
  authService: {
    login: (...args: unknown[]) => mockAuthServiceLogin(...args),
    restoreSession: (...args: unknown[]) => mockRestoreSession(...args),
  },
}));

describe("LoginPage 交互逻辑", () => {
  it("只显示本标签提交回执，不查询任意账号状态", async () => {
    saveRegistrationReceipt("applicant@example.com");
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "登录" })).toBeEnabled(),
    );
    expect(
      screen.getByRole("region", { name: "注册申请回执" }),
    ).toHaveTextContent("不是实时审核结果");
    expect(mockAuthServiceLogin).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    mockPush.mockReset();
    mockRestoreSession.mockReset().mockRejectedValue({ code: 401 });
    mockAuthStoreLogin.mockReset();
    mockAuthServiceLogin.mockReset();
    clearRegistrationReceipt();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("默认渲染登录表单，且未登录过时不展示快捷登录按钮", async () => {
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "登录" })).toBeEnabled(),
    );

    expect(
      screen.getByText("请输入账号密码登录捷淞进销存系统。"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("用户名或邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /一键登录/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("快捷登录")).not.toBeInTheDocument();
    expect(screen.queryByText(/测试阶段账号/)).not.toBeInTheDocument();
    expect(screen.queryByText(/开启快捷登录/)).not.toBeInTheDocument();
    expect(screen.queryByText(/你已开启快捷登录/)).not.toBeInTheDocument();
  });

  it("密码标签和错误说明关联实际输入框", async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "登录" })).toBeEnabled(),
    );
    const password = screen.getByLabelText("密码");
    const label = Array.from(container.querySelectorAll("label")).find(
      (element) => element.textContent === "密码",
    );
    expect(label).toHaveAttribute("for", password.id);
    await user.click(label!);
    expect(password).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "登录" }));
    const error = await screen.findByText("请输入密码");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password.getAttribute("aria-describedby")?.split(" ")).toContain(
      error.id,
    );
    expect(mockAuthServiceLogin).not.toHaveBeenCalled();
    await user.type(password, "local-test-only");
    await waitFor(() =>
      expect(password).toHaveAttribute("aria-invalid", "false"),
    );
  });

  it("键盘可切换密码显示，随后每个导航入口只有一个焦点", async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "登录" })).toBeEnabled(),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "登录" })).toBeEnabled(),
    );
    await user.tab();
    expect(screen.getByLabelText("用户名或邮箱")).toHaveFocus();
    await user.tab();
    const password = screen.getByLabelText("密码");
    expect(password).toHaveFocus();
    await user.tab();
    const toggle = screen.getByRole("button", { name: "显示密码" });
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.keyboard("{Enter}");
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "隐藏密码" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.keyboard(" ");
    expect(password).toHaveAttribute("type", "password");
    expect(mockAuthServiceLogin).not.toHaveBeenCalled();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: "保持登录" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "登录" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "立即注册" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "忘记密码" })).toHaveFocus();
    expect(container.querySelector("a button, button a")).toBeNull();
  });

  it("旧版快捷登录资料会被清理，避免继续使用失效密码", async () => {
    localStorage.setItem(
      "jiesong_quick_login_profile",
      JSON.stringify({
        version: 2,
        username: "admin",
        password: "old-password",
        source: "saved",
      }),
    );

    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "登录" })).toBeEnabled(),
    );

    await waitFor(() => {
      expect(localStorage.getItem("jiesong_quick_login_profile")).toBeNull();
      expect(
        screen.queryByRole("button", { name: /一键登录/ }),
      ).not.toBeInTheDocument();
    });
  });

  it("无效快捷登录资料会被清理，避免继续使用缓存密码", async () => {
    localStorage.setItem(
      "jiesong_quick_login_profile",
      JSON.stringify({
        username: "admin",
        password: "old-password",
      }),
    );
    localStorage.setItem(
      "quickLoginProfile",
      JSON.stringify({
        username: "admin",
        password: "old-password",
      }),
    );
    localStorage.setItem(
      "saved_login_profile",
      JSON.stringify({
        username: "admin",
        password: "old-password",
      }),
    );
    localStorage.setItem("quickLoginEnabled", "true");
    localStorage.setItem("quickLoginUsername", "admin");
    localStorage.setItem("quickLoginPassword", "old-password");
    localStorage.setItem("jiesong_quick_login_enabled", "true");
    localStorage.setItem("jiesong_quick_login_password", "old-password");
    localStorage.setItem(
      "saved_login_credentials",
      JSON.stringify({
        username: "admin",
        password: "old-password",
      }),
    );
    localStorage.setItem("jiesong_saved_username", "admin");
    localStorage.setItem(
      "jiesong_saved_credentials",
      JSON.stringify({
        username: "admin",
        password: "old-password",
      }),
    );
    sessionStorage.setItem(
      "quickLoginProfile",
      JSON.stringify({
        username: "admin",
        password: "session-password",
      }),
    );
    sessionStorage.setItem(
      "oneClickLoginCredentials",
      JSON.stringify({
        username: "admin",
        password: "session-password",
      }),
    );

    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "登录" })).toBeEnabled(),
    );

    await waitFor(() => {
      expect(localStorage.getItem("jiesong_quick_login_profile")).toBeNull();
      expect(localStorage.getItem("quickLoginProfile")).toBeNull();
      expect(localStorage.getItem("saved_login_profile")).toBeNull();
      expect(localStorage.getItem("quickLoginEnabled")).toBeNull();
      expect(localStorage.getItem("quickLoginUsername")).toBeNull();
      expect(localStorage.getItem("quickLoginPassword")).toBeNull();
      expect(localStorage.getItem("jiesong_quick_login_enabled")).toBeNull();
      expect(localStorage.getItem("jiesong_quick_login_password")).toBeNull();
      expect(localStorage.getItem("saved_login_credentials")).toBeNull();
      expect(localStorage.getItem("jiesong_saved_username")).toBeNull();
      expect(localStorage.getItem("jiesong_saved_credentials")).toBeNull();
      expect(sessionStorage.getItem("quickLoginProfile")).toBeNull();
      expect(sessionStorage.getItem("oneClickLoginCredentials")).toBeNull();
      expect(localStorage.getItem(LEGACY_AUTH_CLEANUP_VERSION_KEY)).toBe(
        LEGACY_AUTH_CLEANUP_VERSION,
      );
      expect(
        screen.queryByRole("button", { name: /一键登录/ }),
      ).not.toBeInTheDocument();
    });
  });

  it("手动登录成功后清理旧快捷登录资料并跳转工作台", async () => {
    saveRegistrationReceipt("applicant@example.com");
    localStorage.setItem(
      "jiesong_quick_login_profile",
      JSON.stringify({
        version: 2,
        username: "admin",
        password: "old-password",
        source: "saved",
      }),
    );
    mockAuthServiceLogin.mockResolvedValue({
      code: 200,
      data: {
        user: { id: "u1", username: "admin", name: "管理员", role: "ADMIN" },
        token: "token-123",
      },
    });

    const user = userEvent.setup();
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "登录" })).toBeEnabled(),
    );

    await user.type(screen.getByLabelText("用户名或邮箱"), "admin");
    await user.type(screen.getByLabelText("密码"), "123456");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(mockAuthServiceLogin).toHaveBeenCalledWith(
        {
          username: "admin",
          password: "123456",
        },
        expect.any(AbortSignal),
      );
      expect(mockAuthStoreLogin).toHaveBeenCalledWith(
        { id: "u1", username: "admin", name: "管理员", role: "ADMIN" },
        "token-123",
        undefined,
      );
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
      expect(sessionStorage.getItem("jiesong_registration_receipt")).toBeNull();
    });

    expect(localStorage.getItem("jiesong_quick_login_profile")).toBeNull();
  });

  it("旧快捷登录资料不会触发自动登录", async () => {
    localStorage.setItem(
      "jiesong_quick_login_profile",
      JSON.stringify({
        version: 2,
        username: "admin",
        password: "123456",
        source: "saved",
      }),
    );
    mockAuthServiceLogin.mockResolvedValue({
      code: 200,
      data: {
        user: { id: "u1", username: "admin", name: "管理员", role: "ADMIN" },
        token: "token-123",
      },
    });

    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "登录" })).toBeEnabled(),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /一键登录/ }),
      ).not.toBeInTheDocument();
    });
    expect(mockAuthServiceLogin).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("登录失败时展示错误提示", async () => {
    mockAuthServiceLogin.mockRejectedValue(new Error("账号或密码错误"));

    const user = userEvent.setup();
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "登录" })).toBeEnabled(),
    );

    await user.type(screen.getByLabelText("用户名或邮箱"), "admin");
    await user.type(screen.getByLabelText("密码"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByText("账号或密码错误")).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("后端连接失败时提示权威的 3001 端口", async () => {
    mockAuthServiceLogin.mockRejectedValue(new Error("Network Error"));
    const user = userEvent.setup();
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "登录" })).toBeEnabled(),
    );

    await user.type(screen.getByLabelText("用户名或邮箱"), "admin");
    await user.type(screen.getByLabelText("密码"), "123456");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(
      await screen.findByText(
        "后端服务未连接，请先启动 backend 服务（默认端口 3001）",
      ),
    ).toBeInTheDocument();
  });

  it("触发登录限流时展示可操作提示", async () => {
    mockAuthServiceLogin.mockRejectedValue({
      message: "登录尝试过于频繁，请 15 分钟后再试",
      retryAfter: 600,
    });

    const user = userEvent.setup();
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "登录" })).toBeEnabled(),
    );

    await user.type(screen.getByLabelText("用户名或邮箱"), "admin");
    await user.type(screen.getByLabelText("密码"), "123456");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "登录尝试过于频繁，请 10 分钟后再试，或切换账号后重试。",
        ),
      ).toBeInTheDocument();
    });
  });
  it("保持登录默认关闭，主动勾选后仅发送布尔选项", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "登录" })).toBeEnabled(),
    );
    expect(
      screen.getByRole("checkbox", { name: "保持登录" }),
    ).not.toBeChecked();
    expect(screen.getByLabelText("密码")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    await user.type(screen.getByLabelText("用户名或邮箱"), "synthetic");
    await user.type(screen.getByLabelText("密码"), "synthetic-password");
    await user.click(screen.getByRole("checkbox", { name: "保持登录" }));
    mockAuthServiceLogin.mockResolvedValue({
      code: 200,
      data: { user: { id: "new-user" }, token: null, csrfToken: "csrf-proof" },
    });
    await user.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() =>
      expect(mockAuthServiceLogin).toHaveBeenCalledWith(
        {
          username: "synthetic",
          password: "synthetic-password",
          rememberMe: true,
        },
        expect.any(AbortSignal),
      ),
    );
    expect(mockAuthStoreLogin).toHaveBeenCalledWith(
      { id: "new-user" },
      null,
      "csrf-proof",
    );
    expect(
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ).not.toContain("synthetic-password");
  });

  it("服务端有效会话直接恢复且不发送密码或再次登录", async () => {
    mockRestoreSession.mockResolvedValue({
      code: 200,
      data: { user: { id: "restored" }, token: null, csrfToken: "csrf-proof" },
    });
    render(<LoginPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));
    expect(mockAuthStoreLogin).toHaveBeenCalledWith(
      { id: "restored" },
      null,
      "csrf-proof",
    );
    expect(mockAuthServiceLogin).not.toHaveBeenCalled();
  });

  it("登录待完成时阻止重复提交，离开后忽略延迟结果并中止传输", async () => {
    let finish!: (value: unknown) => void;
    mockAuthServiceLogin.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    const view = render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "登录" })).toBeEnabled(),
    );
    await user.type(screen.getByLabelText("用户名或邮箱"), "synthetic");
    await user.type(screen.getByLabelText("密码"), "synthetic-password");
    await user.dblClick(screen.getByRole("button", { name: "登录" }));
    expect(mockAuthServiceLogin).toHaveBeenCalledTimes(1);
    const signal = mockAuthServiceLogin.mock.calls[0][1] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () =>
      finish({
        code: 200,
        data: { user: { id: "late" }, token: null, csrfToken: "csrf-proof" },
      }),
    );
    expect(mockAuthStoreLogin).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("恢复网络失败保留登录表单供重试，不虚报过期", async () => {
    mockRestoreSession.mockRejectedValue(new Error("network unavailable"));
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "登录" })).toBeEnabled(),
    );
    expect(screen.getByText("暂时无法确认登录状态，请重试登录")).toBeVisible();
    expect(
      screen.queryByText("登录会话已过期，请重新登录"),
    ).not.toBeInTheDocument();
  });
});
