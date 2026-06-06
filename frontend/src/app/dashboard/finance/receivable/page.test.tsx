/**
 * Input: ReceivablePage（应收账款独立列表页）
 * Output: 验证页面展示应收账款列表
 * Pos: 财务模块应收账款独立页面测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ReceivablePage from './page';

const mockGetReceivables = vi.fn();
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard/finance/receivable',
}));

vi.mock('@/services/finance.service', () => ({
  financeService: {
    getReceivables: (...args: unknown[]) => mockGetReceivables(...args),
  },
}));

vi.mock('@/lib/api-cache', () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
}));

describe('ReceivablePage', () => {
  beforeEach(() => {
    mockGetReceivables.mockReset();
  });

  it('加载后展示应收账款页面标题', async () => {
    mockGetReceivables.mockResolvedValue({ data: { items: [] } });
    render(<ReceivablePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '应收账款' })).toBeInTheDocument();
    });
  });

  it('加载失败时展示错误状态', async () => {
    mockGetReceivables.mockRejectedValue(new Error('load failed'));
    render(<ReceivablePage />);

    await waitFor(() => {
      expect(screen.getByText('数据加载失败')).toBeInTheDocument();
    });
  });
});
