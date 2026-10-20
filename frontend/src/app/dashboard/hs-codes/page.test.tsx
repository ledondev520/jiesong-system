import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import HsCodesPage from './page';

const mockList = vi.fn();
const mockUpdate = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard/hs-codes',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/services/hsCode.service', () => ({
  hsCodeService: {
    list: (...args: unknown[]) => mockList(...args),
    search: vi.fn(),
    getByCode: vi.fn(),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

describe('HsCodesPage', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockUpdate.mockReset();
    mockList.mockResolvedValue({
      data: {
        items: [
          {
            id: 'hs-1',
            hsCode: '69072190',
            productName: '抛光瓷砖',
            unit: '平方米',
            refundRate: 13,
            supervisionConditions: 'A:入境货物通关单 | B:出境货物通关单',
            inspectionQuarantine: 'M:进口商品检验 | N:出口商品检验',
            declarationElements: '品牌类型|出口享惠情况|用途|加工程度',
          },
        ],
        pagination: {
          page: 1,
          pageSize: 50,
          total: 1,
          totalPages: 1,
        },
      },
    });
    mockUpdate.mockResolvedValue({
      data: {
        id: 'hs-1',
        hsCode: '69072190',
        productName: '抛光瓷砖',
        unit: '平方米',
        refundRate: 0,
        vatRate: 13,
        effectiveDate: '2026-01-01T00:00:00.000Z',
        sourceUrl: 'https://www.chinatax.gov.cn/example',
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('默认先加载 HSCode 列表', async () => {
    render(<HsCodesPage />);

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }));
    });
    expect(await screen.findByRole('cell', { name: '抛光瓷砖' })).toBeInTheDocument();
  });

  it('输入关键字后按关键字重新加载列表', async () => {
    render(<HsCodesPage />);

    const input = await screen.findByPlaceholderText('商品名称（支持模糊匹配）');
    fireEvent.change(input, { target: { value: '瓷砖' } });

    await waitFor(() => {
      expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: '瓷砖', page: 1, pageSize: 20 }));
    });
  });

  it('详情页将申报要素拆分为更直观的分项展示', async () => {
    render(<HsCodesPage />);

    fireEvent.click(await screen.findByRole('cell', { name: '抛光瓷砖' }));

    expect(await screen.findByText('申报要素')).toBeInTheDocument();
    expect(screen.getByText('品牌类型')).toBeInTheDocument();
    expect(screen.getByText('出口享惠情况')).toBeInTheDocument();
    expect(screen.getByText('用途')).toBeInTheDocument();
    expect(screen.getByText('加工程度')).toBeInTheDocument();
  });

  it('详情页将监管条件与检验检疫拆分为可视化条目', async () => {
    render(<HsCodesPage />);

    fireEvent.click(await screen.findByRole('cell', { name: '抛光瓷砖' }));

    expect(await screen.findByText('监管条件')).toBeInTheDocument();
    expect(screen.getByText('入境货物通关单')).toBeInTheDocument();
    expect(screen.getByText('出境货物通关单')).toBeInTheDocument();

    expect(screen.getByText('检验检疫')).toBeInTheDocument();
    expect(screen.getByText('进口商品检验')).toBeInTheDocument();
    expect(screen.getByText('出口商品检验')).toBeInTheDocument();
  });

  it('详情页可人工更新退税率并强制留存生效日期和来源', async () => {
    render(<HsCodesPage />);

    fireEvent.click(await screen.findByRole('cell', { name: '抛光瓷砖' }));
    fireEvent.click(await screen.findByRole('button', { name: '人工更新税则' }));

    fireEvent.change(screen.getByLabelText('出口退税率（%）'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('生效日期'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('官方来源链接'), {
      target: { value: 'https://www.chinatax.gov.cn/example' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存税则证据' }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('69072190', expect.objectContaining({
        refundRate: 0,
        effectiveDate: '2026-01-01',
        sourceUrl: 'https://www.chinatax.gov.cn/example',
      }));
    });
  });
});
