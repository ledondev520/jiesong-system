/**
 * Input: 数据导入页面、导入服务、router
 * Output: 数据导入页基础交互测试结果
 * Pos: 前端数据导入页面交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataImportPage from './page';

const mockPush = vi.fn();
const mockGetImportHistory = vi.fn();
const mockGetDatabaseStats = vi.fn();
const mockPreviewCSV = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
  }),
}));

vi.mock('@/services/dataImportService', () => ({
  previewCSV: (...args: unknown[]) => mockPreviewCSV(...args),
  executeImport: vi.fn(),
  getImportHistory: (...args: unknown[]) => mockGetImportHistory(...args),
  getDatabaseStats: (...args: unknown[]) => mockGetDatabaseStats(...args),
}));

describe('DataImportPage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockGetImportHistory.mockReset();
    mockGetDatabaseStats.mockReset();
    mockPreviewCSV.mockReset();
  });

  it('初始渲染展示导入中心和历史区块', async () => {
    mockGetImportHistory.mockResolvedValue([]);
    mockGetDatabaseStats.mockResolvedValue({
      suppliers: 0,
      products: 0,
      stores: 0,
      containers: 0,
      containerItems: 0,
      salesContracts: 0,
      purchaseContracts: 0,
      inventories: 0,
    });

    render(<DataImportPage />);

    await waitFor(() => {
      expect(screen.getByText('数据导入中心')).toBeInTheDocument();
      expect(screen.getByText('导入历史')).toBeInTheDocument();
      expect(screen.getByText('暂无导入记录')).toBeInTheDocument();
    });
  });

  it('上传非CSV文件时提示格式错误', async () => {
    mockGetImportHistory.mockResolvedValue([]);
    mockGetDatabaseStats.mockResolvedValue({
      suppliers: 0,
      products: 0,
      stores: 0,
      containers: 0,
      containerItems: 0,
      salesContracts: 0,
      purchaseContracts: 0,
      inventories: 0,
    });

    const user = userEvent.setup({ applyAccept: false });
    const { container } = render(<DataImportPage />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    if (!input) return;

    const badFile = new File(['x'], 'bad.txt', { type: 'text/plain' });
    await user.upload(input, badFile);

    await waitFor(() => {
      expect(screen.getByText('请上传CSV格式的文件')).toBeInTheDocument();
    });
  });
});

