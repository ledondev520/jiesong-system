import api from '@/lib/axios';
import type { BatchImportResult, ImportRow } from '@/components/batch-import';

export const batchImportService = {
  /**
   * 批量导入销售合同
   */
  importSales: async (data: ImportRow[]) => {
    const response = await api.post<{ code: number; data: BatchImportResult; message: string }>(
      '/batch-import/sales',
      { data }
    );
    return response.data;
  },

  /**
   * 批量导入采购合同
   */
  importPurchase: async (data: ImportRow[]) => {
    const response = await api.post<{ code: number; data: BatchImportResult; message: string }>(
      '/batch-import/purchase',
      { data }
    );
    return response.data;
  },
};
