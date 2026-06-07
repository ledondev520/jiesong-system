/**
 * Input: AuthLayout、浏览器本地存储
 * Output: 认证页组旧登录资料清理测试结果
 * Pos: 认证页面组共享交互测试
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AuthLayout from './layout';

describe('AuthLayout', () => {
  it('进入认证页面组时清理旧登录资料', async () => {
    localStorage.setItem('jiesong_quick_login_profile', JSON.stringify({
      username: 'admin',
      password: 'old-password',
    }));

    render(
      <AuthLayout>
        <div>认证页面内容</div>
      </AuthLayout>,
    );

    expect(screen.getByText('认证页面内容')).toBeInTheDocument();

    await waitFor(() => {
      expect(localStorage.getItem('jiesong_quick_login_profile')).toBeNull();
    });
  });
});
