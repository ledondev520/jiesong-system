/**
 * Input: /api/v1/quotes (docs/redesign/DATA-MODEL-2026.md §4.4)
 * Output: quote CRUD-ish calls, status transitions (PUT {status}) and authenticated export/print downloads
 * Pos: quote pages data layer. The server prices items; clients never send formulaPrice.
 */
import api from "@/lib/axios";
import type { ApiResponse, PaginatedResponse } from "@/types";
import { getAuthToken } from "@/lib/auth-token";
import { downloadResponseBlob, throwDownloadError } from "./fileDownload";
import type { QuoteStatus } from "@/lib/quote";

export interface QuoteItem {
  id: string;
  productId: string;
  storeId: string | null;
  quantity: number;
  unit: string | null;
  specification: string | null;
  note: string | null;
  costCny: number | null;
  markup: number | null;
  formulaPrice: number | null;
  unitPrice: number;
  isManualPrice: boolean;
  totalPrice: number;
  product?: {
    id: string;
    customsName: string;
    specification?: string | null;
    unit?: string | null;
  };
  store?: { id: string; name: string; code?: string | null } | null;
}

export interface Quote {
  id: string;
  quoteNo: string;
  status: QuoteStatus;
  customerId: string | null;
  customer?: { id: string; name: string } | null;
  currency: string;
  incoterm: string;
  paymentTerms: string | null;
  portOfLoading: string | null;
  validUntil: string | null;
  spotRate: number | null;
  pricingRate: number | null;
  totalAmount: number;
  note: string | null;
  createdAt: string;
  isExpired?: boolean;
  items?: QuoteItem[];
  _count?: { items: number };
  salesContract?: { id: string; contractNo: string } | null;
  convertedOrder?: { id: string; contractNo: string };
}

export interface QuoteListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
}
export interface QuoteItemInput {
  productId: string;
  storeId: string | null;
  quantity: number;
  unit?: string;
  note?: string;
  costCny: number | null;
  isManualPrice?: boolean;
  unitPrice?: number;
}
export interface QuoteHeaderInput {
  customerId?: string | null;
  incoterm?: string;
  note?: string | null;
  paymentTerms?: string | null;
  portOfLoading?: string | null;
  validUntil?: string | null;
  spotRate?: number | null;
}

type R<T> = Promise<ApiResponse<T>>;
const get = <T>(url: string, params?: object): R<T> =>
  api.get<ApiResponse<T>, ApiResponse<T>>(url, { params });
const send = <T>(method: "post" | "put", url: string, data: object): R<T> =>
  api[method]<ApiResponse<T>, ApiResponse<T>>(url, data);

const authedFetch = (path: string) => {
  const token = getAuthToken();
  return fetch(`/api/v1${path}`, {
    headers: { Authorization: token ? `Bearer ${token}` : "" },
  });
};

export const quoteService = {
  getAll: (params?: QuoteListQuery): R<PaginatedResponse<Quote>> =>
    get("/quotes", params),
  getById: (id: string): R<Quote> => get(`/quotes/${id}`),
  create: (
    data: QuoteHeaderInput & {
      items?: QuoteItemInput[];
      copyFromQuoteId?: string;
    },
  ): R<Quote> => send("post", "/quotes", data),
  update: (
    id: string,
    data: QuoteHeaderInput & { items?: QuoteItemInput[] },
  ): R<Quote> => send("put", `/quotes/${id}`, data),
  /** 状态变更必须单独提交（后端拒绝与其他字段混合）。 */
  transition: (id: string, status: QuoteStatus): R<Quote> =>
    send("put", `/quotes/${id}`, { status }),

  downloadXlsx: async (id: string, fileName: string) => {
    await downloadResponseBlob(
      await authedFetch(`/quotes/${id}/export.xlsx`),
      fileName,
    );
  },
  /** 打印视图需要认证头，因此取回 HTML 后用 blob 页面打开，由浏览器打印对话框另存 PDF。 */
  openPrintView: async (id: string) => {
    const response = await authedFetch(`/quotes/${id}/print`);
    if (!response.ok) await throwDownloadError(response, "打印视图加载失败");
    const url = URL.createObjectURL(
      new Blob([await response.text()], { type: "text/html;charset=utf-8" }),
    );
    const win = window.open(url, "_blank");
    if (win) win.addEventListener("load", () => win.print());
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};
