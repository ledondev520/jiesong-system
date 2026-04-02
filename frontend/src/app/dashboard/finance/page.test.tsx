/**
 * Input: 财务驾驶舱页面、finance stats API、system exchange-rate API
 * Output: 财务驾驶舱页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import FinancePage from './page';

const mockGetStats = vi.fn();
const mockApiGet = vi.fn();

vi.mock('@/services/finance.service', () => ({
  financeService: {
    getStats: (...args: unknown[]) => mockGetStats(...args),
  },
}));

vi.mock('@/lib/axios', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/dashboard/finance',
}));

vi.mock('@/lib/tab-memory', () => ({
  saveModuleTab: vi.fn(),
  getModuleTab: vi.fn((href: string) => href),
}));

describe('FinancePage 交互逻辑', () => {
  beforeEach(() => {
    mockGetStats.mockReset();
    mockApiGet.mockReset();
    // 默认 exchange-rate 返回
    mockApiGet.mockResolvedValue({
      data: { rate: 6.8, buffer: 0.2, effectiveRate: 6.6 },
    });
  });

  it('加载完成后展示统计信息', async () => {
    mockGetStats.mockResolvedValue({
      payable: { total: 1200, paid: 400, unpaid: 800 },
      receivable: { total: 3200, received: 1000, unreceived: 2200 },
    });

    render(<FinancePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '财务驾驶舱' })).toBeInTheDocument();
      expect(screen.getByText('先上传本期财务报表')).toBeInTheDocument();
      expect(screen.getByText('应付账款总额')).toBeInTheDocument();
      expect(screen.getByText('待收账款')).toBeInTheDocument();
      expect(screen.getByText(/当前客户剩余欠款/)).toBeInTheDocument();
    });
  });

  it('初始加载中会显示加载文案', () => {
    mockGetStats.mockReturnValue(new Promise(() => {}));
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<FinancePage />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });
});
