/** 分批到货与验货DTO、分页及幂等请求；成功失效采购和库存缓存。 */
import api from '@/lib/axios';
import { invalidateCache } from '@/lib/api-cache';
import { runIdempotentRequest } from '@/lib/idempotentRequest';
import type { ApiResponse, PaginatedResponse } from '@/types';

export interface PurchaseReceiptActor { id: string; displayName: string }
export interface PurchaseReceiptInspection {
  id: string;
  acceptedQuantity: number;
  reinspectionQuantity: number;
  pendingQuantity: number;
  note: string;
  inspectedAt: string;
  inspectedBy: PurchaseReceiptActor;
}
export type PurchaseReceiptInspectionHistoryItem = PurchaseReceiptInspection & {
  receiptItemId: string;
  purchaseItemId: string;
  productName: string;
  unit: string;
};
export interface PurchaseReceiptItem {
  id: string;
  purchaseItemId: string;
  productName: string;
  unit: string;
  arrivedQuantity: number;
  acceptedQuantity: number;
  pendingQuantity: number;
  reinspectionQuantity: number;
  inspections: PurchaseReceiptInspection[];
  inspectionCount?: number;
}
export interface PurchaseReceipt {
  id: string;
  arrivedAt: string;
  note?: string | null;
  createdAt: string;
  createdBy: PurchaseReceiptActor;
  items: PurchaseReceiptItem[];
}
export interface PurchaseReceiptSummary {
  legacy: boolean;
  complete: boolean;
  canReceive: boolean;
  totals: { orderedQuantity: number; arrivedQuantity: number; acceptedQuantity: number; pendingQuantity: number; reinspectionQuantity: number };
  items: Array<{
    purchaseItemId: string;
    productId: string;
    productName: string;
    unit: string;
    orderedQuantity: number;
    arrivedQuantity: number;
    acceptedQuantity: number;
    pendingQuantity: number;
    reinspectionQuantity: number;
    remainingQuantity: number;
  }>;
}
export type PurchaseReceiptList = PaginatedResponse<PurchaseReceipt> & { summary: PurchaseReceiptSummary; status: string };
export interface PurchaseReceiptCreateInput {
  requestId: string;
  arrivedAt: string;
  note?: string;
  items: Array<{ purchaseItemId: string; arrivedQuantity: number }>;
}
export interface PurchaseReceiptInspectionInput {
  requestId: string;
  note: string;
  items: Array<{ receiptItemId: string; acceptedQuantity: number; reinspectionQuantity: number }>;
}
export interface PurchaseReceiptMutation {
  receipt: PurchaseReceipt;
  summary: PurchaseReceiptSummary;
  status: string;
  idempotentReplay: boolean;
}

const persist = async (path: string, data: PurchaseReceiptCreateInput | PurchaseReceiptInspectionInput) => {
  const response = await runIdempotentRequest(data.requestId, () =>
    api.post<ApiResponse<PurchaseReceiptMutation>, ApiResponse<PurchaseReceiptMutation>>(path, data),
  );
  invalidateCache('purchase-contracts-list');
  invalidateCache('inventory-list');
  return response;
};

export const purchaseReceiptService = {
  list: (purchaseContractId: string, params: { page?: number; pageSize?: number } = {}) =>
    api.get<ApiResponse<PurchaseReceiptList>, ApiResponse<PurchaseReceiptList>>(`/purchases/${purchaseContractId}/receipts`, { params }),
  inspections: (purchaseContractId: string, receiptId: string, params: { page?: number; pageSize?: number } = {}) => api.get<ApiResponse<PaginatedResponse<PurchaseReceiptInspectionHistoryItem>>, ApiResponse<PaginatedResponse<PurchaseReceiptInspectionHistoryItem>>>(`/purchases/${purchaseContractId}/receipts/${receiptId}/inspections`, { params }),
  create: (purchaseContractId: string, data: PurchaseReceiptCreateInput) => persist(`/purchases/${purchaseContractId}/receipts`, data),
  inspect: (purchaseContractId: string, receiptId: string, data: PurchaseReceiptInspectionInput) => persist(`/purchases/${purchaseContractId}/receipts/${receiptId}/inspection`, data),
};
