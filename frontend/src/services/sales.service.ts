import { getAuthToken } from '@/lib/auth-token';
import api from '@/lib/axios';
import type { ApiResponse, PackingItem, SalesContract } from '@/types';
import { createCrudService } from './crudService';
import { downloadResponseBlob } from './fileDownload';

type SalesListQuery = { page?: number; pageSize?: number; keyword?: string; lite?: boolean };
type SalesCreatePayload = Partial<SalesContract>;
type SalesUpdatePayload = Partial<SalesContract>;

/** 装箱单核对：单个字段比对结果（matched=null 表示系统未录入、跳过比对） */
export interface PackingListCheckField {
  key: string;
  label: string;
  expected: string | number | null;
  matched: boolean | null;
  closest: string | number | null;
}

/** 装箱单核对：明细行比对结果 */
export interface PackingListCheckItem {
  packingItemId?: string | null;
  productId?: string | null;
  productName: string;
  hsCode?: string;
  identity: { expected: string; matched: boolean; closest: string | null };
  boxes: { expected: number | null; matched: boolean | null; closest: number | null };
  quantity: { expected: number | null; matched: boolean | null; closest: number | null };
}

/** 装箱单核对：整体结果 */
export interface PackingListCheckResult {
  summary: {
    ok: boolean;
    manualReviewRequired: boolean;
    fieldTotal: number;
    fieldMismatched: number;
    itemCheckTotal: number;
    itemCheckMismatched: number;
    pdfNumberCount: number;
    pdfTextLength: number;
  };
  fields: PackingListCheckField[];
  items: PackingListCheckItem[];
}

export type PackingListCheckStatus =
  | 'PASSED'
  | 'DIFFERENCE'
  | 'NEEDS_MANUAL_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export interface PackingListCheckRecord {
  id: string;
  salesContractId: string;
  salesContractFileId: string;
  automaticStatus: PackingListCheckStatus;
  status: PackingListCheckStatus;
  fieldMismatched: number;
  itemCheckMismatched: number;
  parserVersion: string;
  checkedAt: string;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  checkedBy?: { id: string; name: string } | null;
  reviewedBy?: { id: string; name: string } | null;
  file: { id: string; fileName: string; uploadedAt?: string };
  comparison: PackingListCheckResult;
}

export type TaxPreparationStatus = 'ready' | 'missing' | 'review' | 'not_applicable';
export type TaxPreparationRequirement = 'required' | 'conditional' | 'post_submission';

export interface TaxRefundPreparation {
  salesContractId: string;
  contractNo: string;
  preparationReady: boolean;
  collectionReady: boolean;
  checklist: Array<{
    id: string;
    label: string;
    category: string;
    requirement: TaxPreparationRequirement;
    status: TaxPreparationStatus;
    evidence?: string | null;
    message: string;
  }>;
  blockers: string[];
  warnings: string[];
  invoiceLinks: Array<{
    purchaseContractId: string;
    purchaseContractNo: string;
    supplierName: string;
    supplierTaxId: string;
    invoiceNumbers: string[];
    invoiceFileCount: number;
    invoiceFileRequired: false;
    taxRate: number;
    netAmount: number;
    taxAmount: number;
    grossAmount: number;
  }>;
  deadlines: {
    basisDate?: string | null;
    filingStart?: string | null;
    internalPrepareOn?: string | null;
    primaryFilingEnd?: string | null;
    collectionDeadline?: string | null;
    supplementaryWindowEnd?: string | null;
    filingArchiveDueRule: string;
    retentionYears: number;
  };
  officialRules: {
    effectiveFrom: string;
    policyDocument: string;
    managementDocument: string;
    filingRule: string;
    externalTradeMaterials: string;
    filingArchiveRule: string;
    collectionRule: string;
    internalReminderDisclaimer: string;
    sources: { policy: string; management: string; interpretation: string };
  };
  disclaimer: string;
}

export interface AvailablePurchasePackingItem {
  id: string;
  productId: string;
  quantity: number;
  unit?: string | null;
  specification: string;
  boxes: number;
  grossWeight: number;
  netWeight: number;
  volume: number;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  product: { id: string; customsName: string };
  purchaseContract: {
    id: string;
    contractNo: string;
    supplier: { id: string; name: string };
  };
  allocated: {
    boxes: number;
    quantity: number;
    grossWeight: number;
    netWeight: number;
    volume: number;
  };
  remaining: {
    boxes: number;
    quantity: number;
    grossWeight: number;
    netWeight: number;
    volume: number;
  };
}

const crud = createCrudService<SalesContract, SalesCreatePayload, SalesUpdatePayload, SalesListQuery>('/sales');

/**
 * 销售服务。
 */
