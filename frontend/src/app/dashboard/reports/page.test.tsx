/**
 * Input: 报表页面、api请求模块
 * Output: 报表页交互逻辑测试结果
 * Pos: 前端统计页面交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportsPage from './page';

const mockApiGet = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/lib/axios', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

describe('ReportsPage 交互逻辑', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it('加载后展示汇总和供应商统计', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/suppliers') {
        return Promise.resolve({ data: { items: [{ id: 'sp-1', name: '供应商A' }] } });
      }
      if (url === '/stores') {
        return Promise.resolve({ data: { items: [{ id: 'st-1', name: '洛杉矶店' }] } });
      }
      if (url === '/dashboard/stats') {
        return Promise.resolve({
          data: { overview: { purchaseContracts: 3, salesContracts: 2, products: 10, containers: 1 } },
        });
      }
      if (url === '/purchases') {
        return Promise.resolve({ data: { items: [{ totalAmount: 5000 }], total: 1 } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '报表统计' })).toBeInTheDocument();
      expect(screen.getByText('供应商A')).toBeInTheDocument();
      expect(screen.getByText('采购汇总')).toBeInTheDocument();
    });
  });

  it('切换到门店列表标签后展示门店名称', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/suppliers') {
        return Promise.resolve({ data: { items: [] } });
      }
      if (url === '/stores') {
        return Promise.resolve({ data: { items: [{ id: 'st-1', name: '洛杉矶店' }] } });
      }
      if (url === '/dashboard/stats') {
        return Promise.resolve({
          data: { overview: { purchaseContracts: 0, salesContracts: 0, products: 0, containers: 0 } },
        });
      }
      return Promise.resolve({ data: { items: [], total: 0 } });
    });

    const user = userEvent.setup();
    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: '门店列表' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: '门店列表' }));

    await waitFor(() => {
      expect(screen.getByText('门店名称')).toBeInTheDocument();
      expect(screen.getByText('洛杉矶店')).toBeInTheDocument();
    });
  });
});

