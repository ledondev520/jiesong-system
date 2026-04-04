/**
 * Input: 报关单列表页、customsDeclarationService、URL 查询参数、toast、router
 * Output: 报关单列表页交互测试结果
 * Pos: 报关单管理前端业务页测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomsDeclarationsPage from './page';

const mockGetAll = vi.fn();
const mockGenerateDrafts = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockSearchParamGet = vi.fn();
const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
    back: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (...args: unknown[]) => mockSearchParamGet(...args),
  }),
  usePathname: () => '/customs-declarations',
}));

vi.mock('@/services/customsDeclaration.service', () => ({
  customsDeclarationService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    generateDrafts: (...args: unknown[]) => mockGenerateDrafts(...args),
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

describe('CustomsDeclarationsPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockGenerateDrafts.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
    mockRouterPush.mockReset();
    mockSearchParamGet.mockReset();
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === 'keyword') return '';
      if (key === 'status') return 'ALL';
      return null;
    });
  });

  it('根据 URL 查询参数初始化筛选并加载报关单', async () => {
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === 'keyword') return 'CUS-2026';
      if (key === 'status') return 'SUBMITTED';
      return null;
    });
    mockGetAll.mockResolvedValue({
      data: {
        items: [
          {
            id: 'cd-1',
            declarationNo: 'CUS-2026-001',
            status: 'SUBMITTED',
            exporter: '捷淞供应链',
            consignee: 'Lima Tiles SAC',
            destinationCountry: '秘鲁',
            declarationDate: '2026-03-01',
            totalAmount: 120000,
            currency: 'USD',
            totalPackages: 1800,
            grossWeight: 21500,
            netWeight: 20800,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-02T00:00:00.000Z',
          },
        ],
      },
    });

    render(<CustomsDeclarationsPage />);

    await waitFor(() => {
      expect(mockGetAll).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        keyword: 'CUS-2026',
        status: 'SUBMITTED',
      });
    });

    expect(screen.getByDisplayValue('CUS-2026')).toBeInTheDocument();
    expect(screen.getByText('CUS-2026-001')).toBeInTheDocument();
    expect(screen.getByText('捷淞供应链')).toBeInTheDocument();
  });

  it('修改关键词后重新查询并可跳转详情页', async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [
          {
            id: 'cd-2',
            declarationNo: 'CUS-2026-002',
            status: 'DRAFT',
            exporter: '捷淞供应链',
            consignee: 'Quito Home',
            destinationCountry: '厄瓜多尔',
            declarationDate: '2026-03-03',
            totalAmount: 86000,
            currency: 'USD',
            totalPackages: 900,
            grossWeight: 11000,
            netWeight: 10400,
            createdAt: '2026-03-03T00:00:00.000Z',
            updatedAt: '2026-03-03T00:00:00.000Z',
          },
        ],
      },
    });

    const user = userEvent.setup();
    render(<CustomsDeclarationsPage />);

    const searchInput = screen.getByPlaceholderText('搜索报关单号、客户或目的国...');
    await user.clear(searchInput);
    await user.type(searchInput, '厄瓜多尔');

    await waitFor(() => {
      expect(mockGetAll).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        keyword: '厄瓜多尔',
        status: undefined,
      });
    });

    await user.click(screen.getByRole('button', { name: /查看详情 CUS-2026-002/ }));
    expect(mockRouterPush).toHaveBeenCalledWith('/customs-declarations/cd-2');
  });

  it('加载失败时提示错误', async () => {
    mockGetAll.mockRejectedValue(new Error('load failed'));

    render(<CustomsDeclarationsPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载报关单失败');
    });
  });

  it('点击自动生成草稿后提示结果并刷新列表', async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [],
      },
    });
    mockGenerateDrafts.mockResolvedValue({
      data: {
        created: 3,
        skipped: 1,
      },
    });

    const user = userEvent.setup();
    render(<CustomsDeclarationsPage />);

    await user.click(screen.getByRole('button', { name: '自动生成草稿' }));

    await waitFor(() => {
      expect(mockGenerateDrafts).toHaveBeenCalledWith({});
    });

    expect(mockToastSuccess).toHaveBeenCalledWith('自动生成完成：新增 3 条，跳过 1 条');
    expect(mockGetAll).toHaveBeenCalledTimes(2);
  });
});
