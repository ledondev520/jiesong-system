import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegisterPage from './page';
import { authService } from '@/services/auth.service';
vi.mock('@/services/auth.service', () => ({ authService: { sendEmailCode: vi.fn(), registerEmail: vi.fn() } }));
describe('邮箱注册', () => {
  it('发信失败可恢复；验证后提交待审核账号，不直接登录', async () => {
    vi.mocked(authService.sendEmailCode).mockRejectedValueOnce({ message: '邮箱注册服务暂不可用' }).mockResolvedValueOnce({} as never);
    vi.mocked(authService.registerEmail).mockResolvedValueOnce({} as never);
    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'New@Example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('邮箱注册服务暂不可用');
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));
    expect(await screen.findByRole('button', { name: '60秒后重发' })).toBeDisabled();
    expect(authService.sendEmailCode).toHaveBeenLastCalledWith('new@example.com');
    fireEvent.change(screen.getByLabelText('邮箱验证码'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '测试用户' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'non-production-test' } });
    fireEvent.click(screen.getByRole('button', { name: '注册并申请开通' }));
    await waitFor(() => expect(screen.getByText('注册申请已提交')).toBeInTheDocument());
    expect(authService.registerEmail).toHaveBeenCalledWith({ email: 'new@example.com', code: '123456', name: '测试用户', password: 'non-production-test' });
    expect(screen.getByRole('link', { name: '返回登录' })).toHaveAttribute('href', '/login');
    expect(screen.queryByText(/快捷登录/)).not.toBeInTheDocument();
  });
});
