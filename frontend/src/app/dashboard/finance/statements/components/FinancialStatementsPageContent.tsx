/**
 * Input: 财务报表服务层、三类来源文件、缓存层与页面交互状态
 * Output: 财务报表分析页内容容器
 * Pos: 财务报表页状态编排层
 */

'use client';

import { BusinessWrite, useBusinessReadOnly } from '@/lib/hooks/useBusinessReadOnly';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ModuleTabHeader, FINANCE_TABS } from '@/components/layout/ModuleTabHeader';
import { ErrorState } from '@/components/ui/data-state';
import { Button } from '@/components/ui/button';
import { clearApiGetCache } from '@/lib/axios';
import { cachedFetch, invalidateCache } from '@/lib/api-cache';
import {
  financialStatementsService,
  type AnalyticsData,
  type FinancialSourceBundle,
  type FinancialStatementImportPreview,
  type FinancialPeriod,
} from '@/services/financialStatements.service';
import { toast } from 'sonner';
import {
  FinancialStatementsLoadingState,
  FinancialStatementsOverview,
} from './FinancialStatementsOverview';
import {
  FinancialStatementsUploadDialog,
  type FinancialUploadFiles,
  type FinancialUploadFileType,
} from './FinancialStatementsUploadDialog';
import { ReceivableReconciliationCard } from './ReceivableReconciliationCard';

const FinancialStatementsTabsSection = lazy(() =>
  import('./FinancialStatementsTabsSection').then((module) => ({
    default: module.FinancialStatementsTabsSection,
  }))
);

const FinancialEvidenceLibrary = lazy(() =>
  import('./FinancialEvidenceLibrary').then((module) => ({ default: module.FinancialEvidenceLibrary }))
);

/** 解析 `${year}-${month}` 账期键；无效时返回 null（与原 loadDetail 的 `!year || !month` 判断一致） */
function parsePeriodKey(periodKey: string) {
  const [year, month] = periodKey.split('-').map(Number);
  if (!year || !month) return null;
  return { year, month };
}

