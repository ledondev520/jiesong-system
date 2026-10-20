import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ForgotPasswordPage from "./page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  reset: vi.fn(),
  send: vi.fn(),
  logout: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/services/auth.service", () => ({
  authService: {
    resetPassword: mocks.reset,
    sendResetPasswordCode: mocks.send,
  },
}));
vi.mock("@/store/auth.store", () => ({
  useAuthStore: { getState: () => ({ logout: mocks.logout }) },
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const fill = async (password = "test-only-new-password") => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("绑定邮箱"), "RECOVERY@EXAMPLE.COM");
  await user.type(screen.getByLabelText("邮箱验证码"), "123456");
  await user.type(screen.getByLabelText("新密码"), password);
  await user.type(screen.getByLabelText("确认新密码"), password);
  return user;
};
describe("email password recovery", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });
  it("requires bound email and OTP; explains legacy account support", () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByLabelText("绑定邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("邮箱验证码")).toHaveAttribute(
      "autocomplete",
      "one-time-code",
    );
    expect(screen.queryByLabelText("绑定手机号")).not.toBeInTheDocument();
    expect(screen.getByText(/旧账号未绑定邮箱/)).toBeInTheDocument();
  });
  it("sends a code, shows a generic notice and cooldown; email changes clear code", async () => {
    mocks.send.mockResolvedValue({ code: 200 });
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);
    await user.type(screen.getByLabelText("绑定邮箱"), "RECOVERY@EXAMPLE.COM");
    await user.click(screen.getByRole("button", { name: "获取验证码" }));
    await waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith("recovery@example.com"),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /如果该邮箱绑定了可用账号/,
    );
    expect(screen.getByRole("button", { name: "60秒后重发" })).toBeDisabled();
    await user.type(screen.getByLabelText("邮箱验证码"), "123456");
    await user.type(screen.getByLabelText("绑定邮箱"), "x");
    expect(screen.getByLabelText("邮箱验证码")).toHaveValue("");
  });
  it("resets using only email/code/password, clears local auth and returns to login", async () => {
    mocks.reset.mockResolvedValue({ code: 200, data: null });
    render(<ForgotPasswordPage />);
    const user = await fill();
    await user.click(screen.getByRole("button", { name: "重置密码" }));
    await waitFor(() =>
      expect(mocks.reset).toHaveBeenCalledWith({
        email: "recovery@example.com",
        code: "123456",
        newPassword: "test-only-new-password",
      }),
    );
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(screen.getByText(/已有登录会话已失效/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "返回登录" }));
    expect(mocks.push).toHaveBeenCalledWith("/login");
  });
  it("shows invalid-code failures and allows correction without success", async () => {
    mocks.reset.mockRejectedValue(new Error("验证码无效或已过期"));
    render(<ForgotPasswordPage />);
    const user = await fill();
    await user.click(screen.getByRole("button", { name: "重置密码" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("验证码无效或已过期"),
    );
    expect(mocks.logout).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it("rejects mismatched passwords and the UTF-8 byte overflow before submitting", async () => {
    render(<ForgotPasswordPage />);
    const user = await fill("密".repeat(25));
    fireEvent.submit(
      screen.getByRole("button", { name: "重置密码" }).closest("form")!,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("不超过72字节");
    expect(mocks.reset).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("新密码"));
    await user.type(screen.getByLabelText("新密码"), "test-only-password");
    fireEvent.submit(
      screen.getByRole("button", { name: "重置密码" }).closest("form")!,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("两次输入的密码不一致");
    expect(mocks.reset).not.toHaveBeenCalled();
  });
});
