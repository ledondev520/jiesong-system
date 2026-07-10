/**
 * Input: 供应商管理表单页、supplierService、toast
 * Output: 供应商管理表单页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SuppliersPage from './page';

const mockGetAll = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/suppliers',
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/services/supplier.service', () => ({
  supplierService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

vi.mock('@/lib/api-cache', () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

describe('SuppliersPage 表单页交互逻辑', () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  it('无数据时展示供应商档案表单', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });

    render(<SuppliersPage />);

    expect(await screen.findByRole('heading', { name: '供应商管理' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '供应商档案表单' })).toBeInTheDocument();
    expect(screen.getByText('暂无供应商')).toBeInTheDocument();
    expect(screen.getByLabelText('公司名称 *')).toBeInTheDocument();
    expect(screen.getByLabelText('收款户名')).toBeInTheDocument();
    expect(screen.getByLabelText('开户支行')).toBeInTheDocument();
    expect(screen.getByLabelText('联行号 / 银行编号')).toBeInTheDocument();
    expect(screen.queryByText('供应商弹窗已打开')).not.toBeInTheDocument();
  });

  it('在表单页创建供应商', async () => {
    mockGetAll
      .mockResolvedValueOnce({ data: { items: [] } })
      .mockResolvedValueOnce({ data: { items: [] } });
    mockCreate.mockResolvedValue({ data: { id: 'supplier-new' } });
    const user = userEvent.setup();

    render(<SuppliersPage />);

    await user.type(await screen.findByLabelText('公司名称 *'), '广州玻璃制品有限公司');
    await user.type(screen.getByLabelText('联系人'), '王经理');
    await user.click(screen.getByRole('button', { name: '创建供应商' }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        name: '广州玻璃制品有限公司',
        contactName: '王经理',
        hasQualityIssue: false,
      }));
      expect(mockToastSuccess).toHaveBeenCalledWith('供应商创建成功');
    });
  });

  it('选择已有供应商后在同一页表单编辑保存', async () => {
    mockGetAll
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'supplier-1',
              name: '佛山陶瓷有限公司',
              shortName: '佛山陶瓷',
              contactName: '李总',
              contactPhone: '13800000000',
              contactEmail: '',
              hasQualityIssue: true,
              qualityNote: '曾有破损',
              aliases: [{ id: 'alias-1', alias: '陶瓷厂', supplierId: 'supplier-1', createdAt: '2026-01-01' }],
            },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { items: [] } });
    mockUpdate.mockResolvedValue({ data: { id: 'supplier-1' } });
    const user = userEvent.setup();

    render(<SuppliersPage />);

    await user.click(await screen.findByRole('button', { name: '选择供应商 佛山陶瓷有限公司' }));
    expect(screen.getByLabelText('公司名称 *')).toHaveValue('佛山陶瓷有限公司');
    expect(screen.getByLabelText('联系人')).toHaveValue('李总');
    expect(screen.getByText('编辑现有档案')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('联系人'));
    await user.type(screen.getByLabelText('联系人'), '李经理');
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('supplier-1', expect.objectContaining({
        name: '佛山陶瓷有限公司',
        contactName: '李经理',
        hasQualityIssue: true,
      }));
      expect(mockToastSuccess).toHaveBeenCalledWith('供应商更新成功');
    });
  });

  it('加载失败时提示错误', async () => {
    mockGetAll.mockRejectedValue(new Error('load failed'));

    render(<SuppliersPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载供应商失败');
    });
  });
});
