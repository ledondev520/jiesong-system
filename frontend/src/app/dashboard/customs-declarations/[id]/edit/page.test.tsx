/**
 * Input: 编辑报关单页、customsDeclarationService、router、toast
 * Output: 编辑报关单页交互测试结果
 * Pos: 报关单管理编辑页测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import EditCustomsDeclarationPage from './page';

const mockGetById = vi.fn();
const mockUpdate = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (value: unknown) => {
      if (value && typeof (value as { then?: unknown }).then === 'function') {
        return { id: 'cd-2' };
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
}));

vi.mock('@/services/customsDeclaration.service', () => ({
  customsDeclarationService: {
    getById: (...args: unknown[]) => mockGetById(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

describe('EditCustomsDeclarationPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetById.mockReset();
    mockUpdate.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
    mockRouterPush.mockReset();
  });

  const renderPage = (id = 'cd-2') =>
    render(
      <Suspense fallback={<div>页面加载中...</div>}>
        <EditCustomsDeclarationPage params={Promise.resolve({ id })} />
      </Suspense>,
    );

  it('加载已有报关单并提交更新', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 'cd-2',
        declarationNo: 'CUS-2026-002',
        status: 'SUBMITTED',
        exporter: '捷淞供应链',
        consignee: 'Bogota Ceramica',
        destinationCountry: '哥伦比亚',
        portOfLoading: '上海',
        portOfDestination: 'Buenaventura',
        transportMode: 'SEA',
        declarationDate: '2026-03-05',
        releaseDate: null,
        currency: 'USD',
        totalAmount: 96000,
        totalPackages: 1400,
        grossWeight: 19800,
        netWeight: 19100,
        remarks: '待查验',
        items: [
          {
            id: 'item-1',
            productName: '木纹砖',
            hsCode: '69072390',
            quantity: 1400,
            unit: '箱',
            unitPrice: 68.57,
            totalPrice: 96000,
          },
        ],
        createdAt: '2026-03-05T00:00:00.000Z',
        updatedAt: '2026-03-05T00:00:00.000Z',
      },
    });
    mockUpdate.mockResolvedValue({ data: { id: 'cd-2' } });
    const user = userEvent.setup();

    renderPage('cd-2');

    await waitFor(() => {
      expect(screen.getByDisplayValue('CUS-2026-002')).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText('备注'));
    await user.type(screen.getByLabelText('备注'), '资料补正完成');
    await user.click(screen.getByRole('button', { name: '保存变更' }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('cd-2', {
        declarationNo: 'CUS-2026-002',
        status: 'SUBMITTED',
        exporter: '捷淞供应链',
        consignee: 'Bogota Ceramica',
        destinationCountry: '哥伦比亚',
        portOfLoading: '上海',
        portOfDestination: 'Buenaventura',
        declarationDate: '2026-03-05',
        releaseDate: null,
        transportMode: 'SEA',
        currency: 'USD',
        totalAmount: 96000,
        totalPackages: 1400,
        grossWeight: 19800,
        netWeight: 19100,
        remarks: '资料补正完成',
        items: [
          {
            productName: '木纹砖',
            hsCode: '69072390',
            quantity: 1400,
            unit: '箱',
            unitPrice: 68.57,
            totalPrice: 96000,
          },
        ],
      });
    });

    expect(mockToastSuccess).toHaveBeenCalledWith('报关单更新成功');
    expect(mockRouterPush).toHaveBeenCalledWith('/dashboard/customs-declarations/cd-2');
  });

  it('加载失败时提示错误', async () => {
    mockGetById.mockRejectedValue(new Error('load failed'));

    renderPage('cd-2');

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载报关单失败');
    });
  });
});
