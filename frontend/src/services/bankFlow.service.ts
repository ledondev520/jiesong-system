/**
 * Input: axios API client
 * Output: 银行流水与发票数据查询 API 接口
 * Pos: 前端服务层-银行流水/发票数据
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import api from '@/lib/axios';
import type { PaginatedResponse } from '@/types';

export interface BankTransaction {
  id: string;
  batchId: string;
  txnTime: string;
  txnDate: string;
  amount: number;
  payer: string | null;
  payee: string | null;
  summary: string | null;
  txnType: string | null;
  txnId: string | null;
  balance: number | null;
  counterpart: string | null;
  direction: 'IN' | 'OUT';
  batch?: { fileName: string; importedAt: string };
}

export interface InvoiceRecord {
  id: string;
  batchId: string;
  invNo: string | null;
  seller: string;
  buyer: string | null;
  invDate: string;
  itemName: string | null;
  spec: string | null;
  unit: string | null;
  qty: number | null;
  amount: number;
  taxRate: string | null;
  tax: number;
  total: number;
  invoiceType: string | null;
  status: string;
  isPositive: string;
  riskLevel: string | null;
  batch?: { fileName: string; importedAt: string };
}

export interface FinanceDataBatch {
  id: string;
  type: 'BANK_FLOW' | 'INVOICE';
  fileName: string;
  recordCount: number;
  dataStartDate: string | null;
  dataEndDate: string | null;
  note: string | null;
  importedAt: string;
  _count: { bankTransactions: number; invoiceRecords: number };
}

export interface BankFlowStats {
  totalIn: number;
  totalOut: number;
  netFlow: number;
  txnCount: number;
}

export interface InvoiceStats {
  validTotal: number;
  validTax: number;
  validAmount: number;
  validCount: number;
  reversedCount: number;
  totalCount: number;
}

export interface TransactionQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  direction?: string;
  dateFrom?: string;
  dateTo?: string;
  batchId?: string;
}

export interface InvoiceQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  isPositive?: string;
  dateFrom?: string;
  dateTo?: string;
  batchId?: string;
}

/**
 * 职责：获取银行流水列表
 * 注意：axios 拦截器已经返回 response.data，所以 api.get() 直接返回响应体
 */
export async function getTransactions(params: TransactionQuery): Promise<PaginatedResponse<BankTransaction>> {
  const res: { data: PaginatedResponse<BankTransaction> } = await api.get('/bank-flow/transactions', { params });
  return res.data;
}

/**
 * 职责：获取银行流水统计（支持全部筛选条件）
 */
export async function getTransactionStats(params?: {
  search?: string; direction?: string; dateFrom?: string; dateTo?: string;
}): Promise<BankFlowStats> {
  const res: { data: BankFlowStats } = await api.get('/bank-flow/transactions/stats', { params });
  return res.data;
}

/**
 * 职责：获取发票列表
 */
export async function getInvoices(params: InvoiceQuery): Promise<PaginatedResponse<InvoiceRecord>> {
  const res: { data: PaginatedResponse<InvoiceRecord> } = await api.get('/bank-flow/invoices', { params });
  return res.data;
}

/**
 * 职责：获取发票统计（支持全部筛选条件）
 */
export async function getInvoiceStats(params?: {
  search?: string; status?: string; dateFrom?: string; dateTo?: string;
}): Promise<InvoiceStats> {
  const res: { data: InvoiceStats } = await api.get('/bank-flow/invoices/stats', { params });
  return res.data;
}

/**
 * 职责：获取导入批次
 */
export async function getBatches(type?: string): Promise<FinanceDataBatch[]> {
  const res: { data: FinanceDataBatch[] } = await api.get('/bank-flow/batches', { params: { type } });
  return res.data;
}

/** 关联对账结果 */
export interface ReconciliationResult {
  counterpart: string;
  bankFlow: {
    items: BankTransaction[];
    totalPaid: number;
    totalReceived: number;
    netPaid: number;
    txnCount: number;
  };
  invoices: {
    items: InvoiceRecord[];
    totalInvoice: number;
    validInvoiceCount: number;
    totalRecords: number;
  };
  /** 净付款 - 有效发票金额，正数表示缺票 */
  gap: number;
}

/**
 * 职责：获取指定对方的银行流水 + 发票关联对账
 * @param counterpart 对方名称（模糊匹配）
 */
export async function getReconciliation(counterpart: string): Promise<ReconciliationResult> {
  const res: { data: ReconciliationResult } = await api.get('/bank-flow/reconciliation', {
    params: { counterpart },
  });
  return res.data;
}

/** 对账匹配条目 */
export interface MatchedEntry {
  payName: string;
  invName?: string;
  netPaid: number;
  totalInvoice: number;
  totalTax: number;
  gap: number;
  gapPct: number;
  category: 'normal' | 'under_invoiced' | 'over_invoiced';
  txnCount: number;
  invCount: number;
}

/** 未匹配付款 */
export interface UnmatchedPayment {
  counterpart: string;
  netPaid: number;
  txnCount: number;
}

/** 未匹配发票 */
export interface UnmatchedInvoice {
  seller: string;
  totalInvoice: number;
  invCount: number;
}

/** 全量对账分析结果 */
export interface FullReconciliationResult {
  matched: MatchedEntry[];
  unmatchedPayments: UnmatchedPayment[];
  unmatchedInvoices: UnmatchedInvoice[];
  summary: {
    matchedCount: number;
    normalCount: number;
    underInvoicedCount: number;
    underInvoicedGap: number;
    overInvoicedCount: number;
    overInvoicedGap: number;
    unmatchedPaymentCount: number;
    unmatchedPaymentTotal: number;
    unmatchedInvoiceCount: number;
    unmatchedInvoiceTotal: number;
  };
}

/**
 * 职责：获取全量对账分析（银行流水 vs 发票按供应商汇总匹配）
 */
export async function getFullReconciliation(): Promise<FullReconciliationResult> {
  const res: { data: FullReconciliationResult } = await api.get('/bank-flow/reconciliation/full');
  return res.data;
}

/** 银行收入按对手方汇总单条 */
export interface IncomingSummaryItem {
  name: string;
  totalIn: number;
  txnCount: number;
}

/** 银行收入汇总结果 */
export interface IncomingSummaryResult {
  items: IncomingSummaryItem[];
  total: number;
}

/**
 * 职责：获取银行收入按对手方汇总（应收 fallback）
 */
export async function getIncomingSummary(): Promise<IncomingSummaryResult> {
  const res: { data: IncomingSummaryResult } = await api.get('/bank-flow/incoming-summary');
  return res.data;
}
