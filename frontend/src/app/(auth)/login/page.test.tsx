/**
 * Input: Login页面、router、auth store、axios API
 * Output: 登录页交互逻辑测试结果
 * Pos: 前端认证页面交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';

const mockPush = vi.fn();
const mockAuthStoreLogin = vi.fn();
const mockAuthServiceLogin = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (
    selector: (state: { login: (user: unknown, token: string) => void }) => unknown,
  ) =>
    selector({
      login: mockAuthStoreLogin,
    }),
}));

vi.mock('@/services/auth.service', () => ({
  authService: {
    login: (...args: unknown[]) => mockAuthServiceLogin(...args),
  },
}));

describe('LoginPage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockAuthStoreLogin.mockReset();
    mockAuthServiceLogin.mockReset();
    localStorage.clear();
  });

  it('默认渲染登录表单，且未登录过时不展示快捷登录按钮', () => {
    render(<LoginPage />);

    expect(screen.getByText('首次登录成功后，下次可使用快捷登录。')).toBeInTheDocument();
    expect(screen.getByLabelText('用户名')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /一键登录/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/测试阶段账号/)).not.toBeInTheDocument();
  });

  it('本地存在快捷登录资料时展示一键登录入口', async () => {
    localStorage.setItem('jiesong_quick_login_profile', JSON.stringify({
      username: 'admin',
      password: '123456',
    }));

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText('你已开启快捷登录，可一键进入系统。')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '一键登录（admin）' })).toBeInTheDocument();
    });
  });

  it('手动登录成功后写入快捷登录资料并跳转首页', async () => {
    mockAuthServiceLogin.mockResolvedValue({
      code: 200,
      data: {
        user: { id: 'u1', username: 'admin', name: '管理员', role: 'ADMIN' },
        token: 'token-123',
      },
    });

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('用户名'), 'admin');
    await user.type(screen.getByLabelText('密码'), '123456');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(mockAuthServiceLogin).toHaveBeenCalledWith({
        username: 'admin',
        password: '123456',
      });
      expect(mockAuthStoreLogin).toHaveBeenCalledWith(
        { id: 'u1', username: 'admin', name: '管理员', role: 'ADMIN' },
        'token-123',
      );
      expect(mockPush).toHaveBeenCalledWith('/');
    });

    expect(localStorage.getItem('jiesong_quick_login_profile')).toBe(
      JSON.stringify({ username: 'admin', password: '123456' }),
    );
  });

  it('点击一键登录后直接自动登录', async () => {
    localStorage.setItem('jiesong_quick_login_profile', JSON.stringify({
      username: 'admin',
      password: '123456',
    }));
    mockAuthServiceLogin.mockResolvedValue({
      code: 200,
      data: {
        user: { id: 'u1', username: 'admin', name: '管理员', role: 'ADMIN' },
        token: 'token-123',
      },
    });

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: '一键登录（admin）' }));

    expect(screen.getByLabelText('用户名')).toHaveValue('admin');
    expect(screen.getByLabelText('密码')).toHaveValue('123456');

    await waitFor(() => {
      expect(mockAuthServiceLogin).toHaveBeenCalledWith({
        username: 'admin',
        password: '123456',
      });
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('登录失败时展示错误提示', async () => {
    mockAuthServiceLogin.mockRejectedValue(new Error('账号或密码错误'));

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('用户名'), 'admin');
    await user.type(screen.getByLabelText('密码'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(screen.getByText('账号或密码错误')).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
