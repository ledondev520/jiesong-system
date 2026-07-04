/**
 * Input: 财务报表服务层、缓存层与页面交互状态
 * Output: 财务报表分析页内容容器
 * Pos: 财务报表页状态编排层
 */

'use client';

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ModuleTabHeader, FINANCE_TABS } from '@/components/layout/ModuleTabHeader';
import { cachedFetch, invalidateCache } from '@/lib/api-cache';
import {
  financialStatementsService,
  type AnalyticsData,
  type FinancialPeriod,
} from '@/services/financialStatements.service';
import { toast } from 'sonner';
import {
  FinancialStatementsLoadingState,
  FinancialStatementsOverview,
} from './FinancialStatementsOverview';
import { FinancialStatementsUploadDialog } from './FinancialStatementsUploadDialog';

const FinancialStatementsTabsSection = lazy(() =>
  import('./FinancialStatementsTabsSection').then((module) => ({
    default: module.FinancialStatementsTabsSection,
  }))
);

export function FinancialStatementsPageContent() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [periods, setPeriods] = useState<FinancialPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [currentDetail, setCurrentDetail] = useState<FinancialPeriod | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadYear, setUploadYear] = useState(String(new Date().getFullYear()));
  const [uploadMonth, setUploadMonth] = useState(String(new Date().getMonth() + 1));
  const [uploading, setUploading] = useState(false);
  const [showDrilldowns, setShowDrilldowns] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [analyticsData, periodsData] = await Promise.all([
        cachedFetch('fin-statements-analytics', () => financialStatementsService.getAnalytics()),
        cachedFetch('fin-statements-list', () => financialStatementsService.listStatements()),
      ]);
      const safePeriods = Array.isArray(periodsData) ? periodsData : [];
      setAnalytics(analyticsData);
      setPeriods(safePeriods);
      if (safePeriods.length > 0 && !selectedPeriod) {
        const latest = safePeriods[safePeriods.length - 1];
        setSelectedPeriod(`${latest.year}-${latest.month}`);
      }
    } catch {
      // Keep the page recoverable on empty or transient failure responses.
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  const loadDetail = useCallback(async (periodKey: string) => {
    const [year, month] = periodKey.split('-').map(Number);
    if (!year || !month) {
      return;
    }

    setDetailLoading(true);
    try {
      const detail = await cachedFetch(
        `fin-statements-detail-${year}-${month}`,
        () => financialStatementsService.getStatementDetail(year, month),
      );
      setCurrentDetail(detail);
    } catch {
      setCurrentDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedPeriod) {
      void loadDetail(selectedPeriod);
    }
  }, [selectedPeriod, loadDetail]);

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await financialStatementsService.importFromFolder();
      toast.success(`导入完成：成功 ${result.imported} 个账期，跳过 ${result.skipped} 个`);
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} 个账期导入失败：${result.errors[0]}`);
      }
      invalidateCache('fin-statements');
      setSelectedPeriod('');
      await loadData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '导入失败';
      toast.error(message);
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = async () => {
    if (!uploadFile) {
      return;
    }

    const year = parseInt(uploadYear, 10);
    const month = parseInt(uploadMonth, 10);
    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      toast.error('请填写有效的年份（如 2025）和月份（1-12）');
      return;
    }

    setUploading(true);
    try {
      const periodLabel = `${year}年${month}账期`;
      const result = await financialStatementsService.importFile(uploadFile, year, month, periodLabel);
      toast.success(result.message);
      setUploadDialogOpen(false);
      setUploadFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setSelectedPeriod('');
      await loadData();
      setSelectedPeriod(`${year}-${month}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '上传失败';
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const currentPeriod = periods.find((period) => `${period.year}-${period.month}` === selectedPeriod) ?? null;
  const latestBs = currentDetail?.balanceSheet ?? analytics?.latestPeriod?.balanceSheet;
  const latestIs = currentDetail?.incomeStatement ?? analytics?.latestPeriod?.incomeStatement;
  const debtRatioVal =
    latestBs?.totalAssets && latestBs?.totalLiabilities != null
      ? latestBs.totalLiabilities / latestBs.totalAssets
      : null;
  const dangerAlerts = analytics?.alerts.filter((alert) => alert.level === 'danger') ?? [];
  const warningAlerts = analytics?.alerts.filter((alert) => alert.level === 'warning') ?? [];
  const hasData = Boolean(analytics && analytics.totalPeriods > 0);

  useEffect(() => {
    if (!hasData || !analytics || loading) {
      setShowDrilldowns(false);
      return;
    }

    const timer = window.setTimeout(() => setShowDrilldowns(true), 1200);
    return () => window.clearTimeout(timer);
  }, [analytics, hasData, loading]);

  return (
    <div className="space-y-6" data-testid="financial-statements-page-content">
      <ModuleTabHeader tabs={FINANCE_TABS} moduleName="财务" />

      {loading ? (
        <FinancialStatementsLoadingState />
      ) : (
        <>
          <FinancialStatementsOverview
            analytics={analytics}
            currentDetail={currentDetail}
            currentPeriod={currentPeriod}
            dangerAlerts={dangerAlerts}
            debtRatioVal={debtRatioVal}
            detailLoading={detailLoading}
            hasData={hasData}
            importing={importing}
            latestBalanceSheet={latestBs}
            latestIncomeStatement={latestIs}
            onImportAll={handleImport}
            onOpenUploadDialog={() => setUploadDialogOpen(true)}
            onSelectPeriod={setSelectedPeriod}
            periods={periods}
            selectedPeriod={selectedPeriod}
            warningAlerts={warningAlerts}
          />

          {hasData && analytics && showDrilldowns && (
            <Suspense fallback={<FinancialStatementsLoadingState count={2} />}>
              <FinancialStatementsTabsSection
                analytics={analytics}
                periods={periods}
                currentDetail={currentDetail}
                detailLoading={detailLoading}
              />
            </Suspense>
          )}

          <FinancialStatementsUploadDialog
            open={uploadDialogOpen}
            onOpenChange={setUploadDialogOpen}
            uploadFile={uploadFile}
            onUploadFileChange={setUploadFile}
            uploadYear={uploadYear}
            onYearChange={setUploadYear}
            uploadMonth={uploadMonth}
            onMonthChange={setUploadMonth}
            uploading={uploading}
            onSubmit={handleFileUpload}
            fileInputRef={fileInputRef}
            onClearFile={() => {
              setUploadFile(null);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
          />
        </>
      )}
    </div>
  );
}
