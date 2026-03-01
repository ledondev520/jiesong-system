import api from '@/lib/axios';
import { PurchaseContract, ApiResponse, PaginatedResponse } from '@/types';

type PurchaseContractQuery = { page?: number; pageSize?: number; keyword?: string };

export interface PurchaseCreateItemPayload {
  productId: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
  note?: string;
}

export interface PurchaseCreatePayload {
  supplierId: string;
  contractNo?: string;
  signedAt?: string;
  taxRate: number;
  note?: string;
  items: PurchaseCreateItemPayload[];
}

export interface ParsedQuoteItem {
  productId?: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
  note?: string;
}

interface AIParseResult {
  data?: unknown;
  message?: string;
}

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
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const productName =
        typeof record.productName === 'string'
          ? record.productName
          : typeof record.name === 'string'
            ? record.name
            : undefined;

      return {
        productId: typeof record.productId === 'string' ? record.productId : undefined,
        productName,
        quantity: toNumber(record.quantity),
        unitPrice: toNumber(record.unitPrice ?? record.price),
        unit: typeof record.unit === 'string' ? record.unit : undefined,
        note: typeof record.note === 'string' ? record.note : undefined,
      } satisfies ParsedQuoteItem;
    })
    .filter((item): item is ParsedQuoteItem => item !== null)
    .filter(
      (item) =>
        item.quantity > 0 ||
        item.unitPrice > 0 ||
        Boolean(item.productId) ||
        Boolean(item.productName)
    );
};

export const purchaseService = {
  getAll: async (params?: PurchaseContractQuery) => {
    return api.get<ApiResponse<PaginatedResponse<PurchaseContract>>, ApiResponse<PaginatedResponse<PurchaseContract>>>('/purchases', { params });
  },

  getById: async (id: string) => {
    return api.get<ApiResponse<PurchaseContract>, ApiResponse<PurchaseContract>>(`/purchases/${id}`);
  },

  create: async (data: PurchaseCreatePayload) => {
    return api.post<ApiResponse<PurchaseContract>, ApiResponse<PurchaseContract>, PurchaseCreatePayload>('/purchases', data);
  },

  update: async (id: string, data: Partial<PurchaseContract>) => {
    return api.put<ApiResponse<PurchaseContract>, ApiResponse<PurchaseContract>, Partial<PurchaseContract>>(`/purchases/${id}`, data);
  },

  delete: async (id: string) => {
    return api.delete<ApiResponse<void>, ApiResponse<void>>(`/purchases/${id}`);
  },

  /**
   * 职责：获取下一个采购合同编号
   * @returns 格式为 CG + 年份(2位) + 序号(5位)，如 CG2500001
   */
  getNextContractNo: async () => {
    return api.get<ApiResponse<{ contractNo: string }>, ApiResponse<{ contractNo: string }>>('/purchases/options/next-no');
  },

  /**
   * 职责：根据商品ID列表获取曾供应过这些商品的供应商ID
   * @param productIds 商品ID数组
   * @returns 供应商ID列表
   */
  getSuppliersByProducts: async (productIds: string[]) => {
    return api.post<
      ApiResponse<{ supplierIds: string[] }>,
      ApiResponse<{ supplierIds: string[] }>,
      { productIds: string[] }
    >('/purchases/suppliers-by-products', { productIds });
  },

  parseQuote: async (text: string): Promise<{ success: boolean; data: ParsedQuoteItem[]; message?: string }> => {
    const content = text.trim();
    if (!content) {
      return { success: false, data: [], message: '请输入报价内容后再解析' };
    }

    const response = await api.post<ApiResponse<AIParseResult>, ApiResponse<AIParseResult>, { type: string; content: string }>(
      '/ai/parse',
      { type: 'quote', content }
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
