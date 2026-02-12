/**
 * Input: 供应商管理页面、supplierService、SupplierDialog、toast
 * Output: 供应商管理页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SuppliersPage from './page';

const mockGetAll = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/services/supplier.service', () => ({
  supplierService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

vi.mock('./components/SupplierDialog', () => ({
  SupplierDialog: ({ open }: { open: boolean }) => (open ? <div>供应商弹窗已打开</div> : null),
}));

describe('SuppliersPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockToastError.mockReset();
  });

  it('无数据时展示空态', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    render(<SuppliersPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '供应商管理' })).toBeInTheDocument();
      expect(screen.getByText('暂无供应商数据。')).toBeInTheDocument();
    });
  });

  it('点击新增供应商会打开弹窗', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<SuppliersPage />);

    await user.click(screen.getByRole('button', { name: /新增供应商/ }));
    expect(screen.getByText('供应商弹窗已打开')).toBeInTheDocument();
  });

  it('加载失败时提示错误', async () => {
    mockGetAll.mockRejectedValue(new Error('load failed'));
    render(<SuppliersPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载供应商失败');
    });
  });
});