export function FinancialStatementsPageContent() {
  const readOnly = useBusinessReadOnly();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [periods, setPeriods] = useState<FinancialPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [currentDetail, setCurrentDetail] = useState<FinancialPeriod | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<FinancialUploadFiles>({
    statement: null,
    trialBalance: null,
    generalLedger: null,
  });
  const [uploadYear, setUploadYear] = useState(String(new Date().getFullYear()));
  const [uploadMonth, setUploadMonth] = useState(String(new Date().getMonth() + 1));
  const [statementPreview, setStatementPreview] = useState<FinancialStatementImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [showDrilldowns, setShowDrilldowns] = useState(false);
  const statementFileInputRef = useRef<HTMLInputElement>(null);
  const trialBalanceFileInputRef = useRef<HTMLInputElement>(null);
  const generalLedgerFileInputRef = useRef<HTMLInputElement>(null);

  /** 拉取分析与账期列表；状态只在请求回调中更新，可直接在 effect 中调用 */
  const fetchData = useCallback(() => Promise.all([
    cachedFetch('fin-statements-analytics', () => financialStatementsService.getAnalytics()),
    cachedFetch('fin-statements-list', () => financialStatementsService.listStatements()),
  ]).then(([analyticsData, periodsData]) => {
    const safePeriods = Array.isArray(periodsData) ? periodsData : [];
    setAnalytics(analyticsData);
    setPeriods(safePeriods);
    if (safePeriods.length > 0 && !selectedPeriod) {
      const latest = safePeriods[safePeriods.length - 1];
      setSelectedPeriod(`${latest.year}-${latest.month}`);
    }
  }).catch(() => {
    setLoadError(true);
  }).finally(() => {
    setLoading(false);
  }), [selectedPeriod]);

  /** 重试 / 导入确认后重新加载：先进入加载态再拉取 */
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    await fetchData();
  }, [fetchData]);

  /** 拉取账期明细；状态只在请求回调中更新，可直接在 effect 中调用 */
  const fetchDetail = useCallback((periodKey: string) => {
    const period = parsePeriodKey(periodKey);
    if (!period) return Promise.resolve();
    return cachedFetch(
      `fin-statements-detail-${period.year}-${period.month}`,
      () => financialStatementsService.getStatementDetail(period.year, period.month),
    ).then((detail) => {
      setCurrentDetail(detail);
    }).catch(() => {
      setDetailError(true);
    }).finally(() => {
      setDetailLoading(false);
    });
  }, []);

  /** 重试时重新加载明细：先重置明细状态再拉取 */
  const loadDetail = useCallback(async (periodKey: string) => {
    if (!parsePeriodKey(periodKey)) return;
    setDetailLoading(true);
    setDetailError(false);
    setCurrentDetail(null);
    await fetchDetail(periodKey);
  }, [fetchDetail]);

  // 所选账期变化时（原 loadData 依赖 selectedPeriod，会随之重新加载）在渲染期同步重置加载/错误态，
  // 有效账期同时重置明细状态；替代 effect 内同步 setState，请求仍在 effect 中发起
  const [prevSelectedPeriod, setPrevSelectedPeriod] = useState(selectedPeriod);
  if (prevSelectedPeriod !== selectedPeriod) {
    setPrevSelectedPeriod(selectedPeriod);
    setLoading(true);
    setLoadError(false);
    if (selectedPeriod && parsePeriodKey(selectedPeriod)) {
      setDetailLoading(true);
      setDetailError(false);
      setCurrentDetail(null);
    }
  }

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (selectedPeriod) {
      void fetchDetail(selectedPeriod);
    }
  }, [selectedPeriod, fetchDetail]);

  const getUploadPeriod = () => {
    const year = parseInt(uploadYear, 10);
    const month = parseInt(uploadMonth, 10);
    if (Number.isNaN(year) || year < 2000 || year > 2099 || Number.isNaN(month) || month < 1 || month > 12) {
      toast.error('请填写有效的年份（2000-2099）和月份（1-12）');
      return null;
    }
    return { year, month, periodLabel: `${year}年${month}账期` };
  };

  const handleFilePreview = async () => {
    if (!uploadFiles.statement || !uploadFiles.trialBalance || !uploadFiles.generalLedger) return;
    const period = getUploadPeriod();
    if (!period) return;
    setPreviewing(true);
    try {
      const preview = await financialStatementsService.previewBundle(
        uploadFiles as FinancialSourceBundle,
        period.year,
        period.month,
        period.periodLabel,
      );
      setStatementPreview(preview);
      setOverwriteConfirmed(false);
      if (preview.ready) toast.success('解析完成，请核对后确认写入');
      else toast.error(`解析发现 ${preview.blockers.length} 个阻塞项，暂不可写入`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '解析失败';
      toast.error(message);
    } finally {
      setPreviewing(false);
    }
  };

  const resetUpload = () => {
    setUploadFiles({ statement: null, trialBalance: null, generalLedger: null });
    setStatementPreview(null);
    setOverwriteConfirmed(false);
    [statementFileInputRef, trialBalanceFileInputRef, generalLedgerFileInputRef].forEach((inputRef) => {
      if (inputRef.current) inputRef.current.value = '';
    });
  };

  const handleFileConfirm = async () => {
    if (!uploadFiles.statement || !uploadFiles.trialBalance || !uploadFiles.generalLedger || !statementPreview) return;
    const period = getUploadPeriod();
    if (!period) return;
    setConfirming(true);
    try {
      const result = await financialStatementsService.confirmBundle(
        uploadFiles as FinancialSourceBundle,
        period.year,
        period.month,
        statementPreview.previewId,
        overwriteConfirmed,
        period.periodLabel,
      );
      toast.success(result.message);
      setUploadDialogOpen(false);
      resetUpload();
      invalidateCache('fin-statements');
      setSelectedPeriod('');
      await loadData();
      setSelectedPeriod(`${period.year}-${period.month}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '确认写入失败';
      toast.error(message);
    } finally {
      setConfirming(false);
    }
  };

  const currentPeriod = periods.find((period) => `${period.year}-${period.month}` === selectedPeriod) ?? null;
  const latestBs = selectedPeriod ? currentDetail?.balanceSheet : analytics?.latestPeriod?.balanceSheet;
  const latestIs = selectedPeriod ? currentDetail?.incomeStatement : analytics?.latestPeriod?.incomeStatement;
  const debtRatioVal =
    latestBs?.totalAssets && latestBs?.totalLiabilities != null
      ? latestBs.totalLiabilities / latestBs.totalAssets
      : null;
  const dangerAlerts = analytics?.alerts.filter((alert) => alert.level === 'danger') ?? [];
  const warningAlerts = analytics?.alerts.filter((alert) => alert.level === 'warning') ?? [];
  const hasData = Boolean(analytics && analytics.totalPeriods > 0);

  // 数据未就绪时收起下钻区（渲染期调整，替代 effect 内同步 setState）；就绪后仍由 effect 延时展开
  const drilldownsBlocked = !hasData || !analytics || loading;
  if (drilldownsBlocked && showDrilldowns) {
    setShowDrilldowns(false);
  }

  useEffect(() => {
    if (drilldownsBlocked) {
      return;
    }

    const timer = window.setTimeout(() => setShowDrilldowns(true), 1200);
    return () => window.clearTimeout(timer);
  }, [analytics, drilldownsBlocked]);

  return (
    <div className="space-y-6" data-testid="financial-statements-page-content">
      <ModuleTabHeader tabs={FINANCE_TABS} moduleName="财务" />

      {(loadError || detailError) && <ErrorState title={loadError ? '财务报表读取失败' : '所选账期读取失败'} description="当前金额未核实，请重试。" action={<Button variant="outline" onClick={() => { clearApiGetCache(); invalidateCache('fin-statements'); if (loadError) void loadData(); if (selectedPeriod) void loadDetail(selectedPeriod); }}>重试</Button>} />}
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
            latestBalanceSheet={latestBs}
            latestIncomeStatement={latestIs}
            onOpenUploadDialog={() => setUploadDialogOpen(true)}
            onSelectPeriod={setSelectedPeriod}
            periods={periods}
            selectedPeriod={selectedPeriod}
            warningAlerts={warningAlerts}
          />

          {currentPeriod && (
            <ReceivableReconciliationCard year={currentPeriod.year} month={currentPeriod.month} />
          )}

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

          <Suspense fallback={<FinancialStatementsLoadingState count={2} />}>
            {!readOnly && <FinancialEvidenceLibrary />}
          </Suspense>

          <BusinessWrite>          <FinancialStatementsUploadDialog
            open={uploadDialogOpen}
            onOpenChange={(open) => {
              setUploadDialogOpen(open);
              if (!open) resetUpload();
            }}
            uploadFiles={uploadFiles}
            onUploadFileChange={(type: FinancialUploadFileType, file) => {
              setUploadFiles((current) => ({ ...current, [type]: file }));
              setStatementPreview(null);
              setOverwriteConfirmed(false);
            }}
            uploadYear={uploadYear}
            onYearChange={(value) => {
              setUploadYear(value);
              setStatementPreview(null);
              setOverwriteConfirmed(false);
            }}
            uploadMonth={uploadMonth}
            onMonthChange={(value) => {
              setUploadMonth(value);
              setStatementPreview(null);
              setOverwriteConfirmed(false);
            }}
            preview={statementPreview}
            previewing={previewing}
            confirming={confirming}
            overwriteConfirmed={overwriteConfirmed}
            onOverwriteConfirmedChange={setOverwriteConfirmed}
            onPreview={handleFilePreview}
            onConfirm={handleFileConfirm}
            fileInputRefs={{
              statement: statementFileInputRef,
              trialBalance: trialBalanceFileInputRef,
              generalLedger: generalLedgerFileInputRef,
            }}
            onClearFiles={resetUpload}
          /></BusinessWrite>
        </>
      )}
    </div>
  );
}
