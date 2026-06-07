/**
 * Input: AuthLayout、浏览器本地存储
 * Output: 认证页组旧登录资料清理测试结果
 * Pos: 认证页面组共享交互测试
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AuthLayout from './layout';
import {
  LEGACY_AUTH_CLEANUP_VERSION,
  LEGACY_AUTH_CLEANUP_VERSION_KEY,
} from '@/lib/legacy-auth-cleanup';

describe('AuthLayout', () => {
  it('进入认证页面组时清理旧登录资料', async () => {
    localStorage.setItem('jiesong_quick_login_profile', JSON.stringify({
      username: 'admin',
      password: 'old-password',
    }));
    localStorage.setItem('quickLoginProfile', JSON.stringify({
      username: 'admin',
      password: 'cached-password',
    }));
    localStorage.setItem('saved_login_profile', JSON.stringify({
      username: 'admin',
      password: 'cached-password',
    }));
    localStorage.setItem('quickLoginEnabled', 'true');
    localStorage.setItem('quickLoginPassword', 'cached-password');
    localStorage.setItem('saved_login_credentials', JSON.stringify({
      username: 'admin',
      password: 'cached-password',
    }));
    localStorage.setItem('jiesong_saved_username', 'admin');
    localStorage.setItem('jiesong_saved_credentials', JSON.stringify({
      username: 'admin',
      password: 'cached-password',
    }));
    sessionStorage.setItem('quickLoginProfile', JSON.stringify({
      username: 'admin',
      password: 'session-password',
    }));
    sessionStorage.setItem('oneClickLoginCredentials', JSON.stringify({
      username: 'admin',
      password: 'session-password',
    }));
    localStorage.setItem('dashboard:last-tab', '/dashboard');

    render(
      <AuthLayout>
        <div>认证页面内容</div>
      </AuthLayout>,
    );

    expect(screen.getByText('认证页面内容')).toBeInTheDocument();

    await waitFor(() => {
      expect(localStorage.getItem('jiesong_quick_login_profile')).toBeNull();
      expect(localStorage.getItem('quickLoginProfile')).toBeNull();
      expect(localStorage.getItem('saved_login_profile')).toBeNull();
      expect(localStorage.getItem('quickLoginEnabled')).toBeNull();
      expect(localStorage.getItem('quickLoginPassword')).toBeNull();
      expect(localStorage.getItem('saved_login_credentials')).toBeNull();
      expect(localStorage.getItem('jiesong_saved_username')).toBeNull();
      expect(localStorage.getItem('jiesong_saved_credentials')).toBeNull();
      expect(sessionStorage.getItem('quickLoginProfile')).toBeNull();
      expect(sessionStorage.getItem('oneClickLoginCredentials')).toBeNull();
      expect(localStorage.getItem('dashboard:last-tab')).toBe('/dashboard');
      expect(localStorage.getItem(LEGACY_AUTH_CLEANUP_VERSION_KEY)).toBe(LEGACY_AUTH_CLEANUP_VERSION);
    });
  });

  it('渲染提前清理旧快捷登录状态的脚本', () => {
    render(
      <AuthLayout>
        <div>认证页面内容</div>
      </AuthLayout>,
    );

    const script = document.querySelector<HTMLScriptElement>('script#legacy-auth-cleanup');
    expect(script).not.toBeNull();
    expect(script?.textContent).toContain('jiesong_quick_login_profile');
    expect(script?.textContent).toContain('sessionStorage');
  });
});
