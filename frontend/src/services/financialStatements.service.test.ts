/**
 * Financial Statements Service 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { financialStatementsService } from './financialStatements.service';
import api from '@/lib/axios';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('financialStatementsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该从文件夹导入', async () => {
    const mockResponse = { code: 200, data: { imported: 5, skipped: 0, errors: [] } };
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse);

    const result = await financialStatementsService.importFromFolder();

    expect(api.post).toHaveBeenCalledWith('/finance/statements/import-folder');
    expect(result.imported).toBe(5);
  });

  it('应该获取账期列表', async () => {
    const mockResponse = { code: 200, data: [{ id: '1', year: 2024, month: 1 }] };
    vi.mocked(api.get).mockResolvedValueOnce(mockResponse);

    const result = await financialStatementsService.listStatements();

    expect(api.get).toHaveBeenCalledWith('/finance/statements');
    expect(result).toHaveLength(1);
  });

  it('应该获取账期详情', async () => {
    const mockResponse = { code: 200, data: { id: 'fs-1', year: 2024, month: 1 } };
    vi.mocked(api.get).mockResolvedValueOnce(mockResponse);

    const result = await financialStatementsService.getStatementDetail(2024, 1);

    expect(api.get).toHaveBeenCalledWith('/finance/statements/2024/1');
    expect(result?.id).toBe('fs-1');
  });

  it('应该获取财务分析', async () => {
    const mockResponse = { code: 200, data: { trends: [], alerts: [], totalPeriods: 10 } };
    vi.mocked(api.get).mockResolvedValueOnce(mockResponse);

    const result = await financialStatementsService.getAnalytics();

    expect(api.get).toHaveBeenCalledWith('/finance/statements/analytics');
    expect(result.totalPeriods).toBe(10);
  });

  it('应该导入文件', async () => {
    const mockFile = new File(['content'], 'test.xlsx');
    const mockResponse = { code: 200, message: '导入成功', data: { imported: 1, skipped: 0, errors: [] } };
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse);

    const result = await financialStatementsService.importFile(mockFile, 2024, 1);

    expect(api.post).toHaveBeenCalled();
    expect(result.message).toBe('导入成功');
  });
});
