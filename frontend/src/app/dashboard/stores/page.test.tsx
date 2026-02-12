/**
 * Input: 门店管理页面、storeService、StoreDialog、toast
 * Output: 门店管理页交互逻辑测试结果
 * Pos: 前端基础档案交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StoresPage from './page';

const mockGetAll = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/services/store.service', () => ({
  storeService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./components/StoreDialog', () => ({
  StoreDialog: ({ open }: { open: boolean }) => (open ? <div>门店弹窗已打开</div> : null),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

describe('StoresPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockToastError.mockReset();
  });

  it('加载后展示空态', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    render(<StoresPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '客户门店' })).toBeInTheDocument();
      expect(screen.getByText('暂无门店数据。')).toBeInTheDocument();
    });
  });

  it('点击新增门店会打开弹窗', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<StoresPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /新增门店/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /新增门店/ }));

    expect(screen.getByText('门店弹窗已打开')).toBeInTheDocument();
  });

  it('加载失败时提示错误', async () => {
    mockGetAll.mockRejectedValue(new Error('load failed'));
    render(<StoresPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载门店失败');
    });
  });
});

