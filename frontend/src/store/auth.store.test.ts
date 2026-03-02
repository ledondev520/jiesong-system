/**
 * Input: Auth Store 与 token 工具
 * Output: 登录/登出状态流转测试
 * Pos: 前端状态管理测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type User } from '@/types';
import { useAuthStore } from './auth.store';
import { clearAuthToken, setAuthToken } from '@/lib/auth-token';

vi.mock('@/lib/auth-token', () => ({
  setAuthToken: vi.fn(),
  clearAuthToken: vi.fn(),
}));

const mockUser: User = {
  id: 'u-1',
  username: 'admin',
  name: '管理员',
  role: Role.ADMIN,
  isActive: true,
  createdAt: '2026-03-02T00:00:00.000Z',
  updatedAt: '2026-03-02T00:00:00.000Z',
};

describe('auth.store', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
    });
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('login: 更新认证状态并写入 token 工具', () => {
    useAuthStore.getState().login(mockUser, 'token-1');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('token-1');
    expect(state.user?.id).toBe('u-1');
    expect(setAuthToken).toHaveBeenCalledWith('token-1');
  });

  it('logout: 清空认证状态并清理 token 工具', () => {
    useAuthStore.getState().login(mockUser, 'token-1');
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(clearAuthToken).toHaveBeenCalledTimes(1);
  });
});
