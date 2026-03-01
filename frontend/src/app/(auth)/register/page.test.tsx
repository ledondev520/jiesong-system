/**
 * Input: Register 页面、router、axios API
 * Output: 注册页交互测试结果
 * Pos: 前端认证页面交互测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterPage from './page';

const mockPush = vi.fn();
const mockPost = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
  }),
}));

vi.mock('@/lib/axios', () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

describe('RegisterPage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockPost.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
  });

  it('默认渲染注册表单关键元素', () => {
    render(<RegisterPage />);

    expect(screen.getByText('账号注册')).toBeInTheDocument();
    expect(screen.getByLabelText('用户名 (姓名拼音)')).toBeInTheDocument();
    expect(screen.getByLabelText('真实姓名')).toBeInTheDocument();
    expect(screen.getByLabelText('手机号码 (密保)')).toBeInTheDocument();
    expect(screen.getByLabelText('设置密码')).toBeInTheDocument();
    expect(screen.getByLabelText('确认密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '立即注册' })).toBeInTheDocument();
  });

  it('注册成功后展示成功态并可返回登录', async () => {
    mockPost.mockResolvedValue({ code: 201, data: null });
    const user = userEvent.setup();

    render(<RegisterPage />);

    await user.type(screen.getByLabelText('用户名 (姓名拼音)'), 'zhangsan');
    await user.type(screen.getByLabelText('真实姓名'), '张三');
    await user.type(screen.getByLabelText('手机号码 (密保)'), '13800138000');
    await user.type(screen.getByLabelText('设置密码'), '123456');
    await user.type(screen.getByLabelText('确认密码'), '123456');
    await user.click(screen.getByRole('button', { name: '立即注册' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/auth/public-register', {
        username: 'zhangsan',
        name: '张三',
        phone: '13800138000',
        password: '123456',
      });
      expect(mockToastSuccess).toHaveBeenCalledWith('注册成功！请等待管理员审核后登录');
      expect(screen.getByText('注册成功！')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '返回登录' }));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('注册失败时提示错误', async () => {
    mockPost.mockRejectedValue(new Error('用户名已存在'));
    const user = userEvent.setup();

    render(<RegisterPage />);

    await user.type(screen.getByLabelText('用户名 (姓名拼音)'), 'zhangsan');
    await user.type(screen.getByLabelText('真实姓名'), '张三');
    await user.type(screen.getByLabelText('手机号码 (密保)'), '13800138000');
    await user.type(screen.getByLabelText('设置密码'), '123456');
    await user.type(screen.getByLabelText('确认密码'), '123456');
    await user.click(screen.getByRole('button', { name: '立即注册' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('用户名已存在');
    });
  });
});
