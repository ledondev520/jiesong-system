/**
 * Input: 后端 /api/v1/finance/statements/* 接口
 * Output: 财务报表数据（账期列表、详情、趋势分析、文件预览与确认写入）
 * Pos: 财务报表前端服务层；不暴露跳过预览的上传写入 Interface
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import api from '@/lib/axios';

// ==================== 类型定义 ====================

interface BalanceSheet {
  id: string;
  periodId: string;
  cashAndEquivalents: number | null;
  shortTermInvestments: number | null;
  accountsReceivable: number | null;
  prepaidExpenses: number | null;
  otherReceivables: number | null;
  inventory: number | null;
  totalCurrentAssets: number | null;
  totalNonCurrentAssets: number | null;
  totalAssets: number | null;
  accountsPayable: number | null;
  advancedReceipts: number | null;
  staffWagesPayable: number | null;
  taxesPayable: number | null;
  otherPayables: number | null;
  totalCurrentLiabilities: number | null;
  totalNonCurrentLiabilities: number | null;
  totalLiabilities: number | null;
  paidInCapital: number | null;
  capitalReserve: number | null;
  surplusReserve: number | null;
  retainedEarnings: number | null;
  totalEquity: number | null;
}

interface IncomeStatement {
  id: string;
  periodId: string;
  // 本月金额
  revenueMonth: number | null;
  costOfSalesMonth: number | null;
  taxesMonth: number | null;
  sellingExpensesMonth: number | null;
  adminExpensesMonth: number | null;
  financialExpensesMonth: number | null;
  investmentIncomeMonth: number | null;
  operatingProfitMonth: number | null;
  nonOperatingIncomeMonth: number | null;
  nonOperatingExpensesMonth: number | null;
  totalProfitMonth: number | null;
  incomeTaxMonth: number | null;
  netProfitMonth: number | null;
  // 本年累计
  revenueYTD: number | null;
  costOfSalesYTD: number | null;
  taxesYTD: number | null;
  sellingExpensesYTD: number | null;
  adminExpensesYTD: number | null;
  financialExpensesYTD: number | null;
  investmentIncomeYTD: number | null;
  operatingProfitYTD: number | null;
  nonOperatingIncomeYTD: number | null;
  nonOperatingExpensesYTD: number | null;
  totalProfitYTD: number | null;
  incomeTaxYTD: number | null;
  netProfitYTD: number | null;
}

export interface FinancialPeriod {
  id: string;
  year: number;
  month: number;
  periodLabel: string;
  reportDate: string;
  importedAt: string;
  balanceSheet: BalanceSheet | null;
  incomeStatement: IncomeStatement | null;
}

interface TrendDataPoint {
  label: string;
  month: number;
  year: number;
  revenue: number;
  costOfSales: number;
  adminExpenses: number;
  financialExpenses: number;
  sellingExpenses: number;
  operatingProfit: number;
  netProfit: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  cash: number;
  debtRatio: number;
}

export interface FinancialAlert {
  level: 'danger' | 'warning' | 'info';
  code: string;
  message: string;
  detail: string;
  period?: string;
}

export interface AnalyticsData {
  trends: TrendDataPoint[];
  alerts: FinancialAlert[];
  historicalAlerts: FinancialAlert[];
  latestPeriod: {
    periodLabel: string;
    balanceSheet: BalanceSheet | null;
    incomeStatement: IncomeStatement | null;
  } | null;
  totalPeriods: number;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  overwritten?: boolean;
}

export interface FinancialStatementImportPreview {
  previewId: string;
  ready: boolean;
  period: {
    year: number;
    month: number;
    periodLabel: string;
    reportDate: string;
    existing: boolean;
  };
  summary: {
    balanceSheetFieldCount: number;
    incomeStatementFieldCount: number;
    totalAssets: number | null;
    totalLiabilities: number | null;
    totalEquity: number | null;
    accountingEquationDifference: number | null;
    revenueMonth: number | null;
    costOfSalesMonth: number | null;
    netProfitMonth: number | null;
    costStructure: {
      costOfSales: number;
      taxes: number;
      sellingExpenses: number;
      adminExpenses: number;
      financialExpenses: number;
      total: number;
    };
  };
  blockers: string[];
  warnings: string[];
}

// ==================== API 调用 ====================

/**
 * 职责：获取所有已导入的账期列表（含摘要指标）
 * @returns 账期数组
 */
async function listStatements(): Promise<FinancialPeriod[]> {
  const res = await api.get('/finance/statements') as { code: number; data: FinancialPeriod[] };
  return res.data;
}

/**
 * 职责：获取指定年月的完整财务详情
 * @param year - 年份
 * @param month - 月份
 */
async function getStatementDetail(year: number, month: number): Promise<FinancialPeriod | null> {
  const res = await api.get(`/finance/statements/${year}/${month}`) as { code: number; data: FinancialPeriod };
  return res.data;
}

/**
 * 职责：获取趋势分析数据和预警列表
 * @returns 趋势数据 + 预警列表 + 最新账期数据
 */
async function getAnalytics(): Promise<AnalyticsData> {
  const res = await api.get('/finance/statements/analytics') as { code: number; data: AnalyticsData };
  return res.data;
}

const buildStatementFormData = (file: File, year: number, month: number, periodLabel?: string) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('year', String(year));
  formData.append('month', String(month));
  if (periodLabel) formData.append('periodLabel', periodLabel);
  return formData;
};

/** 上传工作簿生成只读解析预览；此调用不会写入账期。 */
async function previewFile(
  file: File,
  year: number,
  month: number,
  periodLabel?: string,
): Promise<FinancialStatementImportPreview> {
  const formData = buildStatementFormData(file, year, month, periodLabel);
  const res = await api.post('/finance/statements/import-file/preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }) as { code: number; message: string; data: FinancialStatementImportPreview };
  return res.data;
}

/** 使用同一工作簿和预览凭证确认写入；已有账期需明确允许覆盖。 */
async function confirmFile(
  file: File,
  year: number,
  month: number,
  previewId: string,
  allowOverwrite: boolean,
  periodLabel?: string,
): Promise<{ message: string; data: ImportResult }> {
  const formData = buildStatementFormData(file, year, month, periodLabel);
  formData.append('previewId', previewId);
  formData.append('allowOverwrite', String(allowOverwrite));
  const res = await api.post('/finance/statements/import-file/confirm', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }) as { code: number; message: string; data: ImportResult };
  return { message: res.message, data: res.data };
}

export const financialStatementsService = {
  previewFile,
  confirmFile,
  listStatements,
  getStatementDetail,
  getAnalytics,
};
