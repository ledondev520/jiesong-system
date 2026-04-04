/**
 * Auth Service 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from './auth.service';
import api from '@/lib/axios';

vi.mock('@/lib/axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该登录成功', async () => {
    const mockResponse = {
      code: 200,
      data: {
        user: { id: '1', username: 'admin', name: 'Admin' },
        token: 'jwt-token',
      },
      message: '登录成功',
    };

    vi.mocked(api.post).mockResolvedValueOnce({ data: mockResponse });

    const result = await authService.login({ username: 'admin', password: '123456' });

    expect(api.post).toHaveBeenCalledWith('/auth/login', { username: 'admin', password: '123456' });
    expect(result.data).toEqual(mockResponse);
  });

  it('应该重置密码', async () => {
    const mockResponse = { code: 200, data: null, message: '重置成功' };
    vi.mocked(api.post).mockResolvedValueOnce({ data: mockResponse });

    const result = await authService.resetPassword({
      username: 'admin',
      phone: '13800138000',
      newPassword: 'newpass',
    });

    expect(api.post).toHaveBeenCalledWith('/auth/reset-password', {
      username: 'admin',
      phone: '13800138000',
      newPassword: 'newpass',
    });
    expect(result.data).toEqual(mockResponse);
  });
});
