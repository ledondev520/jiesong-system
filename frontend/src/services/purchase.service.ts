import api, { type ApiRequestConfig } from '@/lib/axios';
import type { ApiResponse, PurchaseContract } from '@/types';
import { createCrudService } from './crudService';

type PurchaseContractQuery = { page?: number; pageSize?: number; keyword?: string; lite?: boolean };

export type PurchaseCreateItemPayload = {
  productId: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
  note?: string;
};

export type PurchaseCreatePayload = {
  supplierId: string;
  contractNo?: string;
  signedAt?: string;
  taxRate: number;
  note?: string;
  items: PurchaseCreateItemPayload[];
};

export type ParsedQuoteItem = {
  productId?: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
  note?: string;
};

type AIParseResult = {
  data?: unknown;
  message?: string;
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeParsedItems = (raw: unknown): ParsedQuoteItem[] => {
  const source =
    Array.isArray(raw)
      ? raw
      : typeof raw === 'object' && raw !== null && Array.isArray((raw as { items?: unknown[] }).items)
        ? (raw as { items: unknown[] }).items
        : typeof raw === 'object' && raw !== null
          ? [raw]
          : [];

  return source
    .flatMap<ParsedQuoteItem>((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return [];
      }

      const record = entry as Record<string, unknown>;
      const productName =
        typeof record.productName === 'string'
          ? record.productName
          : typeof record.name === 'string'
            ? record.name
            : undefined;

      return [{
        productId: typeof record.productId === 'string' ? record.productId : undefined,
        productName,
        quantity: toNumber(record.quantity),
        unitPrice: toNumber(record.unitPrice ?? record.price),
        unit: typeof record.unit === 'string' ? record.unit : undefined,
        note: typeof record.note === 'string' ? record.note : undefined,
      } satisfies ParsedQuoteItem];
    })
    .filter((item) => item.quantity > 0 || item.unitPrice > 0 || Boolean(item.productId) || Boolean(item.productName));
};

const crud = createCrudService<PurchaseContract, PurchaseCreatePayload, Partial<PurchaseContract>, PurchaseContractQuery>(
  '/purchases'
);

export interface ImportResult {
  successRows: number;
  failedRows: number;
  errors: { row: number; error: string }[];
}

export interface ProductPriceHistory {
  averagePrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  count: number;
  history: { contractNo: string; price: number; date: string }[];
}

/**
 * 采购服务（含报价解析与供应商查询）。
 */
export const purchaseService = {
  ...crud,

  /**
   * 获取下一个采购合同编号。
   */
  getNextContractNo: async () => {
    return api.get<ApiResponse<{ contractNo: string }>, ApiResponse<{ contractNo: string }>>('/purchases/options/next-no');
  },

  /**
   * 根据商品ID获取历史采购价格统计。
   */
  getProductPriceHistory: async (productId: string) => {
    return api.get<ApiResponse<ProductPriceHistory>, ApiResponse<ProductPriceHistory>>(
      `/purchases/price-history/${productId}`,
    );
  },

  /**
   * 根据商品ID列表返回供应商ID数组。
   */
  getSuppliersByProducts: async (productIds: string[]) => {
    return api.post<ApiResponse<{ supplierIds: string[] }>, ApiResponse<{ supplierIds: string[] }>, { productIds: string[] }>(
      '/purchases/suppliers-by-products',
      { productIds },
    );
  },

  /**
   * 导出采购合同 Excel。
   */
  exportExcel: async (params?: { status?: string; supplierId?: string; dateFrom?: string; dateTo?: string }) => {
    const requestConfig: ApiRequestConfig = {
      params,
      responseType: 'blob',
      cache: { enabled: false },
    };
    const response = await api.get('/purchases/export', requestConfig);
    return response as unknown as Blob;
  },

  /**
   * 批量导入采购合同 Excel。
   */
  importExcel: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<ApiResponse<ImportResult>, ApiResponse<ImportResult>, FormData>(
      '/purchases/import',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return response;
  },

  /**
   * 解析报价文本为标准明细结构。
   */
  parseQuote: async (text: string): Promise<{ success: boolean; data: ParsedQuoteItem[]; message?: string }> => {
    const content = text.trim();
    if (!content) {
      return { success: false, data: [], message: '请输入报价内容后再解析' };
    }

    const response = await api.post<ApiResponse<AIParseResult>, ApiResponse<AIParseResult>, { type: string; content: string }>(
      '/ai/parse',
      { type: 'quote', content },
    );

    const parsedItems = normalizeParsedItems(response.data?.data);
    if (parsedItems.length === 0) {
      return {
        success: false,
        data: [],
        message: response.data?.message || 'AI 未识别到有效报价条目，请手动录入',
      };
    }

    return { success: true, data: parsedItems };
  },
};
