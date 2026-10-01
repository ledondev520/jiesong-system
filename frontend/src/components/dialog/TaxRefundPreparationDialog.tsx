/**
 * Input: 出口专项单退税准备 Interface、2026 官方规则版本和内部清单导出
 * Output: 自动汇总、报关单选择、异常补件及一次确认生成归档清单
 * Pos: 出口详情内的退税材料唯一准备入口
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck2,
  Loader2,
  MinusCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  salesService,
  type TaxPreparationStatus,
  type TaxRefundPreparation,
} from '@/services/sales.service';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { taxRefundService, type ShipmentPreparation } from '@/services/taxRefund.service';
import { exportPacketService } from '@/services/exportPacket.service';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TaxRefundPreparationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesContractId: string;
  contractNo: string;
  customsDeclarationId?: string;
  onConfirmed?: () => void | Promise<void>;
}

const STATUS_META: Record<TaxPreparationStatus, { label: string; className: string }> = {
  ready: { label: '已齐', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  missing: { label: '缺失', className: 'border-red-200 bg-red-50 text-red-700' },
  review: { label: '待复核', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  not_applicable: { label: '未触发', className: 'border-slate-200 bg-slate-50 text-slate-600' },
};

const REQUIREMENT_LABELS = {
  required: '申报前必备',
  conditional: '按情形',
  post_submission: '申报后备案',
} as const;

function StatusIcon({ status }: { status: TaxPreparationStatus }) {
  if (status === 'ready') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === 'not_applicable') return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
  return <AlertTriangle className={cn('h-4 w-4', status === 'missing' ? 'text-red-600' : 'text-amber-600')} />;
}

const DateCard = ({ label, value, note }: { label: string; value?: string | null; note: string }) => (
  <div className="rounded-lg border bg-card p-3">
    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
    <p className="mt-1 font-mono text-sm font-semibold tabular-nums">{value || '待确定'}</p>
    <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
  </div>
);

export function TaxRefundPreparationDialog({
  open,
  onOpenChange,
  salesContractId,
  contractNo,
  customsDeclarationId,
  onConfirmed,
}: TaxRefundPreparationDialogProps) {
  const role = useAuthStore(state => state.user?.role);
  const canConfirm = role === 'ADMIN' || role === 'FINANCE';
  const [preparation, setPreparation] = useState<(TaxRefundPreparation & Partial<ShipmentPreparation>) | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [selectedDeclarationId, setSelectedDeclarationId] = useState(customsDeclarationId);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => { setSelectedDeclarationId(customsDeclarationId); }, [customsDeclarationId, salesContractId]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setPreparation(null);
    void (canConfirm ? taxRefundService.getShipmentPreparation(salesContractId, selectedDeclarationId) : salesService.getTaxRefundPreparation(salesContractId))
      .then((response) => {
        if (active) setPreparation(response.data || null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
        toast.error(message || '退税材料准备度加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [open, salesContractId, selectedDeclarationId, refreshKey, canConfirm]);

  const handleExport = async () => {
    setExporting(true);
    try {
      if (canConfirm) await taxRefundService.exportShipmentPreparation(salesContractId, preparation?.customsDeclarationId || selectedDeclarationId);
      else await salesService.exportTaxRefundPreparation(salesContractId, contractNo);
      toast.success('退税材料准备清单已导出');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '退税材料准备清单导出失败');
    } finally {
      setExporting(false);
    }
  };

  const handleConfirm = async () => {
    if (!preparation?.materialReady || !preparation.customsDeclarationId || !preparation.sourceVersion) return;
    setConfirming(true);
    try {
      const response = await taxRefundService.confirmShipmentPreparation(salesContractId, {
        customsDeclarationId: preparation.customsDeclarationId, sourceVersion: preparation.sourceVersion,
      });
      setPreparation(response.data.preparation);
      toast.success('出货资料已确认，清单已归档');
      await onConfirmed?.();
      await exportPacketService.download(response.data.file.id, response.data.file.fileName);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '确认或下载失败，请刷新后重试');
      setRefreshKey(key => key + 1);
    } finally { setConfirming(false); }
  };
  const ready = preparation?.materialReady ?? preparation?.preparationReady;
  const blockers = preparation?.materialBlockers ?? preparation?.blockers ?? [];
  const dailyChecklist = (preparation?.checklist ?? []).filter(item => !preparation?.sourceVersion || !['export-detail-form', 'purchase-detail-form', 'filing-catalog'].includes(item.id));
  const visibleChecklist = preparation?.sourceVersion ? dailyChecklist.filter(item => item.status === 'missing' || item.status === 'review') : dailyChecklist;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-primary" />
            出口退税材料准备
          </DialogTitle>
          <DialogDescription>
            专项单 {contractNo}：系统自动关联三单、报关及进项发票。处理缺件和差异后，一次确认生成出货清单。
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />正在汇总退税材料...
          </div>
        ) : !preparation ? (
          <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            暂无可展示的退税准备数据
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-auto pr-1">
            <Alert className={ready ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}>
              {ready
                ? <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                : <AlertTriangle className="h-4 w-4 text-red-700" />}
              <AlertDescription className={ready ? 'text-emerald-800' : 'text-red-800'}>
                {ready
                  ? preparation.confirmationStatus === 'CONFIRMED' ? '本次资料已确认并归档。' : '自动核验通过，可以确认并生成清单。'
                  : `仍有 ${blockers.length} 项材料准备阻塞：${blockers.join('；')}`}
              </AlertDescription>
            </Alert>

            {preparation.declarations && preparation.declarations.length > 1 && <Select value={selectedDeclarationId || preparation.customsDeclarationId || undefined} onValueChange={setSelectedDeclarationId}>
              <SelectTrigger aria-label="本次出货报关单"><SelectValue placeholder="选择报关单" /></SelectTrigger>
              <SelectContent>{preparation.declarations.map(item => <SelectItem key={item.id} value={item.id}>{item.declarationNo}</SelectItem>)}</SelectContent>
            </Select>}
            {preparation.confirmationStatus === 'CHANGED' && <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>资料已有变化，原归档保留；请重新确认当前清单。</AlertDescription></Alert>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setRefreshKey(key => key + 1)}>刷新补件状态</Button>
              <Button variant="outline" size="sm" asChild><Link href={`/dashboard/sales/${salesContractId}`}>补充出货资料</Link></Button>
            </div>
            <details className="space-y-3 rounded-lg border p-3" open={!preparation.sourceVersion || undefined}>
              <summary className="cursor-pointer text-sm font-medium">查看期限与规则</summary>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DateCard label="报关/期限基准日" value={preparation.deadlines.basisDate} note="优先取报关单出口日期" />
              <DateCard label="内部准备节点" value={preparation.deadlines.internalPrepareOn} note="次月5日，不是法定截止日" />
              <DateCard label="常规申报/收汇节点" value={preparation.deadlines.primaryFilingEnd} note="次年4月30日前的申报期口径" />
              <DateCard label="36个月补充窗口" value={preparation.deadlines.supplementaryWindowEnd} note="超过常规期限须同时核对收汇材料" />
            </div>

            <div className="rounded-lg border">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/30 p-3">
                <div>
                  <p className="text-sm font-medium">当前规则版本</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {preparation.officialRules.policyDocument} · {preparation.officialRules.managementDocument} · 自 {preparation.officialRules.effectiveFrom} 起施行
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                    <a href={preparation.officialRules.sources.policy} target="_blank" rel="noreferrer">
                      政策原文 <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                    <a href={preparation.officialRules.sources.management} target="_blank" rel="noreferrer">
                      管理办法 <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </Button>
                </div>
              </div>
              <div className="p-3 text-xs text-muted-foreground">
                <p>{preparation.officialRules.filingRule}</p>
                <p className="mt-1">{preparation.officialRules.filingArchiveRule}</p>
              </div>
            </div>

            </details>
            <div className="overflow-hidden rounded-lg border">
              {!visibleChecklist.length && <p className="p-3 text-sm text-muted-foreground">本次资料已自动核验，无需逐项复核。</p>}
              {visibleChecklist.length > 0 && <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-28 text-xs">分类</TableHead>
                    <TableHead className="text-xs">材料 / 校验项</TableHead>
                    <TableHead className="w-24 text-xs">要求</TableHead>
                    <TableHead className="w-24 text-xs">状态</TableHead>
                    <TableHead className="text-xs">证据与说明</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleChecklist.map((item) => {
                    const meta = STATUS_META[item.status];
                    return (
                      <TableRow key={item.id} className={item.status === 'missing' ? 'bg-red-50/50' : ''}>
                        <TableCell className="text-xs text-muted-foreground">{item.category}</TableCell>
                        <TableCell className="text-sm font-medium">{item.label}</TableCell>
                        <TableCell className="text-xs">{REQUIREMENT_LABELS[item.requirement]}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('gap-1 text-[10px]', meta.className)}>
                            <StatusIcon status={item.status} />{meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.evidence && <p className="font-medium text-foreground">{item.evidence}</p>}
                          <p className="text-muted-foreground">{item.message}</p>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>}
            </div>

            <details className="space-y-3 rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">查看已关联资料（{dailyChecklist.length} 项）</summary>
              <ul className="space-y-2 text-xs text-muted-foreground">{dailyChecklist.map(item => <li key={item.id}><span className="font-medium text-foreground">{item.label}：</span>{STATUS_META[item.status].label} {item.evidence || item.message}</li>)}</ul>
            {preparation.invoiceLinks.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">关联供应商发票</h3>
                <div className="grid gap-2 md:grid-cols-2">
                  {preparation.invoiceLinks.map((link) => (
                    <div key={link.purchaseContractId} className="rounded-lg border p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{link.purchaseContractNo} · {link.supplierName}</p>
                        <Badge variant="secondary">税率 {link.taxRate}%</Badge>
                      </div>
                      <p className="mt-2 text-muted-foreground">
                        发票号：{link.invoiceNumbers.join('、') || '未登记'}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        供货方税号：{link.supplierTaxId || '未登记'}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        不含税 ¥{link.netAmount.toLocaleString()} · 税额 ¥{link.taxAmount.toLocaleString()} · 附件 {link.invoiceFileCount}（选填）
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            </details>
            <Alert>
              <CalendarClock className="h-4 w-4" />
              <AlertDescription>{preparation.officialRules.internalReminderDisclaimer} {preparation.disclaimer}</AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
          <Button variant="outline" onClick={() => void handleExport()} disabled={!preparation || exporting || loading}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {exporting ? '导出中...' : '导出材料准备 Excel'}
          </Button>
          {canConfirm && preparation?.sourceVersion && <Button onClick={() => void handleConfirm()} disabled={!preparation.materialReady || loading || confirming}>
            {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {preparation.confirmationStatus === 'CONFIRMED' ? '下载已确认清单' : '确认并生成清单'}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
