/**
 * Input: 财务管理页面、finance stats API
 * Output: 财务概览页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import FinancePage from './page';

const mockGetStats = vi.fn();

vi.mock('@/services/finance.service', () => ({
  financeService: {
    getStats: (...args: unknown[]) => mockGetStats(...args),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

describe('FinancePage 交互逻辑', () => {
  beforeEach(() => {
    mockGetStats.mockReset();
  });

  it('加载完成后展示统计信息', async () => {
    mockGetStats.mockResolvedValue({
      data: {
        payable: { total: 1200, paid: 400, unpaid: 800 },
        receivable: { total: 3200, received: 1000, unreceived: 2200 },
      },
    });

    render(<FinancePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '财务管理' })).toBeInTheDocument();
      expect(screen.getByText('应付账款总额')).toBeInTheDocument();
      expect(screen.getByText('待收账款')).toBeInTheDocument();
    });
  });

  it('初始加载中会显示加载文案', () => {
    mockGetStats.mockReturnValue(new Promise(() => {}));
    render(<FinancePage />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });
});
