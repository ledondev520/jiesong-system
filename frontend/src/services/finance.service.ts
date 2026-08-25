import api from '@/lib/axios';
import { getAuthToken } from '@/lib/auth-token';
import { buildIdempotencyKey, runIdempotentRequest } from '@/lib/idempotentRequest';
import { ApiResponse, PaginatedResponse, Payment, PaymentType } from '@/types';
import { downloadResponseBlob } from './fileDownload';

export interface FinanceOverviewStats {
  payable: {
    total: number;
    paid: number;
    unpaid: number;
  };
  receivable: {
    total: number;
    received: number;
    unreceived: number;
  };
}

export interface ReceivableReconciliation {
  period: { year: number; month: number; label: string };
  cutoffDate: string;
  contractCount: number;
  formalSalesUsd: number;
  receivedUsd: number;
  operatingReceivableUsd: number;
  reportedReceivableCny: number;
  effectiveExchangeRate: number | null;
  translatedOperatingReceivableCny: number | null;
  correctedAccountingReceivableCny: number;
  residualCny: number | null;
  anomalies: {
    duplicateDebitCny: number;
    duplicateContracts: string[];
    missingDebitCny: number;
    missingContracts: Array<{
      contractNo: string;
      amountUsd: number;
      estimatedAmountCny: number | null;
    }>;
  };
  assumptions: string[];
}

interface FinanceContractRecord {
  id: string;
  contractNo: string;
  totalAmount: number;
  paidAmount?: number;
  unpaidAmount?: number;
  receivedAmount?: number;
  unreceiveAmount?: number;
  status: string;
  hasThirdPartyCargo?: boolean;
  sourceParties?: string[];
  supplier?: {
    id: string;
    name: string;
  };
  stores?: string[];
  items?: Array<{ store?: { id: string; name: string } }>;
}

export interface FinancePaymentQuery {
  page?: number;
  pageSize?: number;
  type?: PaymentType;
  /** 按采购合同过滤（合同详情页展示付款轨迹） */
  purchaseContractId?: string;
  /** 按出口合同过滤 */
  salesContractId?: string;
}

export interface FinanceCreatePaymentInput {
  type: PaymentType;
  purchaseContractId?: string;
  salesContractId?: string;
  sourcePaymentId?: string;
  customerName?: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  paymentDate: string;
  note?: string;
}

export type FinanceReportPdfType = 'purchases' | 'sales' | 'payments';

const DEFAULT_FINANCE_STATS: FinanceOverviewStats = {
  payable: {
    total: 0,
    paid: 0,
    unpaid: 0,
  },
  receivable: {
    total: 0,
    received: 0,
    unreceived: 0,
  },
};

const createPaymentIdempotencyKey = (payload: FinanceCreatePaymentInput) => {
  return buildIdempotencyKey({
    ...payload,
    paymentDate: payload.paymentDate,
  });
};

export interface PaymentAllocation {
  salesContractId: string;
  amount: number;
  note?: string;
}

export interface FinanceAutoMatchResult {
  inspectedCount: number;
  matchedCount: number;
  skippedCount: number;
  matched: Array<{
    paymentId: string;
    salesContractId: string;
    contractNo: string;
    amount: number;
    rule: string;
    confidence: string;
  }>;
  skipped: Array<{
    paymentId: string;
    reason: string;
  }>;
}

export const financeService = {
  getPayments: async (params?: FinancePaymentQuery) => {
    return api.get<ApiResponse<PaginatedResponse<Payment>>, ApiResponse<PaginatedResponse<Payment>>>('/finance/payments', { params });
  },

  getUnallocatedPayments: async () => {
    return api.get<ApiResponse<Payment[]>, ApiResponse<Payment[]>>('/finance/unallocated-payments');
  },

  allocatePayment: async (paymentId: string, allocations: PaymentAllocation[]) => {
    return api.post<ApiResponse<Payment[]>, ApiResponse<Payment[]>>(`/finance/payments/${paymentId}/allocate`, { allocations });
  },

  autoMatchUnallocatedPayments: async () => {
    return api.post<ApiResponse<FinanceAutoMatchResult>, ApiResponse<FinanceAutoMatchResult>>('/finance/payments/auto-match');
  },

  getPayables: async (params?: { page?: number; pageSize?: number }) => {
    return api.get<
      ApiResponse<PaginatedResponse<FinanceContractRecord>>,
      ApiResponse<PaginatedResponse<FinanceContractRecord>>
    >('/finance/payables', { params });
  },

  getReceivables: async (params?: { page?: number; pageSize?: number }) => {
    return api.get<
      ApiResponse<PaginatedResponse<FinanceContractRecord>>,
      ApiResponse<PaginatedResponse<FinanceContractRecord>>
    >('/finance/receivables', { params });
  },

  createPayment: async (data: FinanceCreatePaymentInput) => {
    const idempotencyKey = createPaymentIdempotencyKey(data);

    return runIdempotentRequest(
      idempotencyKey,
      () =>
        api.post<ApiResponse<Payment>, ApiResponse<Payment>, FinanceCreatePaymentInput>('/finance/payments', data, {
          headers: {
            'X-Idempotency-Key': idempotencyKey,
          },
        }),
      { ttlMs: 15000 },
    );
  },

  getStats: async () => {
    const response = await api.get<ApiResponse<FinanceOverviewStats>, ApiResponse<FinanceOverviewStats>>('/finance/stats');
    return response.data || DEFAULT_FINANCE_STATS;
  },

  getReceivableReconciliation: async (year?: number, month?: number) => {
    const response = await api.get<
      ApiResponse<ReceivableReconciliation | null>,
      ApiResponse<ReceivableReconciliation | null>
    >('/finance/receivable-reconciliation', { params: { year, month } });
    return response.data || null;
  },

  exportReportPdf: async (type: FinanceReportPdfType, fallbackFilename?: string) => {
    const token = getAuthToken();
    const response = await fetch(`/api/v1/system/export/${type}/pdf`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
    await downloadResponseBlob(response, fallbackFilename || `${type}.pdf`);
  },
};
