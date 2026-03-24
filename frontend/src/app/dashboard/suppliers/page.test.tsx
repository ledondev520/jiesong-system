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
  usePathname: () => '/dashboard',
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

vi.mock('@/lib/api-cache', () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
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
      expect(screen.getAllByText('暂无供应商数据。').length).toBeGreaterThan(0);
    });
  });

  it('点击新增供应商会打开弹窗', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<SuppliersPage />);

    await user.click(screen.getAllByRole('button', { name: /新增供应商/ })[0]);
    expect(screen.getByText('供应商弹窗已打开')).toBeInTheDocument();
  });

  it('加载失败时提示错误', async () => {
    mockGetAll.mockRejectedValue(new Error('load failed'));
    render(<SuppliersPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载供应商失败');
    });
  });

  it('提供移动端搜索入口与供应商卡片动作', async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [
          {
            id: 'supplier-1',
            name: '佛山陶瓷有限公司',
            shortName: '佛山陶瓷',
            contactName: '李总',
            contactPhone: '13800000000',
            hasQualityIssue: true,
            aliases: [{ id: 'alias-1', alias: '陶瓷厂' }],
          },
        ],
      },
    });
    render(<SuppliersPage />);

    expect(await screen.findByRole('button', { name: '搜索与操作' })).toBeInTheDocument();
    expect(screen.getAllByText('佛山陶瓷有限公司').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '编辑 佛山陶瓷有限公司' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '删除 佛山陶瓷有限公司' }).length).toBeGreaterThan(0);
  });
});
