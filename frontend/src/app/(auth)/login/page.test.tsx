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
import {
  LEGACY_AUTH_CLEANUP_VERSION,
  LEGACY_AUTH_CLEANUP_VERSION_KEY,
} from '@/lib/legacy-auth-cleanup';

const mockPush = vi.fn();
const mockAuthStoreLogin = vi.fn();
const mockAuthServiceLogin = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => ({
    get: vi.fn(() => null),
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
    sessionStorage.clear();
  });

  it('默认渲染登录表单，且未登录过时不展示快捷登录按钮', () => {
    render(<LoginPage />);

    expect(screen.getByText('请输入账号密码登录捷淞进销存系统。')).toBeInTheDocument();
    expect(screen.getByLabelText('用户名')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /一键登录/ })).not.toBeInTheDocument();
    expect(screen.queryByText('快捷登录')).not.toBeInTheDocument();
    expect(screen.queryByText(/测试阶段账号/)).not.toBeInTheDocument();
    expect(screen.queryByText(/开启快捷登录/)).not.toBeInTheDocument();
    expect(screen.queryByText(/你已开启快捷登录/)).not.toBeInTheDocument();
  });

  it('旧版快捷登录资料会被清理，避免继续使用失效密码', async () => {
    localStorage.setItem('jiesong_quick_login_profile', JSON.stringify({
      version: 2,
      username: 'admin',
      password: 'old-password',
      source: 'saved',
    }));

    render(<LoginPage />);

    await waitFor(() => {
      expect(localStorage.getItem('jiesong_quick_login_profile')).toBeNull();
      expect(screen.queryByRole('button', { name: /一键登录/ })).not.toBeInTheDocument();
    });
  });

  it('无效快捷登录资料会被清理，避免继续使用缓存密码', async () => {
    localStorage.setItem('jiesong_quick_login_profile', JSON.stringify({
      username: 'admin',
      password: 'old-password',
    }));
    localStorage.setItem('quickLoginProfile', JSON.stringify({
      username: 'admin',
      password: 'old-password',
    }));
    localStorage.setItem('saved_login_profile', JSON.stringify({
      username: 'admin',
      password: 'old-password',
    }));
    localStorage.setItem('quickLoginEnabled', 'true');
    localStorage.setItem('quickLoginUsername', 'admin');
    localStorage.setItem('quickLoginPassword', 'old-password');
    localStorage.setItem('jiesong_quick_login_enabled', 'true');
    localStorage.setItem('jiesong_quick_login_password', 'old-password');
    localStorage.setItem('saved_login_credentials', JSON.stringify({
      username: 'admin',
      password: 'old-password',
    }));
    localStorage.setItem('jiesong_saved_username', 'admin');
    localStorage.setItem('jiesong_saved_credentials', JSON.stringify({
      username: 'admin',
      password: 'old-password',
    }));
    sessionStorage.setItem('quickLoginProfile', JSON.stringify({
      username: 'admin',
      password: 'session-password',
    }));
    sessionStorage.setItem('oneClickLoginCredentials', JSON.stringify({
      username: 'admin',
      password: 'session-password',
    }));

    render(<LoginPage />);

    await waitFor(() => {
      expect(localStorage.getItem('jiesong_quick_login_profile')).toBeNull();
      expect(localStorage.getItem('quickLoginProfile')).toBeNull();
      expect(localStorage.getItem('saved_login_profile')).toBeNull();
      expect(localStorage.getItem('quickLoginEnabled')).toBeNull();
      expect(localStorage.getItem('quickLoginUsername')).toBeNull();
      expect(localStorage.getItem('quickLoginPassword')).toBeNull();
      expect(localStorage.getItem('jiesong_quick_login_enabled')).toBeNull();
      expect(localStorage.getItem('jiesong_quick_login_password')).toBeNull();
      expect(localStorage.getItem('saved_login_credentials')).toBeNull();
      expect(localStorage.getItem('jiesong_saved_username')).toBeNull();
      expect(localStorage.getItem('jiesong_saved_credentials')).toBeNull();
      expect(sessionStorage.getItem('quickLoginProfile')).toBeNull();
      expect(sessionStorage.getItem('oneClickLoginCredentials')).toBeNull();
      expect(localStorage.getItem(LEGACY_AUTH_CLEANUP_VERSION_KEY)).toBe(LEGACY_AUTH_CLEANUP_VERSION);
      expect(screen.queryByRole('button', { name: /一键登录/ })).not.toBeInTheDocument();
    });
  });

  it('手动登录成功后清理旧快捷登录资料并跳转工作台', async () => {
    localStorage.setItem('jiesong_quick_login_profile', JSON.stringify({
      version: 2,
      username: 'admin',
      password: 'old-password',
      source: 'saved',
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
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });

    expect(localStorage.getItem('jiesong_quick_login_profile')).toBeNull();
  });

  it('旧快捷登录资料不会触发自动登录', async () => {
    localStorage.setItem('jiesong_quick_login_profile', JSON.stringify({
      version: 2,
      username: 'admin',
      password: '123456',
      source: 'saved',
    }));
    mockAuthServiceLogin.mockResolvedValue({
      code: 200,
      data: {
        user: { id: 'u1', username: 'admin', name: '管理员', role: 'ADMIN' },
        token: 'token-123',
      },
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /一键登录/ })).not.toBeInTheDocument();
    });
    expect(mockAuthServiceLogin).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
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

  it('后端连接失败时提示权威的 3001 端口', async () => {
    mockAuthServiceLogin.mockRejectedValue(new Error('Network Error'));
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('用户名'), 'admin');
    await user.type(screen.getByLabelText('密码'), '123456');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('后端服务未连接，请先启动 backend 服务（默认端口 3001）')).toBeInTheDocument();
  });

  it('触发登录限流时展示可操作提示', async () => {
    mockAuthServiceLogin.mockRejectedValue({
      message: '登录尝试过于频繁，请 15 分钟后再试',
      retryAfter: 600,
    });

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('用户名'), 'admin');
    await user.type(screen.getByLabelText('密码'), '123456');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(screen.getByText('登录尝试过于频繁，请 10 分钟后再试，或切换账号后重试。')).toBeInTheDocument();
    });
  });
});
