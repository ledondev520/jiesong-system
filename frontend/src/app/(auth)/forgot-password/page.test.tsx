/**
 * Input: ForgotPassword 页面、router、axios API
 * Output: 找回密码页交互测试结果
 * Pos: 前端认证页面交互测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ForgotPasswordPage from './page';

const mockPush = vi.fn();
const mockResetPassword = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
  }),
}));

vi.mock('@/services/auth.service', () => ({
  authService: {
    resetPassword: (...args: unknown[]) => mockResetPassword(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

describe('ForgotPasswordPage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockResetPassword.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
  });

  it('默认渲染找回密码表单关键元素', () => {
    render(<ForgotPasswordPage />);

    expect(screen.getByText('找回密码')).toBeInTheDocument();
    expect(screen.getByLabelText('用户名')).toBeInTheDocument();
    expect(screen.getByLabelText('绑定手机号')).toBeInTheDocument();
    expect(screen.getByLabelText('新密码')).toBeInTheDocument();
    expect(screen.getByLabelText('确认新密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重置密码' })).toBeInTheDocument();
  });

  it('重置成功后展示成功态并可返回登录', async () => {
    mockResetPassword.mockResolvedValue({ code: 200, data: null });
    const user = userEvent.setup();

    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText('用户名'), 'admin');
    await user.type(screen.getByLabelText('绑定手机号'), '13800138000');
    await user.type(screen.getByLabelText('新密码'), 'new-password');
    await user.type(screen.getByLabelText('确认新密码'), 'new-password');
    await user.click(screen.getByRole('button', { name: '重置密码' }));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith({
        username: 'admin',
        phone: '13800138000',
        newPassword: 'new-password',
      });
      expect(mockToastSuccess).toHaveBeenCalledWith('密码重置成功！');
      expect(screen.getByText('密码重置成功！')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '返回登录' }));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('重置失败时提示错误', async () => {
    mockResetPassword.mockRejectedValue(new Error('账号信息不匹配'));
    const user = userEvent.setup();

    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText('用户名'), 'admin');
    await user.type(screen.getByLabelText('绑定手机号'), '13800138000');
    await user.type(screen.getByLabelText('新密码'), 'new-password');
    await user.type(screen.getByLabelText('确认新密码'), 'new-password');
    await user.click(screen.getByRole('button', { name: '重置密码' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('账号信息不匹配');
    });
  });
});
