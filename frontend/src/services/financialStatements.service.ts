/**
 * Input: 后端 /api/v1/finance/statements/* 接口
 * Output: 财务报表数据（账期列表、详情、趋势分析、批量导入、文件上传导入）
 * Pos: 财务报表前端服务层，封装所有报表相关 API 调用
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import api from '@/lib/axios';

// ==================== 类型定义 ====================

export interface BalanceSheet {
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

export interface IncomeStatement {
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

export interface TrendDataPoint {
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

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// ==================== API 调用 ====================

/**
 * 职责：触发从本地文件夹批量导入所有账期
 * @returns 导入结果摘要
 */
async function importFromFolder(): Promise<ImportResult> {
  const res = await api.post('/finance/statements/import-folder') as { code: number; message: string; data: ImportResult };
  return res.data;
}

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

/**
 * 职责：上传单个 Excel 三表文件，解析并导入指定账期
 * @param file - 用户选择的 xlsx 文件
 * @param year - 账期年份
 * @param month - 账期月份
 * @param periodLabel - 账期标签（选填）
 * @returns 导入结果摘要
 */
async function importFile(file: File, year: number, month: number, periodLabel?: string): Promise<{ message: string; data: ImportResult }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('year', String(year));
  formData.append('month', String(month));
  if (periodLabel) formData.append('periodLabel', periodLabel);
  const res = await api.post('/finance/statements/import-file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }) as { code: number; message: string; data: ImportResult };
  return { message: res.message, data: res.data };
}

export const financialStatementsService = {
  importFromFolder,
  importFile,
  listStatements,
  getStatementDetail,
  getAnalytics,
};