export const salesService = {
  ...crud,

  getNextContractNo: async () => {
    return api.get<ApiResponse<{ contractNo: string }>, ApiResponse<{ contractNo: string }>>('/sales/options/next-no');
  },

  addPackingItem: async (salesContractId: string, data: Partial<PackingItem>) => {
    return api.post<ApiResponse<PackingItem>, ApiResponse<PackingItem>, Partial<PackingItem>>(
      `/sales/${salesContractId}/packing-items`,
      data,
    );
  },

  addItem: async (
    salesContractId: string,
    data: {
      productId: string;
      storeId: string;
      quantity: number;
      unit?: string;
      costPrice: number;
      sellingPrice?: number;
      specification?: string;
      note?: string;
    },
  ) => {
    return api.post<ApiResponse<void>, ApiResponse<void>, typeof data>(`/sales/${salesContractId}/items`, data);
  },

  updatePackingItem: async (salesContractId: string, itemId: string, data: Partial<PackingItem>) => {
    return api.put<ApiResponse<PackingItem>, ApiResponse<PackingItem>, Partial<PackingItem>>(
      `/sales/${salesContractId}/packing-items/${itemId}`,
      data,
    );
  },

  removePackingItem: async (salesContractId: string, itemId: string) => {
    return api.delete<ApiResponse<void>, ApiResponse<void>>(`/sales/${salesContractId}/packing-items/${itemId}`);
  },

  /** 查询已完工且仍有未排箱数的采购明细。 */
  getAvailablePurchaseItems: async (salesContractId: string) => {
    return api.get<
      ApiResponse<AvailablePurchasePackingItem[]>,
      ApiResponse<AvailablePurchasePackingItem[]>
    >(`/sales/${salesContractId}/available-purchase-items`);
  },

  /** 按箱数把采购生产资料带入当前货柜。 */
  importPurchaseItems: async (
    salesContractId: string,
    items: Array<{ purchaseItemId: string; boxes: number }>,
  ) => {
    return api.post<
      ApiResponse<{ importedCount: number; items: PackingItem[] }>,
      ApiResponse<{ importedCount: number; items: PackingItem[] }>,
      { items: Array<{ purchaseItemId: string; boxes: number }> }
    >(`/sales/${salesContractId}/import-purchase-items`, { items });
  },

  /** 按出口合同状态机推进到下一阶段。 */
  updateStatus: async (id: string, status: SalesContract['status']) => {
    return api.put<ApiResponse<SalesContract>, ApiResponse<SalesContract>, { status: SalesContract['status'] }>(
      `/sales/${id}/status`,
      { status },
    );
  },

  /**
   * 导出单份出口合同为三 Sheet 标准 Excel。
   */
  exportExcel: async (id: string, contractNo: string) => {
    const token = getAuthToken();
    const response = await fetch(`/api/v1/sales/${id}/export-excel`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
    await downloadResponseBlob(response, `${contractNo}_出口模板.xlsx`);
  },

  /**
   * 导出单份出口合同 PDF。
   */
  exportPdf: async (id: string, contractNo: string) => {
    const token = getAuthToken();
    const response = await fetch(`/api/v1/sales/${id}/export-pdf`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
    await downloadResponseBlob(response, `${contractNo}_sales_contract.pdf`);
  },

  /**
   * 上传船司装箱单 PDF 与系统装箱数据比对。
   */
  checkPackingList: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<ApiResponse<PackingListCheckRecord>, ApiResponse<PackingListCheckRecord>, FormData>(
      `/sales/${id}/packing-list-check`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },

  listPackingListChecks: async (id: string, limit = 20) => {
    return api.get<ApiResponse<PackingListCheckRecord[]>, ApiResponse<PackingListCheckRecord[]>>(
      `/sales/${id}/packing-list-checks`,
      { params: { limit } },
    );
  },

  reviewPackingListCheck: async (
    id: string,
    checkId: string,
    decision: 'APPROVED' | 'REJECTED',
    note: string,
  ) => {
    return api.put<ApiResponse<PackingListCheckRecord>, ApiResponse<PackingListCheckRecord>>(
      `/sales/${id}/packing-list-checks/${checkId}/review`,
      { decision, note },
    );
  },

  /** 读取专项单的退税申报凭证、备案单证、收汇与期限清单。 */
  getTaxRefundPreparation: async (id: string) => {
    return api.get<ApiResponse<TaxRefundPreparation>, ApiResponse<TaxRefundPreparation>>(
      `/sales/${id}/tax-refund-preparation`,
    );
  },

  /** 下载内部材料准备 Excel，不将其表述为税务机关正式回执。 */
  exportTaxRefundPreparation: async (id: string, contractNo: string) => {
    const token = getAuthToken();
    const response = await fetch(`/api/v1/sales/${id}/tax-refund-preparation/export`, {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    });
    await downloadResponseBlob(response, `出口退税材料准备清单-${contractNo}.xlsx`);
  },

  /**
   * 计算推荐售价。
   */
  calculatePrice: (costPrice: number, exchangeRate: number, profitRate: number) => {
    const effectiveRate = Math.max(0.1, exchangeRate - 0.2);
    return Math.ceil((costPrice / effectiveRate) * profitRate);
  },
};
