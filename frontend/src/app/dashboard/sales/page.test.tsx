/**
 * Input: 出口合同页面、salesService、router、toast
 * Output: 出口合同页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SalesPage from './page';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockParams = new URLSearchParams();
const mockGetAll = vi.fn();
const mockDelete = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const { mockBatchImportDialog } = vi.hoisted(() => ({
  mockBatchImportDialog: vi.fn(),
}));

vi.mock('@/components/batch-import', () => ({
  BatchImportDialog: (props: { open: boolean }) => {
    mockBatchImportDialog(props);
    return <div data-testid="batch-import-dialog" data-open={String(props.open)} />;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  usePathname: () => '/dashboard/sales',
  useSearchParams: () => mockParams,
}));

vi.mock('@/services/sales.service', () => ({
  salesService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
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

describe('SalesPage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockReplace.mockReset();
    mockParams = new URLSearchParams();
    mockGetAll.mockReset();
    mockDelete.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
    mockBatchImportDialog.mockReset();
  });

  it('加载后展示出口模块概览与空态文案', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    render(<SalesPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '出口合同' })).toBeInTheDocument();
      expect(screen.getByText('待装柜')).toBeInTheDocument();
      expect(screen.getByText('在途')).toBeInTheDocument();
      expect(screen.getAllByText('暂无出口合同')).toHaveLength(2);
    });
  });

  it('报表期间保留至第6页，第101条可达且服务端搜索后回首页', async () => {
    mockParams = new URLSearchParams('shipped=true&shippedFrom=2026-09-01&shippedTo=2026-09-30&page=6');
    mockGetAll.mockResolvedValue({ data: { items: [{ id: 'sales-101', contractNo: 'SYNTHETIC101', status: 'SHIPPED', signedAt: null, totalAmount: 100, receivedAmount: 0, totalBoxes: 0, volume: 0, grossWeight: 0 }], pagination: { total: 121 } } });
    render(<SalesPage />);
    expect(await screen.findByTestId('contract-row-SYNTHETIC101')).toBeInTheDocument();
    expect(mockGetAll).toHaveBeenLastCalledWith(expect.objectContaining({ page: 6, pageSize: 20, shipped: true, shippedFrom: '2026-09-01', shippedTo: '2026-09-30' }));
    expect(screen.getByText('共 121 条，第 6/7 页')).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('sales-search-input'), '目标港口');
    await waitFor(() => expect(mockGetAll).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, keyword: '目标港口', shipped: true, shippedFrom: '2026-09-01', shippedTo: '2026-09-30' })));
    expect(mockReplace).toHaveBeenLastCalledWith('/dashboard/sales?shipped=true&shippedFrom=2026-09-01&shippedTo=2026-09-30&q=%E7%9B%AE%E6%A0%87%E6%B8%AF%E5%8F%A3', { scroll: false });
  });

  it('点击新增出口合同按钮会跳转创建页', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<SalesPage />);

    await user.click(screen.getByRole('button', { name: /新增出口合同/ }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/sales/create');
  });

  it('初始不挂载 Excel 导入 Module，点击批量导入后才加载', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<SalesPage />);

    await screen.findByRole('heading', { name: '出口合同' });
    expect(mockBatchImportDialog).not.toHaveBeenCalled();

    const importButtons = screen.getAllByRole('button', { name: '批量导入' });
    await user.click(importButtons[0]);

    await waitFor(() => {
      expect(mockBatchImportDialog).toHaveBeenCalledWith(expect.objectContaining({ open: true }));
    });
  });

  it('加载失败时提示错误', async () => {
    mockGetAll.mockRejectedValue(new Error('load failed'));
    render(<SalesPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载出口合同失败');
    });
  });

  it('加载失败不显示正常空态；重试保留SHIPPED范围', async () => {
    mockParams = new URLSearchParams('status=SHIPPED');
    mockGetAll.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: { items: [], pagination: { total: 0 } } });
    render(<SalesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('出口合同读取失败');
    expect(screen.queryByText('暂无出口合同')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(mockGetAll).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, status: 'SHIPPED' })));
    expect(await screen.findAllByText('暂无出口合同')).toHaveLength(2);
  });

  it('删除成功后提示并刷新列表', async () => {
    const contract = {
      id: 'sc-1',
      contractNo: 'EXP2500001',
      status: 'DRAFT',
      signedAt: null,
      totalBoxes: 1,
      volume: 1.2,
      grossWeight: 100,
      totalAmount: 1000,
      hasThirdPartyCargo: true,
      sourceParties: ['阿珍贵州'],
      port: { name: '深圳' },
      stores: ['禧瑞都'],
    };
    mockGetAll.mockResolvedValue({ data: { items: [contract] } });
    mockDelete.mockResolvedValue({ code: 200 });
    const user = userEvent.setup();
    render(<SalesPage />);

    const deleteButton = await screen.findByRole('button', { name: /删除合同 EXP2500001/ });
    await user.click(deleteButton);
    await user.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('sc-1');
      expect(mockToastSuccess).toHaveBeenCalledWith('合同 EXP2500001 已删除');
      expect(screen.getAllByText('含第三方拼柜').length).toBeGreaterThan(0);
      expect(screen.getByText('来源方：阿珍贵州')).toBeInTheDocument();
    });
  });

  it('删除失败时提示错误', async () => {
    const contract = {
      id: 'sc-2',
      contractNo: 'EXP2500002',
      status: 'DRAFT',
      signedAt: null,
      totalBoxes: 1,
      volume: 1.2,
      grossWeight: 100,
      totalAmount: 1000,
      port: { name: '宁波' },
    };
    mockGetAll.mockResolvedValue({ data: { items: [contract] } });
    mockDelete.mockRejectedValue(new Error('delete failed'));
    const user = userEvent.setup();
    render(<SalesPage />);

    const deleteButton = await screen.findByRole('button', { name: /删除合同 EXP2500002/ });
    await user.click(deleteButton);
    await user.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('删除合同失败');
    });
  });
});
