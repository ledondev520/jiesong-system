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

const mockIsMobile = vi.fn(() => false);

vi.mock('@/lib/hooks/useMobile', () => ({ useMobile: () => mockIsMobile() }));

const mockGetById = vi.fn();
const mockToastError = vi.fn();
const mockExportPurchasePdf = vi.fn();
const mockUpdatePurchaseStatus = vi.fn();
const mockReceiptSummary = vi.fn();
let mockReadOnly = false;

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


vi.mock('@/lib/hooks/useBusinessReadOnly', () => ({
  useBusinessReadOnly: () => mockReadOnly,
  BusinessWrite: ({ children }: { children: React.ReactNode }) => mockReadOnly ? null : <>{children}</>,
}));
vi.mock('@/services/purchaseReceipt.service', () => ({ purchaseReceiptService: { list: (...args: unknown[]) => mockReceiptSummary(...args) } }));
vi.mock('./components/PurchaseReceiptPanel', () => ({
  PurchaseReceiptPanel: ({ purchaseContractId, readOnly, onChanged }: { purchaseContractId: string; readOnly?: boolean; onChanged: () => void }) => <div data-testid="receipt-panel" data-contract={purchaseContractId} data-readonly={String(readOnly)}><button onClick={onChanged}>模拟验货更新</button></div>,
}));

describe('PurchaseDetailPage 交互逻辑', () => {
  beforeEach(() => {
    mockIsMobile.mockReturnValue(false);
    mockReadOnly = false;
    mockReceiptSummary.mockResolvedValue({ data: { summary: { complete: false } } });
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
      expect(screen.getByText('采购合同读取失败')).toBeInTheDocument();
      expect(screen.queryByText('合同不存在')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
    });
  });

  it('仅404显示不存在，未履行草稿提供更正和确认取消', async () => {
    mockGetById.mockRejectedValueOnce({ code: 404, message: '采购合同不存在' });
    const view = renderPage();
    expect(await screen.findByText('合同不存在')).toBeInTheDocument();
    expect(screen.queryByText('采购合同读取失败')).not.toBeInTheDocument();
    view.unmount();
    mockGetById.mockResolvedValue({ data: { id: 'p-1', contractNo: 'synthetic', status: 'DRAFT', paidAmount: 0, totalAmount: 100, expectedDate: '2026-10-20', items: [] } });
    mockUpdatePurchaseStatus.mockResolvedValue({ data: {} });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    expect(await screen.findByRole('button', { name: '更正草稿' })).toBeInTheDocument();
    expect(screen.getByText('2026-10-20')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '取消合同' }));
    expect(mockUpdatePurchaseStatus).toHaveBeenCalledWith('p-1', 'CANCELLED');
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
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

  it('生产中合同直接登记完工资料，无需单独推进生产状态', async () => {
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

    expect(await screen.findByRole('button', { name: '登记完工资料' })).toBeInTheDocument();
  });

  it('生产资料缺项时可直接打开补件表单，不能只改完工状态', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 'p-1',
        contractNo: 'CG2600001',
        status: 'PRODUCING',
        totalAmount: 1000,
        paidAmount: 300,
        supplier: { name: '供应商A' },
        items: [{
          id: 'pi-1',
          productId: 'product-1',
          quantity: 10,
          unitPrice: 10,
          totalPrice: 113,
          product: { customsName: '测试商品' },
        }],
        productionReadiness: {
          ready: false,
          itemCount: 1,
          incompleteItemCount: 1,
          estimatedDimensionItemCount: 1,
          totals: { boxes: 0, grossWeight: 0, netWeight: 0, volume: 0 },
          items: [{ id: 'pi-1', ready: false, dimensionsEstimated: true, issues: [{ code: 'MISSING_BOXES', label: '箱数' }] }],
        },
      },
    });

    renderPage('p-1');

    const button = await screen.findByRole('button', { name: '登记完工资料' });
    expect(button).toBeEnabled();
    await userEvent.setup().click(button);
    expect(await screen.findByRole('button', { name: '保存并登记完工' })).toBeInTheDocument();
    expect(screen.getByText(/测试商品：箱数/)).toBeInTheDocument();
  });

  it('历史生产完成合同缺生产资料时也禁止直接确认供应商发货', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 'p-1',
        contractNo: 'CG2600001',
        status: 'READY',
        totalAmount: 1000,
        paidAmount: 300,
        supplier: { name: '供应商A' },
        items: [{
          id: 'pi-1',
          productId: 'product-1',
          quantity: 10,
          unitPrice: 10,
          totalPrice: 113,
          product: { customsName: '测试商品' },
        }],
        productionReadiness: {
          ready: false,
          itemCount: 1,
          incompleteItemCount: 1,
          estimatedDimensionItemCount: 1,
          totals: { boxes: 0, grossWeight: 0, netWeight: 0, volume: 0 },
          items: [{ id: 'pi-1', ready: false, dimensionsEstimated: true, issues: [{ code: 'MISSING_VOLUME', label: '总体积' }] }],
        },
      },
    });

    renderPage('p-1');

    expect(await screen.findByRole('button', { name: '确认供应商已发货' })).toBeDisabled();
  });

  it('手机商品卡片展示不含税单价和含税合计且不重复加税', async () => {
    mockIsMobile.mockReturnValue(true);
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
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('不含税单价')).toBeInTheDocument();
  });
  it('已发货只能走分批验货，不暴露整单收货按钮且验货后刷新合同状态', async () => {
    const contract = { id: 'p-1', contractNo: 'CG-TEST', status: 'SHIPPED', totalAmount: 100, paidAmount: 0, supplier: { name: '合成供应商' }, items: [] };
    mockGetById.mockResolvedValueOnce({ data: contract }).mockResolvedValue({ data: { ...contract, status: 'RECEIVED' } });
    renderPage();
    const panel = await screen.findByTestId('receipt-panel');
    expect(panel).toHaveAttribute('data-contract', 'p-1');
    expect(screen.queryByRole('button', { name: '全部到齐并验收入库' })).not.toBeInTheDocument();
    expect(screen.getByText('请在下方分批到货与验货区域处理；到齐并合格后自动收货，付款结清后自动完成。')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText('模拟验货更新'));
    expect(await screen.findByText('已收货，付款记录结清后自动完成采购，无需再确认完成。')).toBeInTheDocument();
    expect(mockUpdatePurchaseStatus).not.toHaveBeenCalled();
  });
  it('老板的分批记录面板只读，不展示手动收货或完成动作', async () => {
    mockReadOnly = true;
    mockGetById.mockResolvedValue({ data: { id: 'p-1', contractNo: 'CG-TEST', status: 'SHIPPED', totalAmount: 100, paidAmount: 0, supplier: { name: '合成供应商' }, items: [] } });
    renderPage();
    expect(await screen.findByTestId('receipt-panel')).toHaveAttribute('data-readonly', 'true');
    expect(screen.queryByRole('button', { name: /全部到齐并验收入库|确认完成/ })).not.toBeInTheDocument();
  });

});
