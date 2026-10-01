import api, { type ApiRequestConfig } from '@/lib/axios';
import { getAuthToken } from '@/lib/auth-token';
import { downloadResponseBlob, throwDownloadError } from './fileDownload';
import type { TaxRefund } from '@/types';
import type { TaxRefundPreparation } from './sales.service';
import { createCrudService } from './crudService';

export type TaxRefundListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  salesContractId?: string;
};

export type TaxRefundDraftGenerateInput = {
  customsDeclarationId?: string;
  salesContractId?: string;
  replaceExisting?: boolean;
};

export type TaxRefundUpsertInput = Omit<
  TaxRefund,
  'id' | 'createdAt' | 'updatedAt'
>;

export type TaxRefundWorkbenchStage =
  | 'ALL'
  | 'PREPARATION'
  | 'VERIFICATION'
  | 'DRAFT'
  | 'READY_TO_EXPORT'
  | 'SUBMITTED'
  | 'REFUNDED';

export interface TaxRefundWorkbenchItem {
  shipmentKey?: string;
  materialReady?: boolean;
  confirmationStatus?: 'PENDING' | 'CONFIRMED' | 'CHANGED';
  confirmedFile?: { id: string; fileName: string; uploadedAt?: string } | null;
  salesContractId: string;
  contractNo: string;
  shippedAt?: string | null;
  customsBroker?: string | null;
  contractStatus: string;
  stage: Exclude<TaxRefundWorkbenchStage, 'ALL'>;
  ready: boolean;
  declaration?: {
    id: string;
    declarationNo: string;
    status: string;
    exportDate?: string | null;
  } | null;
  taxRefund?: {
    id: string;
    refundNo: string;
    status: string;
    matchStatus: string;
    refundableAmount: number;
  } | null;
  purchaseContractNos: string[];
  invoiceSummary: {
    shipmentRows: number;
    uniqueInvoices: number;
    found: number;
    pass: number;
    review: number;
    missing: number;
    invalidInvoiceNumber: number;
  };
  estimatedRefundableAmount: number;
  issues: string[];
}

export interface TaxRefundWorkbench {
  filingMonth?: string;
  items: TaxRefundWorkbenchItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    materialReadyCount?: number;
    confirmedCount?: number;
    contracts: number;
    readyToExport: number;
    needsReview: number;
    missingInvoices: number;
    draftCount: number;
    submittedCount: number;
    estimatedRefundableAmount: number;
    latestInvoiceBatch?: {
      fileName: string;
      dataStartDate?: string | null;
      dataEndDate?: string | null;
      importedAt: string;
      recordCount: number;
    } | null;
  };
  disclaimer: string;
}

export interface ShipmentPreparation extends TaxRefundPreparation {
  shipmentKey: string;
  customsDeclarationId: string | null;
  declarationNo: string | null;
  materialReady: boolean;
  materialBlockers: string[];
  sourceVersion: string;
  confirmationStatus: 'PENDING' | 'CONFIRMED' | 'CHANGED';
  confirmedFile?: { id: string; fileName: string; uploadedAt?: string } | null;
  declarations: Array<{ id: string; declarationNo: string; exportDate?: string }>;
}

export interface ContractInvoiceVerification {
  salesContractId: string;
  contractNo: string;
  summary: TaxRefundWorkbenchItem['invoiceSummary'];
  results: Array<{
    status: 'PASS' | 'REVIEW' | 'MISSING';
    sourceRows: number[];
    contracts: string[];
    invoiceNo?: string | null;
    invoiceNumberValid: boolean;
    expectedSellers: string[];
    expectedItems: string[];
    expectedTotal?: number | null;
    found: boolean;
    actualSeller?: string | null;
    actualDate?: string | null;
    actualItems?: string | null;
    actualTotal?: number | null;
    issues: string[];
  }>;
}

const crud = createCrudService<
  TaxRefund,
  TaxRefundUpsertInput,
  TaxRefundUpsertInput,
  TaxRefundListQuery
>('/tax-refunds');

export const taxRefundService = {
  ...crud,
  getAll: async (params?: TaxRefundListQuery) => crud.getAll!(params),
  getById: async (id: string) => crud.getById!(id),
  create: async (data: TaxRefundUpsertInput) => crud.create!(data),
  update: async (id: string, data: TaxRefundUpsertInput) => crud.update!(id, data),
  delete: async (id: string) => crud.delete!(id),
  generateDrafts: async (data: TaxRefundDraftGenerateInput) => api.post('/tax-refunds/auto-drafts', data),
  getWorkbench: async (params?: { page?: number; pageSize?: number; keyword?: string; stage?: TaxRefundWorkbenchStage; filingMonth?: string }) => (
    api.get<{ data: TaxRefundWorkbench }, { data: TaxRefundWorkbench }>('/tax-refunds/workbench', { params, ...(params?.filingMonth ? { cache: { enabled: false } } : {}) } as ApiRequestConfig)
  ),
  getShipmentPreparation: async (salesContractId: string, customsDeclarationId?: string) => api.get<
    { data: ShipmentPreparation }, { data: ShipmentPreparation }
  >(`/tax-refunds/workbench/${salesContractId}/preparation`, { params: { customsDeclarationId }, cache: { enabled: false } } as ApiRequestConfig),
  exportShipmentPreparation: async (salesContractId: string, customsDeclarationId?: string) => {
    const token = getAuthToken();
    const query = customsDeclarationId ? `?customsDeclarationId=${encodeURIComponent(customsDeclarationId)}` : '';
    const response = await fetch(`/api/v1/tax-refunds/workbench/${salesContractId}/preparation-export${query}`, {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    });
    if (!response.ok) await throwDownloadError(response, '出货准备清单导出失败');
    return downloadResponseBlob(response, '出货准备清单.xlsx');
  },
  confirmShipmentPreparation: async (salesContractId: string, data: { customsDeclarationId: string; sourceVersion: string }) => api.post<
    { data: { preparation: ShipmentPreparation; file: { id: string; fileName: string } } },
    { data: { preparation: ShipmentPreparation; file: { id: string; fileName: string } } }
  >(`/tax-refunds/workbench/${salesContractId}/confirm`, data),
  exportMonthlyPreparations: async (filingMonth: string) => {
    const token = getAuthToken();
    const response = await fetch(`/api/v1/tax-refunds/workbench/monthly-export?filingMonth=${encodeURIComponent(filingMonth)}`, {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    });
    if (!response.ok) await throwDownloadError(response, '月度准备清单导出失败');
    return downloadResponseBlob(response, `退税月度准备清单-${filingMonth}.xlsx`);
  },
  getInvoiceVerification: async (salesContractId: string) => (
    api.get<{ data: ContractInvoiceVerification }, { data: ContractInvoiceVerification }>(
      `/tax-refunds/workbench/${salesContractId}/invoice-verification`,
    )
  ),
  exportDeclarationCsv: async (ids?: string[]) => {
    const token = getAuthToken();
    const response = await fetch('/api/v1/tax-refunds/export?download=1', {
      method: 'POST',
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ids?.length ? { ids } : {}),
    });
    if (!response.ok) {
      await throwDownloadError(response, '出口退税申报明细生成失败');
    }
    return downloadResponseBlob(response, '出口退税申报明细.csv');
  },
};
