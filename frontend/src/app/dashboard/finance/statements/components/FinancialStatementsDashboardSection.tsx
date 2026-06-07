/**
 * Input: 财务报表服务层、缓存层与总览页交互状态
 * Output: 财务总览页内的经营进度与报表分析区块
 * Pos: 财务总览报表分析状态编排层
 */

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, Loader2, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cachedFetch, invalidateCache } from '@/lib/api-cache';
import {
  financialStatementsService,
  type AnalyticsData,
  type FinancialPeriod,
} from '@/services/financialStatements.service';
import {
  FinancialStatementsLoadingState,
  FinancialStatementsOverview,
} from './FinancialStatementsOverview';
import { FinancialStatementsTabsSection } from './FinancialStatementsTabsSection';
import { FinancialStatementsUploadDialog } from './FinancialStatementsUploadDialog';

const DRILLDOWN_LINKS = [
  { href: '#finance-income-profit', label: '收入与利润' },
  { href: '#finance-cost-structure', label: '成本结构' },
  { href: '#finance-balance', label: '资产负债' },
  { href: '#finance-period-detail', label: '账期详情' },
];

export function FinancialStatementsDashboardSection() {
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
      setAnalytics(null);
      setPeriods([]);
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
    void loadData();
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
      invalidateCache('fin-statements');
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

  return (
    <section id="financial-statements" data-testid="financial-statements-section" className="scroll-mt-24 space-y-4">
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-primary" />
                经营进度与报表分析
              </CardTitle>
              <CardDescription>
                直接查看公司当前营业收入、利润、成本结构、资产负债和账期明细。
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasData && (
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger className="h-9 w-36 bg-background">
                    <SelectValue placeholder="选择账期" />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((period) => (
                      <SelectItem key={period.id} value={`${period.year}-${period.month}`}>
                        {period.periodLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button onClick={() => setUploadDialogOpen(true)} className="h-9">
                <Upload className="mr-2 h-4 w-4" />
                上传三表 Excel
              </Button>
              <Button onClick={handleImport} disabled={importing} variant="outline" className="h-9 bg-background">
                {importing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                扫描导入全部
              </Button>
            </div>
          </div>
          {hasData && (
            <div className="flex flex-wrap gap-2">
              {DRILLDOWN_LINKS.map((link) => (
                <Button key={link.href} asChild variant="secondary" size="sm" className="h-8">
                  <Link href={link.href}>{link.label}</Link>
                </Button>
              ))}
            </div>
          )}
        </CardHeader>
      </Card>

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
            showHeader={false}
            warningAlerts={warningAlerts}
          />

          {hasData && analytics && (
            <FinancialStatementsTabsSection
              analytics={analytics}
              periods={periods}
              currentDetail={currentDetail}
              detailLoading={detailLoading}
            />
          )}
        </>
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
    </section>
  );
}
