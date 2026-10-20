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
  bankName: string | null;
  accountNoMasked: string | null;
  currency: 'CNY' | 'USD' | string;
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
  matchedContractId: string | null;
  matchedContractType: string | null;
  matchScore: number | null;
  matchStatus: 'PENDING' | 'MATCHED' | 'IGNORED';
  matchedAt: string | null;
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
  matchedContractId: string | null;
  matchedContractType: string | null;
  matchScore: number | null;
  matchStatus: 'PENDING' | 'MATCHED' | 'IGNORED';
  matchedAt: string | null;
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
  currency: string;
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
  currency?: string;
  accountNoMasked?: string;
  amountMin?: number;
  amountMax?: number;
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
  search?: string; direction?: string; dateFrom?: string; dateTo?: string; currency?: string; accountNoMasked?: string; amountMin?: number; amountMax?: number;
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
interface ReconciliationResult {
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

/** 对账匹配条目 */
interface MatchedEntry {
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
interface UnmatchedPayment {
  counterpart: string;
  netPaid: number;
  txnCount: number;
}

/** 未匹配发票 */
interface UnmatchedInvoice {
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
interface IncomingSummaryItem {
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

// ==================== 智能关联引擎 API ====================

export interface UnmatchedItemsResult {
  bankItems: BankTransaction[];
  invoiceItems: InvoiceRecord[];
  bankTotal: number;
  invoiceTotal: number;
  page: number;
  pageSize: number;
}

export interface AutoMatchResult {
  bankMatched: number;
  bankTotal: number;
  invoiceMatched: number;
  invoiceTotal: number;
  details: {
    bank: Array<{ id: string; matched: boolean; contractId?: string; contractType?: string; score: number }>;
    invoices: Array<{ id: string; matched: boolean; contractId?: string; contractType?: string; score: number }>;
  };
}

export interface PurchaseContractForMatch {
  id: string;
  contractNo: string;
  supplierId: string;
  totalAmount: number;
  paidAmount: number;
  status: string;
  signedAt: string | null;
  supplier: { id: string; name: string; shortName?: string | null };
}

interface SalesContractForMatch {
  id: string;
  contractNo: string;
  totalAmount: number;
  receivedAmount: number;
  status: string;
  signedAt: string | null;
  portId: string | null;
  port: { id: string; name: string } | null;
  packingItems: Array<{ id: string; store: { id: string; name: string } | null }>;
}

export type ContractForMatch = PurchaseContractForMatch | SalesContractForMatch;

/**
 * 职责：获取未匹配项列表
 */
export async function getUnmatchedItems(params?: { page?: number; pageSize?: number; type?: 'BANK' | 'INVOICE'; search?: string }): Promise<UnmatchedItemsResult> {
  const res: { data: UnmatchedItemsResult } = await api.get('/finance/unmatched', { params });
  return res.data;
}

/**
 * 职责：触发自动匹配
 */
export async function postAutoMatch(): Promise<AutoMatchResult> {
  const res: { data: AutoMatchResult } = await api.post('/finance/auto-match');
  return res.data;
}

/**
 * 职责：人工确认关联
 */
export async function postManualMatch(body: {
  entityType: 'BANK' | 'INVOICE';
  entityId: string;
  contractId: string;
  contractType: 'PURCHASE' | 'SALES';
}): Promise<BankTransaction | InvoiceRecord> {
  const res: { data: BankTransaction | InvoiceRecord } = await api.post('/finance/match', body);
  return res.data;
}

/**
 * 职责：忽略该项
 */
export async function postIgnore(body: { entityType: 'BANK' | 'INVOICE'; entityId: string }): Promise<BankTransaction | InvoiceRecord> {
  const res: { data: BankTransaction | InvoiceRecord } = await api.post('/finance/ignore', body);
  return res.data;
}

/**
 * 职责：获取可用于匹配的合同列表
 */
export async function getContractsForMatch(contractType: 'PURCHASE' | 'SALES', search?: string): Promise<ContractForMatch[]> {
  const res: { data: ContractForMatch[] } = await api.get('/finance/contracts-for-match', { params: { contractType, search } });
  return res.data;
}

// ==================== 数据导入 API ====================

export interface ImportPreviewResult<T = Record<string, unknown>> {
  preview: T[];
  mapping: Record<string, string>;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: Array<{ row: number; reason: string; data: unknown }>;
}

export interface ImportResult {
  success: number;
  failed: number;
  skipped: number;
  batchId: string | null;
  errors: Array<{ reason: string; data: unknown }>;
  parseErrors: Array<{ row: number; reason: string; data: unknown }>;
  preview: unknown[];
}

/**
 * 职责：预览银行对账单解析结果
 */
export async function previewBankFlowImport(file: File, bankType: string): Promise<ImportPreviewResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('bankType', bankType);
  const res: { data: ImportPreviewResult } = await api.post('/bank-flow/import/preview', form);
  return res.data;
}

/**
 * 职责：批量导入银行对账单
 */
export async function importBankFlow(file: File, bankType: string): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('bankType', bankType);
  const res: { data: ImportResult } = await api.post('/bank-flow/import', form);
  return res.data;
}

/**
 * 职责：预览发票解析结果
 */
export async function previewInvoiceImport(file: File, invoiceType: string): Promise<ImportPreviewResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('invoiceType', invoiceType);
  const res: { data: ImportPreviewResult } = await api.post('/bank-flow/invoices/import/preview', form);
  return res.data;
}

/**
 * 职责：批量导入发票
 */
export async function importInvoices(file: File, invoiceType: string): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('invoiceType', invoiceType);
  const res: { data: ImportResult } = await api.post('/bank-flow/invoices/import', form);
  return res.data;
}
