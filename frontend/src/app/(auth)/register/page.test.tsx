/**
 * Input: Register 页面、router、axios API
 * Output: 注册页交互测试结果
 * Pos: 前端认证页面交互测试
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import RegisterPage from './page';

describe('RegisterPage 交互逻辑', () => {
  it('展示邀请注册说明', () => {
    render(<RegisterPage />);

    expect(screen.getByText('账号注册已关闭')).toBeInTheDocument();
    expect(screen.getByText('系统当前采用“管理员邀请注册”模式')).toBeInTheDocument();
    expect(screen.getByText('请联系系统管理员，由管理员在后台创建新账号后再登录。')).toBeInTheDocument();
    expect(screen.queryByText(/你已开启快捷登录/)).not.toBeInTheDocument();
    expect(screen.queryByText(/快捷登录/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回登录' })).toBeInTheDocument();
  });

  it('返回登录入口可见', () => {
    render(<RegisterPage />);

    expect(screen.getByRole('link', { name: '返回登录' })).toHaveAttribute('href', '/login');
  });
});
