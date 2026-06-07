/**
 * Input: 报关单详情页、customsDeclarationService、router、toast
 * Output: 报关单详情页交互测试结果
 * Pos: 报关单管理详情页测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import CustomsDeclarationDetailPage from './page';

const mockGetById = vi.fn();
const mockToastError = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (value: unknown) => {
      if (value && typeof (value as { then?: unknown }).then === 'function') {
        return { id: 'cd-1' };
      }
      return actual.use(value as never);
    },
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/customs-declarations/cd-1',
  useRouter: () => ({
    push: mockRouterPush,
    back: vi.fn(),
  }),
}));

vi.mock('@/services/customsDeclaration.service', () => ({
  customsDeclarationService: {
    getById: (...args: unknown[]) => mockGetById(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

describe('CustomsDeclarationDetailPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetById.mockReset();
    mockToastError.mockReset();
    mockRouterPush.mockReset();
  });

  const renderPage = (id = 'cd-1') =>
    render(
      <Suspense fallback={<div>页面加载中...</div>}>
        <CustomsDeclarationDetailPage params={Promise.resolve({ id })} />
      </Suspense>,
    );

  it('加载成功后展示报关单摘要与商品明细', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 'cd-1',
        declarationNo: 'CUS-2026-001',
        status: 'RELEASED',
        exporter: '捷淞供应链',
        consignee: 'Lima Tiles SAC',
        destinationCountry: '秘鲁',
        portOfLoading: '上海',
        portOfDestination: 'Callao',
        transportMode: 'SEA',
        declarationDate: '2026-03-01',
        releaseDate: '2026-03-04',
        currency: 'USD',
        totalAmount: 120000,
        totalPackages: 1800,
        grossWeight: 21500,
        netWeight: 20800,
        remarks: '已放行，待船开',
        items: [
          {
            id: 'item-1',
            productName: '釉面砖',
            hsCode: '69072190',
            quantity: 1800,
            unit: '箱',
            unitPrice: 66.67,
            totalPrice: 120000,
          },
        ],
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-04T00:00:00.000Z',
      },
    });

    renderPage('cd-1');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'CUS-2026-001' })).toBeInTheDocument();
    });

    expect(screen.getByText('Lima Tiles SAC')).toBeInTheDocument();
    expect(screen.getByText('已放行，待船开')).toBeInTheDocument();
    expect(screen.getByText('釉面砖')).toBeInTheDocument();
    expect(screen.getByText('69072190')).toBeInTheDocument();
  });

  it('点击编辑按钮跳转到编辑页', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 'cd-1',
        declarationNo: 'CUS-2026-001',
        status: 'DRAFT',
        exporter: '捷淞供应链',
        consignee: 'Quito Home',
        destinationCountry: '厄瓜多尔',
        declarationDate: '2026-03-01',
        currency: 'USD',
        totalAmount: 86000,
        totalPackages: 900,
        grossWeight: 11000,
        netWeight: 10400,
        items: [],
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    });
    const user = userEvent.setup();

    renderPage('cd-1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '编辑报关单' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '编辑报关单' }));
    expect(mockRouterPush).toHaveBeenCalledWith('/dashboard/customs-declarations/cd-1/edit');
  });

  it('加载失败时提示错误', async () => {
    mockGetById.mockRejectedValue(new Error('load failed'));

    renderPage('cd-1');

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载报关单详情失败');
    });
  });
});
