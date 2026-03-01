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
const mockLogin = vi.fn();
const mockPost = vi.fn();

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
      login: mockLogin,
    }),
}));

vi.mock('@/lib/axios', () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

describe('LoginPage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockLogin.mockReset();
    mockPost.mockReset();
    localStorage.clear();
  });

  it('默认渲染登录表单关键元素', () => {
    render(<LoginPage />);
    expect(screen.getByText('系统登录')).toBeInTheDocument();
    expect(screen.getByLabelText('用户名')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });

  it('可从本地恢复记住的账号密码', async () => {
    localStorage.setItem('jiesong_saved_username', 'admin');

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('用户名')).toHaveValue('admin');
      expect(screen.getByLabelText('密码')).toHaveValue('');
    });
  });

  it('登录成功后调用store并跳转首页', async () => {
    mockPost.mockResolvedValue({
      code: 200,
      data: {
        user: { id: 'u1', username: 'admin', name: '管理员', role: 'ADMIN' },
        token: 'token-123',
      },
    });

    const user = userEvent.setup();
    render(<LoginPage />);

    // 0. 输入账号密码
    await user.type(screen.getByLabelText('用户名'), 'admin');
    await user.type(screen.getByLabelText('密码'), '123456');

    // 1. 开启记住用户名并提交
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: '登录' }));

    // 2. 校验请求与后续动作
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/auth/login', {
        username: 'admin',
        password: '123456',
      });
      expect(mockLogin).toHaveBeenCalledWith(
        { id: 'u1', username: 'admin', name: '管理员', role: 'ADMIN' },
        'token-123',
      );
      expect(mockPush).toHaveBeenCalledWith('/');
    });

    // 3. 校验记住用户名写入
    expect(localStorage.getItem('jiesong_saved_username')).toBe('admin');
  });

  it('登录失败时展示错误提示', async () => {
    mockPost.mockRejectedValue(new Error('账号或密码错误'));

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
