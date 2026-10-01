/**
 * Input: 出口退税工作台 Interface、进项发票导入与退税草稿/申报明细操作
 * Output: 手机卡片与桌面表格展示准备清单、发票核验、申报明细工作台
 * Pos: 出口退税页面主操作面；税局登录、勾选和提交仍由用户在官方系统完成
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, CheckCircle2, Download, FileCheck2, FileSearch, Loader2, ReceiptText, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { MobileListCard } from '@/components/mobile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InvoiceImportDialog } from '@/app/dashboard/finance/invoices/components/InvoiceImportDialog';
import { TaxRefundPreparationDialog } from '@/components/dialog/TaxRefundPreparationDialog';
import {
  taxRefundService,
  type TaxRefundWorkbench as WorkbenchData,
  type TaxRefundWorkbenchItem,
  type TaxRefundWorkbenchStage,
} from '@/services/taxRefund.service';
import { PageSizeSelect } from '@/components/ui/page-size-select';
import { ErrorState } from '@/components/ui/data-state';
import { clearApiGetCache } from '@/lib/axios';
import { InvoiceVerificationDialog } from './InvoiceVerificationDialog';

const stageMeta: Record<Exclude<TaxRefundWorkbenchStage, 'ALL'>, { label: string; className: string }> = {
  PREPARATION: { label: '准备材料', className: 'border-slate-200 bg-slate-50 text-slate-700' },
  VERIFICATION: { label: '核验发票', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  DRAFT: { label: '退税草稿', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  READY_TO_EXPORT: { label: '可生成明细', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  SUBMITTED: { label: '已提交跟进', className: 'border-violet-200 bg-violet-50 text-violet-700' },
  REFUNDED: { label: '已退税', className: 'border-green-200 bg-green-50 text-green-700' },
};

const stageOptions: Array<{ value: TaxRefundWorkbenchStage; label: string }> = [
  { value: 'ALL', label: '全部阶段' },
  { value: 'PREPARATION', label: '准备材料' },
  { value: 'VERIFICATION', label: '核验发票' },
  { value: 'DRAFT', label: '退税草稿' },
  { value: 'READY_TO_EXPORT', label: '可生成明细' },
  { value: 'SUBMITTED', label: '已提交跟进' },
  { value: 'REFUNDED', label: '已退税' },
];

export function TaxRefundWorkbench() {
  const router = useRouter();
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loadError, setLoadError] = useState(false);
  const [stage, setStage] = useState<TaxRefundWorkbenchStage>('ALL');
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [invoiceImportOpen, setInvoiceImportOpen] = useState(false);
  const [selected, setSelected] = useState<TaxRefundWorkbenchItem | null>(null);
  const [preparationOpen, setPreparationOpen] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await taxRefundService.getWorkbench({
        page,
        pageSize,
        keyword: keyword || undefined,
        stage,
      });
      setData(response.data);
    } catch {
      setLoadError(true);
      toast.error('出口退税工作台加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, stage, page, pageSize]);

  useEffect(() => { void load(); }, [load]);

  const handleGenerateDrafts = async () => {
    setGenerating(true);
    try {
      const response = await taxRefundService.generateDrafts({});
      toast.success(`退税草稿生成完成：新增 ${response?.data?.created ?? 0} 条，跳过 ${response?.data?.skipped ?? 0} 条`);
      await load();
    } catch {
      toast.error('退税草稿生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const readyIds = data?.items.filter((item) => item.ready && item.taxRefund).map((item) => item.taxRefund!.id) || [];
      await taxRefundService.exportDeclarationCsv(readyIds);
      toast.success('出口退税申报明细已生成');
    } catch (error: unknown) {
      const payload = (error as { payload?: { data?: { errors?: Array<{ message?: string }> } } })?.payload;
      const firstError = payload?.data?.errors?.[0]?.message;
      toast.error(firstError || (error instanceof Error ? error.message : '申报明细生成失败'));
    } finally {
      setExporting(false);
    }
  };

  const openPreparation = (item: TaxRefundWorkbenchItem) => {
    setSelected(item);
    setPreparationOpen(true);
  };
  const openVerification = (item: TaxRefundWorkbenchItem) => {
    setSelected(item);
    setVerificationOpen(true);
  };

  const summary = loadError ? undefined : data?.summary;
  return (
    <div className="space-y-5">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
        <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-semibold tracking-tight"><ReceiptText className="h-5 w-5 text-primary" />出口退税工作台</h2>
            <CardDescription className="mt-2 max-w-3xl">
              系统完成材料汇总、发票精确核验和申报明细生成；税务数字账户中的用途确认、登录和正式提交仍由财务人工完成。
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setInvoiceImportOpen(true)}><Upload className="mr-2 h-4 w-4" />导入进项发票</Button>
            <Button variant="outline" onClick={() => void handleGenerateDrafts()} disabled={generating}>
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />}生成退税草稿
            </Button>
            <Button onClick={() => void handleExport()} disabled={exporting || !data?.items.some((item) => item.ready && item.taxRefund)}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}生成本页申报明细
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">待处理出口</p><p className="mt-1 text-2xl font-semibold">{summary?.contracts ?? '-'}</p></div>
            <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">可生成明细</p><p className="mt-1 text-2xl font-semibold text-emerald-700">{summary?.readyToExport ?? '-'}</p></div>
            <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">待复核合同</p><p className="mt-1 text-2xl font-semibold text-amber-700">{summary?.needsReview ?? '-'}</p></div>
            <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">缺失发票</p><p className="mt-1 text-2xl font-semibold text-red-700">{summary?.missingInvoices ?? '-'}</p></div>
            <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">草稿可退税额</p><p className="mt-1 text-2xl font-semibold">¥{summary?.estimatedRefundableAmount.toLocaleString() ?? '-'}</p></div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{data?.disclaimer}</span>
            <span>发票台账：{summary?.latestInvoiceBatch ? `${summary.latestInvoiceBatch.fileName}（至 ${summary.latestInvoiceBatch.dataEndDate || '未知日期'}）` : '尚无导入批次'}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Input className="max-w-sm" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} placeholder="搜索 EXP、报关单号、退税单号或问题" />
        <Select value={stage} onValueChange={(value) => { setStage(value as TaxRefundWorkbenchStage); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{stageOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        {(keyword || stage !== 'ALL') && <Button variant="ghost" onClick={() => { setKeyword(''); setStage('ALL'); setPage(1); }}>重置</Button>}
      </div>

      {loadError && <ErrorState title="退税工作台读取失败" action={<Button variant="outline" onClick={() => { clearApiGetCache(); void load(); }}>重试</Button>} />}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>共 {data?.total ?? 0} 条，第 {page} 页</span>
        <PageSizeSelect value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} />
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
        <Button variant="outline" size="sm" disabled={page * pageSize >= (data?.total ?? 0)} onClick={() => setPage(page + 1)}>下一页</Button>
      </div>
      <div className="space-y-3 md:hidden">
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">加载中...</p>
        ) : loadError ? (<p className="py-8 text-center text-destructive">读取失败，请使用上方重试</p>) : !data?.items.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">当前没有符合条件的待退税出口</p>
        ) : data.items.map((item) => (
          <MobileListCard
            key={item.salesContractId}
            title={item.contractNo}
            subtitle={item.declaration?.declarationNo || '未关联报关单'}
            badge={<Badge variant="outline" className={stageMeta[item.stage].className}>{stageMeta[item.stage].label}</Badge>}
            fields={[
              { label: '核验通过', value: item.invoiceSummary.pass },
              { label: '待复核', value: item.invoiceSummary.review },
              { label: '缺失发票', value: item.invoiceSummary.missing },
              { label: '出货日期', value: item.shippedAt ? new Date(item.shippedAt).toLocaleDateString('zh-CN') : '未登记' },
            ]}
            amount={{ label: '草稿可退税额', value: `¥${item.estimatedRefundableAmount.toLocaleString()}` }}
            onClick={() => router.push(`/dashboard/sales/${item.salesContractId}`)}
            action={
              <div className="space-y-3">
                <p className="break-words text-xs text-muted-foreground">{item.issues.length ? item.issues.join('；') : '内部校验通过'}</p>
                <div className="flex flex-wrap gap-2">
                  <Button className="h-11 flex-1" variant="outline" onClick={() => openPreparation(item)}><FileCheck2 className="mr-1 h-4 w-4" />材料</Button>
                  <Button className="h-11 flex-1" variant="outline" onClick={() => openVerification(item)}><FileSearch className="mr-1 h-4 w-4" />发票</Button>
                  {item.taxRefund && <Button className="h-11" variant="outline" onClick={() => router.push(`/dashboard/tax-refunds/${item.taxRefund?.id}`)}>退税单</Button>}
                </div>
              </div>
            }
          />
        ))}
      </div>

      <Card className="hidden overflow-hidden md:block">
        <CardHeader className="border-b"><CardTitle className="text-base">待申报清单</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>出口合同</TableHead><TableHead>当前阶段</TableHead><TableHead>报关单</TableHead><TableHead>发票核验</TableHead><TableHead className="text-right">草稿可退税额</TableHead><TableHead>阻塞项</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="py-14 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />加载中...</TableCell></TableRow>
                ) : loadError ? (<TableRow><TableCell colSpan={7} className="py-8 text-center text-destructive">读取失败，请重试</TableCell></TableRow>) : !data?.items.length ? (
                  <TableRow><TableCell colSpan={7} className="py-14 text-center text-muted-foreground">当前没有符合条件的待退税出口</TableCell></TableRow>
                ) : data.items.map((item) => (
                  <TableRow key={item.salesContractId}>
                    <TableCell><button className="font-medium text-primary hover:underline" onClick={() => router.push(`/dashboard/sales/${item.salesContractId}`)}>{item.contractNo}</button><p className="text-xs text-muted-foreground">{item.shippedAt ? new Date(item.shippedAt).toLocaleDateString('zh-CN') : '未登记出货日期'}</p></TableCell>
                    <TableCell><Badge variant="outline" className={stageMeta[item.stage].className}>{stageMeta[item.stage].label}</Badge></TableCell>
                    <TableCell className="text-xs">{item.declaration ? <><p className="font-mono">{item.declaration.declarationNo}</p><p className="text-muted-foreground">{item.declaration.status}</p></> : <span className="text-red-600">未关联</span>}</TableCell>
                    <TableCell className="text-xs"><p><span className="text-emerald-700">通过 {item.invoiceSummary.pass}</span> · <span className="text-amber-700">复核 {item.invoiceSummary.review}</span> · <span className="text-red-700">缺失 {item.invoiceSummary.missing}</span></p></TableCell>
                    <TableCell className="text-right tabular-nums">¥{item.estimatedRefundableAmount.toLocaleString()}</TableCell>
                    <TableCell className="max-w-sm text-xs text-muted-foreground">{item.issues.length ? item.issues.slice(0, 3).join('；') : <span className="text-emerald-700"><CheckCircle2 className="mr-1 inline h-3 w-3" />内部校验通过</span>}</TableCell>
                    <TableCell><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => openPreparation(item)}><FileCheck2 className="mr-1 h-3 w-3" />材料</Button><Button size="sm" variant="ghost" onClick={() => openVerification(item)}><FileSearch className="mr-1 h-3 w-3" />发票</Button>{item.taxRefund && <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/tax-refunds/${item.taxRefund?.id}`)}>退税单</Button>}</div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />生成申报明细前必须全部通过退税记录关联校验；系统不会自动登录税局、绕过验证码或代替财务确认用途。
      </div>

      <InvoiceImportDialog open={invoiceImportOpen} onOpenChange={setInvoiceImportOpen} onSuccess={() => void load()} />
      {selected && <TaxRefundPreparationDialog open={preparationOpen} onOpenChange={setPreparationOpen} salesContractId={selected.salesContractId} contractNo={selected.contractNo} />}
      {selected && <InvoiceVerificationDialog open={verificationOpen} onOpenChange={setVerificationOpen} salesContractId={selected.salesContractId} contractNo={selected.contractNo} />}
    </div>
  );
}
