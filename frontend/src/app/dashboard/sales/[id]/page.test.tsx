/**
 * Input: 销售合同详情页、sales/product/store/inventory 服务、router、toast
 * Output: 销售合同详情页交互逻辑测试结果
 * Pos: 前端详情页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import SalesDetailPage from './page';

const mockIsMobile = vi.fn(() => false);

vi.mock('@/lib/hooks/useMobile', () => ({ useMobile: () => mockIsMobile() }));

const mockGetById = vi.fn();
const mockProductGetAll = vi.fn();
const mockStoreGetAll = vi.fn();
const mockInventoryGetAll = vi.fn();
const mockApiGet = vi.fn();
const mockApiDelete = vi.fn();
const mockToastError = vi.fn();
const mockExportPdf = vi.fn();
const mockExportExcel = vi.fn();
const mockUpdateSalesStatus = vi.fn();
const mockForexRender = vi.fn();

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (value: unknown) => {
      if (value && typeof (value as { then?: unknown }).then === 'function') {
        return { id: 's-1' };
      }
      return actual.use(value as never);
    },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/services/sales.service', () => ({
  salesService: {
    getById: (...args: unknown[]) => mockGetById(...args),
    update: vi.fn(),
    addPackingItem: vi.fn(),
    updatePackingItem: vi.fn(),
    removePackingItem: vi.fn(),
    exportPdf: (...args: unknown[]) => mockExportPdf(...args),
    exportExcel: (...args: unknown[]) => mockExportExcel(...args),
    updateStatus: (...args: unknown[]) => mockUpdateSalesStatus(...args),
  },
}));

vi.mock('@/services/product.service', () => ({
  productService: {
    getAll: (...args: unknown[]) => mockProductGetAll(...args),
  },
}));

vi.mock('@/services/store.service', () => ({
  storeService: {
    getAll: (...args: unknown[]) => mockStoreGetAll(...args),
  },
}));

vi.mock('@/services/inventory.service', () => ({
  inventoryService: {
    getAll: (...args: unknown[]) => mockInventoryGetAll(...args),
  },
}));

vi.mock('@/lib/axios', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/components/sales/ContractInfoEditor', () => ({
  ContractInfoEditor: () => <div>合同信息编辑区</div>,
}));

vi.mock('@/components/container/Container3DView', () => ({
  default: () => <div>3D容器视图</div>,
}));

vi.mock('@/components/dialog/GenerateThreeFormsDialog', () => ({
  GenerateThreeFormsDialog: ({ open }: { open: boolean }) => (
    open ? <div>申报三表 HS 处理区</div> : null
  ),
}));

vi.mock('@/components/dialog/ExportPacketWorkbenchDialog', () => ({
  ExportPacketWorkbenchDialog: ({ open }: { open: boolean }) => (
    open ? <div>出口三单预检区</div> : null
  ),
}));

vi.mock('./components/SalesFinancePanel', () => ({
  SalesFinancePanel: () => <div>单柜财务测试面板</div>,
}));
vi.mock('@/components/finance/ForexVerificationPanel', () => ({
  ForexVerificationPanel: ({ salesContractId }: { salesContractId: string }) => {
    mockForexRender(salesContractId);
    return <div>合同核销跟进测试面板</div>;
  },
}));

describe('SalesDetailPage 交互逻辑', () => {
  beforeEach(() => {
    mockIsMobile.mockReturnValue(false);
    mockGetById.mockReset();
    mockProductGetAll.mockReset();
    mockStoreGetAll.mockReset();
    mockInventoryGetAll.mockReset();
    mockApiGet.mockReset();
    mockApiDelete.mockReset();
    mockToastError.mockReset();
    mockExportPdf.mockReset();
    mockExportExcel.mockReset();
    mockUpdateSalesStatus.mockReset();
    mockForexRender.mockReset();
    mockApiGet.mockResolvedValue({ data: [] });
  });

  /**
   * 职责：使用 Suspense 渲染依赖 use(params) 的详情页
   * 思路：统一包裹 fallback，确保 Promise params 能被 React 解析
   * @param id 合同ID
   */
  const renderPage = (id = 's-1') => {
    return render(
      <Suspense fallback={<div>页面加载中...</div>}>
        <SalesDetailPage params={Promise.resolve({ id })} />
      </Suspense>,
    );
  };

  it('加载成功后展示合同号与空装箱态', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 's-1',
        contractNo: 'EXP2500001',
        status: 'DRAFT',
        totalBoxes: 0,
        volume: 0,
        grossWeight: 0,
        totalAmount: 0,
        packingItems: [],
        port: { name: 'LA' },
      },
    });
    renderPage('s-1');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'EXP2500001' })).toBeInTheDocument();
      expect(screen.getByText('暂无装箱商品，可从已完工采购导入，也可手动添加')).toBeInTheDocument();
      expect(screen.getByText('暂无附件，点击「上传附件」归档出货源文件')).toBeInTheDocument();
    });
    expect(mockApiGet).toHaveBeenCalledWith('/contracts/s-1/files', { params: { contractType: 'SALES' } });
    expect(mockProductGetAll).not.toHaveBeenCalled();
    expect(mockStoreGetAll).not.toHaveBeenCalled();
    expect(mockInventoryGetAll).not.toHaveBeenCalled();
  });

  it('点击添加商品会打开明细弹窗', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 's-1',
        contractNo: 'EXP2500001',
        status: 'DRAFT',
        totalBoxes: 0,
        volume: 0,
        grossWeight: 0,
        totalAmount: 0,
        packingItems: [],
        port: { name: 'LA' },
      },
    });
    mockProductGetAll.mockResolvedValue({ data: { items: [] } });
    mockStoreGetAll.mockResolvedValue({ data: { items: [] } });
    mockInventoryGetAll.mockResolvedValue({ data: { items: [] } });

    const user = userEvent.setup();
    renderPage('s-1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /添加商品/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /添加商品/ }));
    expect(screen.getByText('添加商品到货柜')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockProductGetAll).toHaveBeenCalled();
      expect(mockStoreGetAll).toHaveBeenCalled();
      expect(mockInventoryGetAll).toHaveBeenCalled();
    });
  });

  it('加载失败时提示错误', async () => {
    mockGetById.mockRejectedValue(new Error('load failed'));
    mockProductGetAll.mockResolvedValue({ data: { items: [] } });
    mockStoreGetAll.mockResolvedValue({ data: { items: [] } });
    mockInventoryGetAll.mockResolvedValue({ data: { items: [] } });

    renderPage('s-1');

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载数据失败');
    });
  });

  it('导出 PDF 按钮已移除，页面只保留保存为图片', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 's-1',
        contractNo: 'EXP2500001',
        status: 'DRAFT',
        totalBoxes: 0,
        volume: 0,
        grossWeight: 0,
        totalAmount: 0,
        packingItems: [],
        port: { name: 'LA' },
      },
    });
    mockProductGetAll.mockResolvedValue({ data: { items: [] } });
    mockStoreGetAll.mockResolvedValue({ data: { items: [] } });
    mockInventoryGetAll.mockResolvedValue({ data: { items: [] } });

    renderPage('s-1');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /导出合同 PDF/ })).not.toBeInTheDocument();
    });
  });

  it('详情页可直接导出标准出口工作簿', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 's-1',
        contractNo: 'EXP260008',
        status: 'PACKING',
        totalBoxes: 1,
        volume: 60,
        grossWeight: 1000,
        totalAmount: 100,
        packingItems: [],
        port: { name: 'Oakland' },
      },
    });
    mockExportExcel.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage('s-1');

    const exportButton = await screen.findByRole('button', { name: '导出出口工作簿' });
    await user.click(exportButton);

    expect(mockExportExcel).toHaveBeenCalledWith('s-1', 'EXP260008');
  });

  it('详情页区分出口三单工作台与申报三表入口', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 's-1',
        contractNo: 'EXP260011',
        status: 'DRAFT',
        exchangeRate: 6.8,
        totalBoxes: 0,
        volume: 0,
        grossWeight: 0,
        netWeight: 0,
        totalAmount: 0,
        packingItems: [],
        port: { name: '洛杉矶' },
      },
    });
    const user = userEvent.setup();
    renderPage('s-1');

    await user.click(await screen.findByRole('button', { name: '出口三单工作台' }));
    expect(await screen.findByText('出口三单预检区')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生成申报三表' })).toBeInTheDocument();
  });

  it('报关汇总明确警示缺失 HS 编码的装箱商品并提供处理入口', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 's-1',
        contractNo: 'EXP260008',
        status: 'PACKING',
        totalBoxes: 2,
        volume: 2,
        grossWeight: 200,
        totalAmount: 200,
        packingItems: [
          {
            id: 'pk-ready',
            productId: 'p-ready',
            quantity: 1,
            boxes: 1,
            totalPrice: 100,
            product: { id: 'p-ready', customsName: '灯具', hsCode: '9405110000' },
          },
          {
            id: 'pk-missing',
            productId: 'p-missing',
            quantity: 1,
            boxes: 1,
            totalPrice: 100,
            product: { id: 'p-missing', customsName: '隔断', hsCode: null },
          },
        ],
        port: { name: 'Oakland' },
      },
    });
    const user = userEvent.setup();
    renderPage('s-1');

    await user.click(await screen.findByRole('tab', { name: '报关信息' }));

    expect(screen.getByText('仍有 1 项装箱商品未匹配 HS 编码')).toBeInTheDocument();
    expect(screen.getByText('未匹配：隔断')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '处理未匹配 HS 编码' }));
    expect(await screen.findByText('申报三表 HS 处理区')).toBeInTheDocument();
  });

  it('报关汇总不会把相同 HS 编码的不同商品合并成一行', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 's-1',
        contractNo: 'EXP260008',
        status: 'PACKING',
        totalBoxes: 2,
        volume: 2,
        grossWeight: 200,
        totalAmount: 4200,
        packingItems: [
          {
            id: 'pk-bar',
            productId: 'p-bar',
            quantity: 3,
            boxes: 1,
            totalPrice: 1200,
            product: { id: 'p-bar', customsName: '1.2米常温调酒台', hsCode: '9403200000' },
          },
          {
            id: 'pk-screen',
            productId: 'p-screen',
            quantity: 1,
            boxes: 1,
            totalPrice: 3000,
            product: { id: 'p-screen', customsName: '隔断', hsCode: '9403200000' },
          },
        ],
        port: { name: 'Oakland' },
      },
    });
    const user = userEvent.setup();
    renderPage('s-1');

    await user.click(await screen.findByRole('tab', { name: '报关信息' }));
    const customsPanel = screen.getByRole('tabpanel', { name: '报关信息' });

    expect(within(customsPanel).getByRole('row', { name: /1\.2米常温调酒台 3/ })).toBeInTheDocument();
    expect(within(customsPanel).getByRole('row', { name: /隔断 1/ })).toBeInTheDocument();
  });

  it('商业利用率达标但有箱件未装下时禁止确认发运', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 's-1',
        contractNo: 'EXP260008',
        status: 'PACKING',
        totalBoxes: 1,
        volume: 60,
        grossWeight: 1000,
        totalAmount: 100,
        packingItems: [
          {
            id: 'pk-oversize',
            productId: 'p-1',
            boxes: 1,
            quantity: 1,
            volume: 60,
            length: 13000,
            width: 1000,
            height: 1000,
            product: { id: 'p-1', customsName: '超长货物' },
          },
        ],
        port: { name: 'Oakland' },
      },
    });

    renderPage('s-1');

    expect(await screen.findByText('不可出货：仍有 1 箱未装下')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认发运' })).toBeDisabled();
  });

  it('装柜达标且全部箱件可放下时允许确认发运', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 's-1',
        contractNo: 'EXP260008',
        status: 'PACKING',
        totalBoxes: 1,
        volume: 60,
        grossWeight: 1000,
        totalAmount: 100,
        packingItems: [
          {
            id: 'pk-fit',
            productId: 'p-1',
            boxes: 1,
            quantity: 1,
            volume: 60,
            length: 1000,
            width: 1000,
            height: 1000,
            product: { id: 'p-1', customsName: '可装货物' },
          },
        ],
        port: { name: 'Oakland' },
      },
    });
    mockUpdateSalesStatus.mockResolvedValue({ data: { status: 'SHIPPED' } });
    const user = userEvent.setup();
    renderPage('s-1');

    const shipButton = await screen.findByRole('button', { name: '确认发运' });
    expect(shipButton).toBeEnabled();
    await user.click(shipButton);

    expect(mockUpdateSalesStatus).toHaveBeenCalledWith('s-1', 'SHIPPED');
  });

  it('手机装箱卡片编辑保持采购来源数量、箱数、重量和尺寸锁定', async () => {
    mockIsMobile.mockReturnValue(true);
    mockGetById.mockResolvedValue({
      data: {
        id: 's-1',
        contractNo: 'EXP260008',
        status: 'PACKING',
        totalBoxes: 4,
        volume: 2,
        grossWeight: 400,
        totalAmount: 0,
        packingItems: [{
          id: 'pk-imported',
          purchaseItemId: 'pi-1',
          purchaseContractNo: 'CG260001',
          productId: 'p-1',
          quantity: 40,
          boxes: 4,
          unitPrice: null,
          grossWeight: 400,
          netWeight: 380,
          volume: 2,
          length: 500,
          width: 400,
          height: 300,
          product: { id: 'p-1', customsName: '已完工商品' },
        }],
        port: { name: 'Oakland' },
      },
    });
    mockProductGetAll.mockResolvedValue({ data: { items: [] } });
    mockStoreGetAll.mockResolvedValue({ data: { items: [] } });
    mockInventoryGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    renderPage('s-1');

    const editButton = await screen.findByRole('button', { name: '编辑 已完工商品' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await user.click(editButton);

    expect(screen.getByText(/若需改变箱数，请删除后重新导入/)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '数量' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: '箱数' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: '毛重' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: '净重' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: '体积' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: '单价' })).toBeEnabled();
  });
  it('核销跟进只在财务标签加载并绑定当前合同', async () => {
    mockGetById.mockResolvedValue({ data: {
      id: 's-1', contractNo: 'EXP-TEST', status: 'DRAFT', totalBoxes: 0,
      volume: 0, grossWeight: 0, totalAmount: 0, packingItems: [], port: { name: '测试港' },
    } });
    const user = userEvent.setup();
    renderPage('s-1');
    await screen.findByRole('heading', { name: 'EXP-TEST' });
    expect(mockForexRender).not.toHaveBeenCalled();
    expect(screen.queryByText('合同核销跟进测试面板')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '财务结算' }));
    expect(await screen.findByText('合同核销跟进测试面板')).toBeInTheDocument();
    expect(mockForexRender).toHaveBeenCalledWith('s-1');
  });

});
