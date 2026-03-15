import api from '@/lib/axios';
import { getAuthToken } from '@/lib/auth-token';
import type { ApiResponse, PaginatedResponse } from '@/types';
import { downloadResponseBlob } from './fileDownload';

export interface OpsUnshippedItem {
  key: string;
  salesContractId: string;
  orderNo: string;
  productId: string;
  skuName: string;
  skuCode: string;
  status: string;
  quantity: number;
  unit: string;
  recordCount: number;
  assigneeName: string;
  assigneeUpdatedAt: string;
  latestUpdatedAt: string;
}

export interface OpsUnshippedSummary {
  totalItems: number;
  totalOrders: number;
  totalQuantity: number;
  unassignedItems: number;
}

export interface OpsUnshippedResponse extends PaginatedResponse<OpsUnshippedItem> {
  summary: OpsUnshippedSummary;
}

export interface GetOpsUnshippedParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  assigneeName?: string;
}

export interface AssignOpsUnshippedPayload {
  salesContractId: string;
  productId: string;
  status: string;
  assigneeName: string;
}

export interface PurchaseChecklistItem {
  id: string;
  category: string;
  itemName: string;
  quantity: number;
  unit: string;
  notes: string;
  required: boolean;
}

export interface PurchaseChecklistTemplate {
  templateId: string;
  templateName: string;
  storeType: string;
  openingStage: string;
  items: PurchaseChecklistItem[];
}

export interface PurchaseChecklistResult extends PurchaseChecklistTemplate {
  summary: {
    totalItems: number;
    requiredCount: number;
    optionalCount: number;
  };
}

export interface GeneratePurchaseChecklistPayload {
  storeType: string;
  openingStage: string;
}

export interface SavePurchaseChecklistTemplatePayload extends GeneratePurchaseChecklistPayload {
  templateName: string;
  items: PurchaseChecklistItem[];
}

export interface OpsTaskItem {
  id: string;
  title: string;
  description: string;
  assigneeName: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'TODO' | 'DONE';
  dueAt: string;
  remindAt: string;
  secondRemindAt: string;
  sourceText?: string | null;
}

export interface OpsTaskSummary {
  totalItems: number;
  overdueItems: number;
  dueTodayItems: number;
  highPriorityItems: number;
}

export interface OpsTaskListResponse {
  items: OpsTaskItem[];
  summary: OpsTaskSummary;
}

export interface CreateOpsTaskPayload {
  naturalLanguageInput?: string;
  title?: string;
  description?: string;
  assigneeName?: string;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  dueAt?: string;
  remindAt?: string;
  secondRemindAt?: string;
}

export const opsExecutionService = {
  getUnshippedList: async (params: GetOpsUnshippedParams = { page: 1, pageSize: 50 }) => {
    return api.get<ApiResponse<OpsUnshippedResponse>, ApiResponse<OpsUnshippedResponse>>(
      '/ops-execution/unshipped',
      { params },
    );
  },

  assignUnshippedAssignee: async (payload: AssignOpsUnshippedPayload) => {
    return api.put<
      ApiResponse<{ key: string; assigneeName: string }>,
      ApiResponse<{ key: string; assigneeName: string }>,
      AssignOpsUnshippedPayload
    >('/ops-execution/unshipped/assign', payload);
  },

  getPurchaseChecklistTemplates: async () => {
    return api.get<ApiResponse<PurchaseChecklistTemplate[]>, ApiResponse<PurchaseChecklistTemplate[]>>(
      '/ops-execution/purchase-checklist/templates',
    );
  },

  generatePurchaseChecklist: async (payload: GeneratePurchaseChecklistPayload) => {
    return api.post<ApiResponse<PurchaseChecklistResult>, ApiResponse<PurchaseChecklistResult>, GeneratePurchaseChecklistPayload>(
      '/ops-execution/purchase-checklist/generate',
      payload,
    );
  },

  savePurchaseChecklistTemplate: async (payload: SavePurchaseChecklistTemplatePayload) => {
    return api.put<ApiResponse<PurchaseChecklistTemplate>, ApiResponse<PurchaseChecklistTemplate>, SavePurchaseChecklistTemplatePayload>(
      '/ops-execution/purchase-checklist/templates',
      payload,
    );
  },

  exportPurchaseChecklist: async (payload: SavePurchaseChecklistTemplatePayload, fallbackFilename = '采购清单.csv') => {
    const token = getAuthToken();
    const response = await fetch('/api/v1/ops-execution/purchase-checklist/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify(payload),
    });

    await downloadResponseBlob(response, fallbackFilename);
  },

  getTasks: async () => {
    return api.get<ApiResponse<OpsTaskListResponse>, ApiResponse<OpsTaskListResponse>>('/ops-execution/tasks');
  },

  createTask: async (payload: CreateOpsTaskPayload) => {
    return api.post<ApiResponse<OpsTaskItem>, ApiResponse<OpsTaskItem>, CreateOpsTaskPayload>(
      '/ops-execution/tasks',
      payload,
    );
  },
};
