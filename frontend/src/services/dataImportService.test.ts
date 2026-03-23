/**
 * Input: 数据导入服务与API实例
 * Output: 数据导入服务接口单元测试
 * Pos: 前端业务服务测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import {
  previewCSV,
  executeImport,
  getImportHistory,
  getDatabaseStats,
} from './dataImportService';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dataImportService', () => {
  it('previewCSV: 上传文件并返回预览结果', async () => {
    const previewResult = { fileName: 'demo.csv' };
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: previewResult });

    const file = new File(['a,b'], 'demo.csv', { type: 'text/csv' });
    const result = await previewCSV(file);

    expect(api.post).toHaveBeenCalledWith(
      '/import/preview',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    expect(result).toEqual(previewResult);
  });

  it('executeImport: 提交记录并返回导入结果', async () => {
    const responseData = { message: 'ok' };
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: responseData });

    const result = await executeImport([
      {
        seq: '1',
        customsName: '不锈钢门',
        storeName: '洛杉矶店',
        containerNo: 'C1',
        quantity: 1,
        data: {},
      },
    ]);

    expect(api.post).toHaveBeenCalledWith('/import/execute', {
      records: [
        {
          seq: '1',
          customsName: '不锈钢门',
          storeName: '洛杉矶店',
          containerNo: 'C1',
          quantity: 1,
          data: {},
        },
      ],
    });
    expect(result).toEqual(responseData);
  });

  it('getImportHistory/getDatabaseStats: 获取历史与统计', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: [{ id: 'imp-1' }] })
      .mockResolvedValueOnce({ data: { suppliers: 1 } });

    const history = await getImportHistory();
    const stats = await getDatabaseStats();

    expect(api.get).toHaveBeenNthCalledWith(1, '/import/history');
    expect(api.get).toHaveBeenNthCalledWith(2, '/import/stats');
    expect(history).toEqual([{ id: 'imp-1' }]);
    expect(stats).toEqual({ suppliers: 1 });
  });

  it('getImportHistory: 兼容分页响应结构', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        items: [{ id: 'imp-2' }],
        pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
      },
    });

    const history = await getImportHistory();

    expect(history).toEqual([{ id: 'imp-2' }]);
  });
});
