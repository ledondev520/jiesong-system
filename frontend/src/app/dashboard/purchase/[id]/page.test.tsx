/**
 * Input: 采购合同详情页、purchaseService、contractDocService、router、toast
 * Output: 采购合同详情页交互逻辑测试结果
 * Pos: 前端详情页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import PurchaseDetailPage from './page';

const mockGetById = vi.fn();
const mockToastError = vi.fn();
const mockExportPurchasePdf = vi.fn();
const mockUpdatePurchaseStatus = vi.fn();

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (value: unknown) => {
      if (value && typeof (value as { then?: unknown }).then === 'function') {
        return { id: 'p-1' };
      }
      return actual.use(value as never);
    },
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/services/purchase.service', () => ({
  purchaseService: {
    getById: (...args: unknown[]) => mockGetById(...args),
    updateStatus: (...args: unknown[]) => mockUpdatePurchaseStatus(...args),
  },
}));

vi.mock('@/services/contractDoc.service', () => ({
  contractDocService: {
    generateFromPurchase: vi.fn(),
    downloadDocument: vi.fn(),
    getContractPdf: vi.fn(),
    exportPurchasePdf: (...args: unknown[]) => mockExportPurchasePdf(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/api-cache', () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    create: vi.fn().mockReturnThis(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));


describe('PurchaseDetailPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetById.mockReset();
    mockToastError.mockReset();
    mockExportPurchasePdf.mockReset();
    mockUpdatePurchaseStatus.mockReset();
  });

  /**
   * 职责：使用 Suspense 渲染依赖 use(params) 的详情页
   * 思路：统一包裹 fallback，确保 Promise params 能被 React 解析
   * @param id 合同ID
   */
  const renderPage = (id = 'p-1') => {
    return render(
      <Suspense fallback={<div>页面加载中...</div>}>
        <PurchaseDetailPage params={Promise.resolve({ id })} />
      </Suspense>,
    );
  };

  it('加载成功后展示合同信息与商品空态', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 'p-1',
        contractNo: 'PO2500001',
        status: 'DRAFT',
        totalAmount: 0,
        paidAmount: 0,
        supplier: { name: '供应商A' },
        items: [],
      },
    });

    renderPage('p-1');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'PO2500001' })).toBeInTheDocument();
      expect(screen.getByText('暂无商品明细')).toBeInTheDocument();
      expect(screen.getByRole('list', { name: '采购合同进度' })).toBeInTheDocument();
    });
  });

  it('点击生成购销合同会打开弹窗', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 'p-1',
        contractNo: 'PO2500001',
        status: 'DRAFT',
        totalAmount: 0,
        paidAmount: 0,
        supplier: { name: '供应商A' },
        items: [],
      },
    });

    const user = userEvent.setup();
    renderPage('p-1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /生成购销合同/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /生成购销合同/ }));
    expect(screen.getByText('填写收货信息后，系统将自动生成标准购销合同文档')).toBeInTheDocument();
  });

  it('加载失败时提示错误', async () => {
    mockGetById.mockRejectedValue(new Error('load failed'));
    renderPage('p-1');

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载合同详情失败');
    });
  });

  it('点击导出 PDF 会调用服务', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 'p-1',
        contractNo: 'PO2500001',
        status: 'DRAFT',
        totalAmount: 0,
        paidAmount: 0,
        supplier: { name: '供应商A' },
        items: [],
      },
    });
    mockExportPurchasePdf.mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderPage('p-1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /导出 PDF/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /导出 PDF/ }));

    expect(mockExportPurchasePdf).toHaveBeenCalledWith('p-1', 'PO2500001');
  });

  it('详情页提供明确的下一阶段动作并顺序推进状态', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 'p-1',
        contractNo: 'CG2600001',
        status: 'DRAFT',
        totalAmount: 1000,
        paidAmount: 0,
        supplier: { name: '供应商A' },
        items: [],
      },
    });
    mockUpdatePurchaseStatus.mockResolvedValue({ data: { status: 'SIGNED' } });

    const user = userEvent.setup();
    renderPage('p-1');

    const nextButton = await screen.findByRole('button', { name: '确认已签约' });
    await user.click(nextButton);

    expect(mockUpdatePurchaseStatus).toHaveBeenCalledWith('p-1', 'SIGNED');
  });

  it('生产中合同的下一动作是确认生产完成', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 'p-1',
        contractNo: 'CG2600001',
        status: 'PRODUCING',
        totalAmount: 1000,
        paidAmount: 300,
        supplier: { name: '供应商A' },
        items: [],
      },
    });

    renderPage('p-1');

    expect(await screen.findByRole('button', { name: '确认生产完成' })).toBeInTheDocument();
  });

  it('采购详情把单价解释为不含税、明细与合同总额解释为含税且不重复加税', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 'p-1',
        contractNo: 'CG2600002',
        status: 'SIGNED',
        taxRate: 13,
        totalAmount: 1130,
        paidAmount: 300,
        supplier: { name: '供应商A' },
        items: [{
          id: 'pi-1',
          purchaseContractId: 'p-1',
          productId: 'product-1',
          quantity: 10,
          unit: '件',
          unitPrice: 100,
          totalPrice: 1130,
          product: { customsName: '酒架', unit: '件' },
        }],
      },
    });

    renderPage('p-1');

    expect(await screen.findByText('不含税合计')).toBeInTheDocument();
    expect(screen.getByText('含税合计')).toBeInTheDocument();
    expect(screen.getByText('¥1,000')).toBeInTheDocument();
    expect(screen.getByText('¥130')).toBeInTheDocument();
    expect(screen.queryByText('¥1,276.9')).not.toBeInTheDocument();
  });
});
