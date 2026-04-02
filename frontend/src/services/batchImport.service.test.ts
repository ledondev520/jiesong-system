/**
 * Batch Import Service 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { batchImportService } from './batchImport.service';
import api from '@/lib/axios';

// Mock axios
vi.mock('@/lib/axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

describe('batchImportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('importSales', () => {
    it('应该成功导入销售合同', async () => {
      const mockData = [
        { contractNo: 'EXP001', port: 'Shanghai', totalAmount: 1000 },
        { contractNo: 'EXP002', port: 'Ningbo', totalAmount: 2000 },
      ];

      const mockResponse = {
        code: 200,
        data: {
          total: 2,
          success: 2,
          failed: 0,
          errors: [],
        },
        message: '导入成功',
      };

      vi.mocked(api.post).mockResolvedValueOnce({ data: mockResponse });

      const result = await batchImportService.importSales(mockData);

      expect(api.post).toHaveBeenCalledWith('/batch-import/sales', { data: mockData });
      expect(result).toEqual(mockResponse);
      expect(result.data.success).toBe(2);
    });

    it('应该处理部分失败的情况', async () => {
      const mockData = [
        { contractNo: 'EXP001', port: 'Shanghai', totalAmount: 1000 },
        { contractNo: 'EXP002', port: 'Ningbo', totalAmount: 2000 },
      ];

      const mockResponse = {
        code: 200,
        data: {
          total: 2,
          success: 1,
          failed: 1,
          errors: [{ row: 2, message: '合同号已存在' }],
        },
        message: '部分导入成功',
      };

      vi.mocked(api.post).mockResolvedValueOnce({ data: mockResponse });

      const result = await batchImportService.importSales(mockData);

      expect(result.data.failed).toBe(1);
      expect(result.data.errors).toHaveLength(1);
    });

    it('应该处理导入失败错误', async () => {
      const mockData = [{ contractNo: 'EXP001' }];

      vi.mocked(api.post).mockRejectedValueOnce(new Error('Network error'));

      await expect(batchImportService.importSales(mockData)).rejects.toThrow('Network error');
    });
  });

  describe('importPurchase', () => {
    it('应该成功导入采购合同', async () => {
      const mockData = [
        { poNumber: 'PO001', supplier: 'Supplier A', amount: 5000 },
        { poNumber: 'PO002', supplier: 'Supplier B', amount: 3000 },
      ];

      const mockResponse = {
        code: 200,
        data: {
          total: 2,
          success: 2,
          failed: 0,
          errors: [],
        },
        message: '导入成功',
      };

      vi.mocked(api.post).mockResolvedValueOnce({ data: mockResponse });

      const result = await batchImportService.importPurchase(mockData);

      expect(api.post).toHaveBeenCalledWith('/batch-import/purchase', { data: mockData });
      expect(result).toEqual(mockResponse);
    });

    it('应该处理空数据导入', async () => {
      const mockData: Record<string, unknown>[] = [];

      const mockResponse = {
        code: 400,
        data: {
          total: 0,
          success: 0,
          failed: 0,
          errors: [{ row: 0, message: '导入数据不能为空' }],
        },
        message: '导入失败',
      };

      vi.mocked(api.post).mockResolvedValueOnce({ data: mockResponse });

      const result = await batchImportService.importPurchase(mockData);

      expect(result.code).toBe(400);
      expect(result.data.errors[0].message).toBe('导入数据不能为空');
    });

    it('应该处理服务器错误', async () => {
      const mockData = [{ poNumber: 'PO001' }];

      vi.mocked(api.post).mockRejectedValueOnce({
        response: {
          status: 500,
          data: { message: 'Internal server error' },
        },
      });

      await expect(batchImportService.importPurchase(mockData)).rejects.toBeDefined();
    });
  });
});
