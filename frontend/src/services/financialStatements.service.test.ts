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

  it('应该先上传文件生成只读预览', async () => {
    const mockFile = new File(['content'], 'test.xlsx');
    const mockResponse = { code: 200, message: '预览完成', data: { previewId: 'preview-1', ready: true } };
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse);

    const result = await financialStatementsService.previewFile(mockFile, 2024, 1);

    expect(api.post).toHaveBeenCalledWith(
      '/finance/statements/import-file/preview',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    expect(result.previewId).toBe('preview-1');
  });

  it('应该携带预览凭证明确确认写入', async () => {
    const mockFile = new File(['content'], 'test.xlsx');
    const mockResponse = { code: 200, message: '确认导入成功', data: { imported: 1, overwritten: true } };
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse);

    const result = await financialStatementsService.confirmFile(
      mockFile,
      2024,
      1,
      'preview-1',
      true,
    );

    expect(api.post).toHaveBeenCalledWith(
      '/finance/statements/import-file/confirm',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    const formData = vi.mocked(api.post).mock.calls[0][1] as FormData;
    expect(formData.get('previewId')).toBe('preview-1');
    expect(formData.get('allowOverwrite')).toBe('true');
    expect(result.message).toBe('确认导入成功');
  });

  it('应该用固定角色字段上传会计报表、科目余额和明细账生成预览', async () => {
    const files = {
      statement: new File(['statement'], '会计报表.xlsx'),
      trialBalance: new File(['trial'], '科目余额.xls'),
      generalLedger: new File(['ledger'], '明细账.xlsx'),
    };
    vi.mocked(api.post).mockResolvedValueOnce({
      code: 200,
      message: '预览完成',
      data: { previewId: 'bundle-preview', ready: true },
    });

    const result = await financialStatementsService.previewBundle(files, 2026, 6);

    expect(api.post).toHaveBeenCalledWith(
      '/finance/statements/import-bundle/preview',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    const formData = vi.mocked(api.post).mock.calls[0][1] as FormData;
    expect(formData.get('statement')).toBe(files.statement);
    expect(formData.get('trialBalance')).toBe(files.trialBalance);
    expect(formData.get('generalLedger')).toBe(files.generalLedger);
    expect(result.previewId).toBe('bundle-preview');
  });

  it('应该携三份原文件和同一预览凭证确认数据包写入', async () => {
    const files = {
      statement: new File(['statement'], '会计报表.xlsx'),
      trialBalance: new File(['trial'], '科目余额.xls'),
      generalLedger: new File(['ledger'], '明细账.xlsx'),
    };
    vi.mocked(api.post).mockResolvedValueOnce({
      code: 200,
      message: '三类财务数据已写入',
      data: { imported: 3 },
    });

    const result = await financialStatementsService.confirmBundle(
      files,
      2026,
      6,
      'bundle-preview',
      true,
    );

    expect(api.post).toHaveBeenCalledWith(
      '/finance/statements/import-bundle/confirm',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    const formData = vi.mocked(api.post).mock.calls[0][1] as FormData;
    expect(formData.get('previewId')).toBe('bundle-preview');
    expect(formData.get('allowOverwrite')).toBe('true');
    expect(result.data.imported).toBe(3);
  });
});
