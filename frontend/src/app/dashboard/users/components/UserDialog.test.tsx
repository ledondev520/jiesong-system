import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserDialog } from './UserDialog';
import { Role, type User } from '@/types';
it('管理员可在共享编辑弹窗开通待审核邮箱账号', async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  render(<UserDialog open onOpenChange={() => {}} onSubmit={submit} user={{ id: 'pending', username: 'long.email.registration@example.com', name: '待审核用户', role: Role.SALES, isActive: false } as User} />);
  const toggle = screen.getByRole('switch', { name: '账号开通' });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ isActive: true, role: Role.SALES })));
});
