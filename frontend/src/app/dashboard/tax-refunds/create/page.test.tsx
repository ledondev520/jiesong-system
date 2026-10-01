/**
 * Input: 新建退税页、taxRefundService、router、toast
 * Output: 新建退税页交互测试结果
 * Pos: 退税管理创建页测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateTaxRefundPage from './page';

const mockPush = vi.fn();
const mockCreate = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
  }),
  usePathname: () => '/dashboard/tax-refunds/create',
}));

vi.mock('@/services/taxRefund.service', () => ({
  taxRefundService: {
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

vi.mock('@/services/sales.service', () => ({ salesService: { getAll: async () => ({ data: { items: [{ id: 'sc-9', contractNo: 'EXP-9' }, { id: 'sc-10', contractNo: 'EXP-10' }], pagination: { totalPages: 1 } } }) } }));
vi.mock('@/services/customsDeclaration.service', () => ({ customsDeclarationService: { getAll: async () => ({ data: { items: [{ id: 'cd-9', declarationNo: 'CD-9' }, { id: 'cd-10', declarationNo: 'CD-10' }], pagination: { totalPages: 1 } } }) } }));
vi.mock('@/services/forexVerification.service', () => ({ forexVerificationService: { getAll: async () => ({ data: { items: [{ id: 'fv-9', verificationNo: 'FX-9', status: 'PENDING' }], pagination: { totalPages: 1 } } }) } }));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

describe('CreateTaxRefundPage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockCreate.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  it('提交标准化 payload 并跳转详情页', async () => {
    mockCreate.mockResolvedValue({
      data: {
        id: 'tr-new',
      },
    });
    const user = userEvent.setup();

    render(<CreateTaxRefundPage />);

    expect(screen.getByRole('heading', { name: '新建退税单' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('退税单号'), 'TR-20260307-09');
    await user.click(screen.getByRole('combobox', { name: '出口合同' }));
    await user.click(await screen.findByRole('option', { name: 'EXP-9' }));
    await user.click(screen.getByRole('combobox', { name: '报关单' }));
    await user.click(await screen.findByRole('option', { name: 'CD-9' }));
    await user.click(screen.getByRole('combobox', { name: '核销记录' }));
    await user.click(await screen.findByRole('option', { name: 'FX-9 · PENDING' }));
    await user.type(screen.getByLabelText('申报金额'), '128000');
    await user.type(screen.getByLabelText('可退金额'), '116500');
    await user.type(screen.getByLabelText('已退金额'), '0');
    await user.type(screen.getByLabelText('申请日期'), '2026-03-07');
    await user.type(screen.getByLabelText('备注'), '资料齐套，等待提交');

    await user.click(screen.getByRole('button', { name: '保存并查看详情' }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        refundNo: 'TR-20260307-09',
        status: 'DRAFT',
        salesContractId: 'sc-9',
        customsDeclarationId: 'cd-9',
        forexVerificationId: 'fv-9',
        declaredAmount: 128000,
        refundableAmount: 116500,
        refundedAmount: 0,
        appliedAt: '2026-03-07',
        refundedAt: null,
        note: '资料齐套，等待提交',
      });
    });

    expect(mockToastSuccess).toHaveBeenCalledWith('退税记录创建成功');
    expect(mockPush).toHaveBeenCalledWith('/dashboard/tax-refunds/tr-new');
  });

  it('创建失败时提示错误', async () => {
    mockCreate.mockRejectedValue(new Error('create failed'));
    const user = userEvent.setup();

    render(<CreateTaxRefundPage />);

    await user.type(screen.getByLabelText('退税单号'), 'TR-20260307-10');
    await user.click(screen.getByRole('combobox', { name: '出口合同' }));
    await user.click(await screen.findByRole('option', { name: 'EXP-10' }));
    await user.click(screen.getByRole('combobox', { name: '报关单' }));
    await user.click(await screen.findByRole('option', { name: 'CD-10' }));
    await user.type(screen.getByLabelText('申报金额'), '68000');
    await user.type(screen.getByLabelText('可退金额'), '62000');
    await user.type(screen.getByLabelText('已退金额'), '0');
    await user.type(screen.getByLabelText('申请日期'), '2026-03-08');

    await user.click(screen.getByRole('button', { name: '保存并查看详情' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('创建退税记录失败');
    });
  });
});
