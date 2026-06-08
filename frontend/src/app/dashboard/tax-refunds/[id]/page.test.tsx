/**
 * Input: 退税详情页、taxRefundService、router、toast
 * Output: 退税详情页交互测试结果
 * Pos: 退税管理详情页测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import TaxRefundDetailPage from './page';

const mockGetById = vi.fn();
const mockToastError = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (value: unknown) => {
      if (value && typeof (value as { then?: unknown }).then === 'function') {
        return { id: 'tr-1' };
      }
      return actual.use(value as never);
    },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    back: vi.fn(),
  }),
  usePathname: () => '/dashboard/tax-refunds/tr-1',
}));

vi.mock('@/services/taxRefund.service', () => ({
  taxRefundService: {
    getById: (...args: unknown[]) => mockGetById(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

describe('TaxRefundDetailPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetById.mockReset();
    mockToastError.mockReset();
    mockRouterPush.mockReset();
  });

  const renderPage = (id = 'tr-1') =>
    render(
      <Suspense fallback={<div>页面加载中...</div>}>
        <TaxRefundDetailPage params={Promise.resolve({ id })} />
      </Suspense>,
    );

  it('加载成功后展示退税摘要', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 'tr-1',
        refundNo: 'TR-2026-001',
        status: 'REFUNDED',
        salesContractId: 'sc-1',
        customsDeclarationId: 'cd-1',
        forexVerificationId: 'fv-1',
        declaredAmount: 128000,
        refundableAmount: 116500,
        refundedAmount: 115000,
        appliedAt: '2026-03-07',
        refundedAt: '2026-03-20',
        note: '款项已到账',
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
      },
    });

    renderPage('tr-1');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'TR-2026-001' })).toBeInTheDocument();
    });

    expect(screen.getByText('款项已到账')).toBeInTheDocument();
    expect(screen.getByText('sc-1')).toBeInTheDocument();
    expect(screen.getByText('cd-1')).toBeInTheDocument();
    expect(screen.getByText('115,000')).toBeInTheDocument();
  });

  it('点击编辑按钮跳转到编辑页', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 'tr-1',
        refundNo: 'TR-2026-001',
        status: 'APPLIED',
        salesContractId: 'sc-1',
        customsDeclarationId: 'cd-1',
        forexVerificationId: null,
        declaredAmount: 86000,
        refundableAmount: 80000,
        refundedAmount: 0,
        appliedAt: '2026-03-05',
        refundedAt: null,
        note: '',
        createdAt: '2026-03-05T00:00:00.000Z',
        updatedAt: '2026-03-05T00:00:00.000Z',
      },
    });
    const user = userEvent.setup();

    renderPage('tr-1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '编辑退税单' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '编辑退税单' }));
    expect(mockRouterPush).toHaveBeenCalledWith('/dashboard/tax-refunds/tr-1/edit');
  });

  it('加载失败时提示错误', async () => {
    mockGetById.mockRejectedValue(new Error('load failed'));

    renderPage('tr-1');

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载退税详情失败');
    });
  });
});
