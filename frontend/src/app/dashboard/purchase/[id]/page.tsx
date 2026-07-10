/**
 * Input: 采购合同详情API、购销合同生成服务、系统配置（盖章平台/开票抬头）、PurchaseFlowPanel、SortableTableHead、useTableSort
 * Output: 采购合同详情页面（商品明细、合同归档、付款、生产资料、实物图与发票面板）
 * Pos: 采购管理子页面，承载「签合同→盖章→付款→生产完工→催票」的单合同主线路
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect, use, useCallback, useMemo } from 'react';
import { PurchaseContract, PurchaseItem, PurchaseStatus } from '@/types';
import { purchaseService } from '@/services/purchase.service';
import { contractDocService } from '@/services/contractDoc.service';
import { listContractFiles, type ContractFile } from '@/services/contractFile.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableHead,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useTableSort } from '@/lib/hooks/useTableSort';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  Package,
  DollarSign,
  Building2,
  FileDown,
  Loader2,
  Eye,
  Download,
  Circle,
  CheckCircle2,
  Truck,
  PackageCheck,
  X,
  FileText,
  Phone,
  User,
  MapPin,
  CreditCard,
  Receipt,
  Calendar,
  Store,
  Percent,
  Stamp,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { PageHeader } from '@/components/layout/PageHeader';
import ContractFiles from '@/components/contract/ContractFiles';
import { PurchaseFlowPanel } from './components/PurchaseFlowPanel';
import { PurchaseProductionPanel } from './components/PurchaseProductionPanel';
import { configService } from '@/services/config.service';
import { cn } from '@/lib/utils';
import { calculatePurchaseLineAmounts, summarizePurchaseAmounts } from '@/lib/purchase-amount';

interface PageProps {
  params: Promise<{ id: string }>;
}

const PURCHASE_NEXT_ACTIONS: Partial<Record<PurchaseStatus, { status: PurchaseStatus; label: string }>> = {
  [PurchaseStatus.DRAFT]: { status: PurchaseStatus.SIGNED, label: '确认已签约' },
  [PurchaseStatus.SIGNED]: { status: PurchaseStatus.PRODUCING, label: '开始生产' },
  [PurchaseStatus.PRODUCING]: { status: PurchaseStatus.READY, label: '确认生产完成' },
  [PurchaseStatus.READY]: { status: PurchaseStatus.SHIPPED, label: '确认供应商已发货' },
  [PurchaseStatus.SHIPPED]: { status: PurchaseStatus.RECEIVED, label: '确认收货' },
  [PurchaseStatus.RECEIVED]: { status: PurchaseStatus.COMPLETED, label: '完成采购' },
};

/**
 * 职责：状态 pill 组件（详情页用）
 */
function StatusPill({ status }: { status: PurchaseStatus }) {
  const config: Record<
    PurchaseStatus,
    { label: string; icon: React.ReactNode; className: string }
  > = {
    [PurchaseStatus.DRAFT]: {
      label: '草稿',
      icon: <Circle className="h-3 w-3 fill-current" />,
      className: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-950 dark:text-slate-400 dark:border-slate-800',
    },
    [PurchaseStatus.SIGNED]: {
      label: '已确认',
      icon: <CheckCircle2 className="h-3 w-3" />,
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800',
    },
    [PurchaseStatus.PRODUCING]: {
      label: '生产中',
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800',
    },
    [PurchaseStatus.READY]: {
      label: '生产完成',
      icon: <PackageCheck className="h-3 w-3" />,
      className: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-400 dark:border-cyan-800',
    },
    [PurchaseStatus.SHIPPED]: {
      label: '已发货',
      icon: <Truck className="h-3 w-3" />,
      className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800',
    },
    [PurchaseStatus.RECEIVED]: {
      label: '已收货',
      icon: <PackageCheck className="h-3 w-3" />,
      className: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-400 dark:border-violet-800',
    },
    [PurchaseStatus.COMPLETED]: {
      label: '已完成',
      icon: <CheckCircle2 className="h-3 w-3" />,
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800',
    },
    [PurchaseStatus.CANCELLED]: {
      label: '已取消',
      icon: <X className="h-3 w-3" />,
      className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800',
    },
  };

  const c = config[status] || config[PurchaseStatus.DRAFT];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        c.className
      )}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

const PURCHASE_TIMELINE_STEPS = [
  { status: PurchaseStatus.DRAFT, label: '草稿', icon: FileText },
  { status: PurchaseStatus.SIGNED, label: '已确认', icon: CheckCircle2 },
  { status: PurchaseStatus.PRODUCING, label: '生产中', icon: Loader2 },
  { status: PurchaseStatus.READY, label: '生产完成', icon: PackageCheck },
  { status: PurchaseStatus.SHIPPED, label: '已发货', icon: Truck },
  { status: PurchaseStatus.RECEIVED, label: '已收货', icon: PackageCheck },
  { status: PurchaseStatus.COMPLETED, label: '已完成', icon: CheckCircle2 },
] as const;

function PurchaseTimelineStep({
  step,
  index,
  currentIndex,
}: {
  step: (typeof PURCHASE_TIMELINE_STEPS)[number];
  index: number;
  currentIndex: number;
}) {
  const isCompleted = index <= currentIndex;
  const isCurrent = index === currentIndex;
  const StepIcon = step.icon;

  return (
    <li className="relative flex flex-1 flex-col items-center gap-2">
      <div
        className={cn(
          'z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors',
          isCurrent
            ? 'border-primary bg-primary text-primary-foreground'
            : isCompleted
              ? 'border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-950'
              : 'border-border bg-muted text-muted-foreground'
        )}
      >
        {isCompleted && !isCurrent ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <StepIcon className="h-3.5 w-3.5" />
        )}
      </div>
      <span
        className={cn(
          'text-[11px] font-medium',
          isCurrent ? 'text-primary' : isCompleted ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {step.label}
      </span>
      {index < PURCHASE_TIMELINE_STEPS.length - 1 ? (
        <span
          aria-hidden="true"
          className={cn(
            'absolute left-[calc(50%+1rem)] top-4 h-[2px] w-[calc(100%-2rem)]',
            index < currentIndex ? 'bg-emerald-500' : 'bg-border'
          )}
        />
      ) : null}
    </li>
  );
}

/**
 * 职责：合同状态时间线
 * 思路：按标准流程展示各状态节点，当前状态高亮，已完成节点打勾
 */
function ContractTimeline({ currentStatus }: { currentStatus: PurchaseStatus }) {
  const currentIndex = PURCHASE_TIMELINE_STEPS.findIndex((step) => step.status === currentStatus);
  const isCancelled = currentStatus === PurchaseStatus.CANCELLED;

  return (
    <div className="rounded-xl border border-border/40 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <h3 className="mb-4 text-sm font-medium">合同进度</h3>
      {isCancelled ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          <X className="h-4 w-4" />
          该合同已取消
        </div>
      ) : (
        <ol className="flex items-start justify-between" aria-label="采购合同进度">
          {PURCHASE_TIMELINE_STEPS.map((step, index) => (
            <PurchaseTimelineStep
              key={step.status}
              step={step}
              index={index}
              currentIndex={currentIndex}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

export default function PurchaseDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [contract, setContract] = useState<PurchaseContract | null>(null);
  const [loading, setLoading] = useState(true);

  // 生成合同文档弹窗状态
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    storeName: '',
    deliveryAddress: '',
    deliveryContact: '',
    depositRate: '30',
  });

  // PDF预览状态
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [contractFiles, setContractFiles] = useState<ContractFile[]>([]);
  const [statusUpdating, setStatusUpdating] = useState(false);

  // 系统配置：线上盖章平台链接 + 我方开票抬头（选填）
  const [stampPlatformUrl, setStampPlatformUrl] = useState('');
  const [invoiceTitleInfo, setInvoiceTitleInfo] = useState('');

  /**
   * 职责：加载采购合同详情 + 附件列表
   */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contractRes, filesRes] = await Promise.all([
        purchaseService.getById(id),
        listContractFiles(id, 'PURCHASE'),
      ]);
      setContract(contractRes.data || null);
      if (filesRes.data) setContractFiles(filesRes.data);
    } catch {
      toast.error('加载合同详情失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // 加载系统配置（盖章平台链接、开票抬头），失败不阻塞页面
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const response = await configService.getSystemConfig();
        const configs = response.data as Record<string, unknown> | undefined;
        if (typeof configs?.stampPlatformUrl === 'string') setStampPlatformUrl(configs.stampPlatformUrl);
        if (typeof configs?.invoiceTitleInfo === 'string') setInvoiceTitleInfo(configs.invoiceTitleInfo);
      } catch {
        // 配置读取失败时保持默认，不影响详情页
      }
    };
    void fetchConfigs();
  }, []);

  /**
   * 职责：跳转线上盖章平台（系统配置 stampPlatformUrl）
   * 思路：未配置时提示管理员到「设置 > 系统配置」维护链接
   */
  const handleOpenStampPlatform = () => {
    const url = stampPlatformUrl.trim();
    if (!url) {
      toast.info('尚未配置线上盖章平台链接，请到「设置 → 系统配置」中填写');
      return;
    }
    window.open(url.startsWith('http') ? url : `https://${url}`, '_blank', 'noopener,noreferrer');
  };

  /**
   * 职责：生成购销合同文档
   */
  const handleGenerateContract = async () => {
    if (!contract) return;

    setGenerateLoading(true);
    try {
      const blob = await contractDocService.generateFromPurchase(contract.id, generateForm);

      // 下载文件
      const filename = `购销合同${contract.contractNo?.replace('PO', 'CG') || ''}.docx`;
      contractDocService.downloadDocument(blob, filename);

      toast.success('合同文档已生成');
      setGenerateOpen(false);
      await loadData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '生成合同文档失败';
      toast.error(message);
    } finally {
      setGenerateLoading(false);
    }
  };

  /**
   * 职责：查看已上传的合同PDF
   */
  const viewContractPdf = async () => {
    if (!contract) return;

    setPdfLoading(true);
    try {
      // 尝试获取合同PDF（假设有此API）
      const response = await contractDocService.getContractPdf(contract.id);
      if (response) {
        const url = URL.createObjectURL(response);
        setPdfUrl(url);
        setPdfDialogOpen(true);
      } else {
        toast.info('暂无合同文档，请先生成');
      }
    } catch {
      toast.info('暂无合同文档，请点击"生成购销合同"创建');
    } finally {
      setPdfLoading(false);
    }
  };

  /**
   * 职责：导出合同 PDF
   */
  const handleExportPdf = async () => {
    if (!contract) return;

    setExportingPdf(true);
    try {
      await contractDocService.exportPurchasePdf(contract.id, contract.contractNo);
      toast.success('合同 PDF 已下载');
      await loadData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '导出 PDF 失败';
      toast.error(message);
    } finally {
      setExportingPdf(false);
    }
  };

  /** 顺序推进采购状态，成功后刷新整份合同与付款汇总。 */
  const handleAdvanceStatus = async () => {
    if (!contract) return;
    const nextAction = PURCHASE_NEXT_ACTIONS[contract.status];
    if (!nextAction) return;

    setStatusUpdating(true);
    try {
      await purchaseService.updateStatus(contract.id, nextAction.status);
      toast.success(`已推进到「${nextAction.label}」阶段`);
      await loadData();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '状态推进失败');
    } finally {
      setStatusUpdating(false);
    }
  };

  const purchaseLineItems = useMemo(() => contract?.items ?? [], [contract?.items]);

  /**
   * 职责：采购明细行排序取值（名称、规格、数量、单价、小计）
   */
  const purchaseLineAccessor = useCallback((item: PurchaseItem, key: string) => {
    switch (key) {
      case 'productName':
        return item.product?.customsName ?? '';
      case 'spec':
        return item.specification || item.product?.specification || '';
      case 'quantity':
        return item.quantity;
      case 'unitPrice':
        return Number(item.unitPrice) || 0;
      case 'lineTotal':
        return calculatePurchaseLineAmounts(item, contract?.taxRate).grossAmount;
      default:
        return null;
    }
  }, [contract?.taxRate]);

  const purchaseLineSort = useTableSort(purchaseLineItems, purchaseLineAccessor);

  if (loading) {
    return <div className="flex h-64 items-center justify-center">加载中...</div>;
  }

  if (!contract) {
    return <div className="py-10 text-center">合同不存在</div>;
  }

  // 计算付款进度
  const amountSummary = summarizePurchaseAmounts({
    items: purchaseLineItems,
    taxRate: contract.taxRate,
    totalAmount: contract.totalAmount,
    paidAmount: contract.paidAmount,
  });
  const paidPercent = amountSummary.grossAmount > 0
    ? Math.min((amountSummary.paidAmount / amountSummary.grossAmount) * 100, 100)
    : 0;
  const nextPurchaseAction = PURCHASE_NEXT_ACTIONS[contract.status];
  const productionCompletionBlocked = [PurchaseStatus.PRODUCING, PurchaseStatus.READY].includes(contract.status)
    && contract.productionReadiness?.ready === false;
  const productionStageVisible = [
    PurchaseStatus.PRODUCING,
    PurchaseStatus.READY,
    PurchaseStatus.SHIPPED,
    PurchaseStatus.RECEIVED,
    PurchaseStatus.COMPLETED,
  ].includes(contract.status);
  const productionPhotoFiles = contractFiles.filter((file) => file.category === 'PRODUCTION_PHOTO');
  const generalContractFiles = contractFiles.filter((file) => file.category !== 'PRODUCTION_PHOTO');

  return (
    <div className="space-y-6 pb-10">
      {/* 页头 */}
      <PageHeader
        title={contract.contractNo}
        description={`供应商: ${contract.supplier?.name || '未知'} | 签订日期: ${contract.signedAt ? format(new Date(contract.signedAt), 'yyyy-MM-dd') : '-'}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={contract.status} />
            {nextPurchaseAction && (
              <Button
                className="h-9 rounded-md text-xs"
                onClick={handleAdvanceStatus}
                disabled={statusUpdating || productionCompletionBlocked}
                title={productionCompletionBlocked ? '请先补齐所有商品的规格、箱数、毛净重和体积' : undefined}
              >
                {statusUpdating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                )}
                {nextPurchaseAction.label}
              </Button>
            )}
            <Button variant="outline" className="h-9 rounded-md text-xs" onClick={handleExportPdf} disabled={exportingPdf}>
              {exportingPdf ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" />
              )}
              导出 PDF
            </Button>
            <Button variant="outline" className="h-9 rounded-md text-xs" onClick={viewContractPdf} disabled={pdfLoading}>
              {pdfLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eye className="mr-1.5 h-3.5 w-3.5" />
              )}
              查看合同
            </Button>
            <Button variant="outline" className="h-9 rounded-md text-xs" onClick={handleOpenStampPlatform}>
              <Stamp className="mr-1.5 h-3.5 w-3.5" />
              在线盖章
            </Button>
            <Button className="h-9 rounded-md text-xs" onClick={() => setGenerateOpen(true)}>
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
              生成购销合同
            </Button>
          </div>
        }
      />

      {/* 汇总卡片 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-xl font-bold tabular-nums">¥{amountSummary.grossAmount.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">合同含税金额</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                <Receipt className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="flex-1">
                <div className="text-xl font-bold tabular-nums">¥{contract.paidAmount.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">已付金额</p>
                <Progress value={paidPercent} className="mt-2 h-1.5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                <DollarSign className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <div className="text-xl font-bold tabular-nums">
                  ¥{amountSummary.remainingAmount.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">待付金额</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10">
                <Building2 className="h-4 w-4 text-sky-600" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-lg font-medium" title={contract.supplier?.name}>
                  {contract.supplier?.name || '-'}
                </div>
                <p className="text-xs text-muted-foreground">供应商</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {amountSummary.issues.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">金额数据需要复核</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                {amountSummary.issues.map((issue) => <li key={issue.code}>{issue.message}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 时间线 */}
      <ContractTimeline currentStatus={contract.status} />

      {/* 付款与发票（复制汇款信息 / 登记付款 / 催开发票） */}
      <PurchaseFlowPanel contract={contract} onUpdated={loadData} invoiceTitleInfo={invoiceTitleInfo} />

      {productionStageVisible ? (
        <PurchaseProductionPanel
          contract={contract}
          photoFiles={productionPhotoFiles}
          onPhotoFilesChange={(files) => setContractFiles((current) => [
            ...files,
            ...current.filter((file) => file.category !== 'PRODUCTION_PHOTO'),
          ])}
          onUpdated={loadData}
        />
      ) : null}

      {/* 两列信息卡片 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 基本信息 */}
        <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">合同编号</p>
                <p className="font-mono text-sm font-medium">{contract.contractNo}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">签订日期</p>
                <p className="text-sm">
                  {contract.signedAt ? format(new Date(contract.signedAt), 'yyyy-MM-dd') : '—'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Store className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">发货店铺</p>
                <p className="text-sm">{contract.storeName || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Percent className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">税率</p>
                <p className="text-sm">{amountSummary.taxRate}%</p>
              </div>
            </div>
            {contract.note && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">备注</p>
                <p className="mt-1 text-sm">{contract.note}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 供应商信息 */}
        <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">供应商信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">公司名称</p>
                <p className="text-sm font-medium">{contract.supplier?.name || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">联系人</p>
                <p className="text-sm">{contract.supplier?.contactName || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">联系电话</p>
                <p className="text-sm">{contract.supplier?.contactPhone || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">公司地址</p>
                <p className="text-sm">{contract.supplier?.address || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">收款账户</p>
                <p className="text-sm">户名：{contract.supplier?.bankAccountName || contract.supplier?.name || '—'}</p>
                <p className="text-xs text-muted-foreground">
                  {contract.supplier?.bankName || '—'} · {contract.supplier?.bankBranch || '—'} · 联行号 {contract.supplier?.bankCode || '—'}
                </p>
                <p className="font-mono text-xs">账号 {contract.supplier?.bankAccount || '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 商品明细 */}
      <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Package className="h-4 w-4" />
            商品明细
          </CardTitle>
          <CardDescription>
            共 {purchaseLineItems.length} 项商品 · 不含税单价 · 发票税率 {amountSummary.taxRate}%
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!purchaseLineSort.sortedData.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">暂无商品明细</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/60 bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-10 text-center text-xs">#</TableHead>
                    <SortableTableHead
                      sortKey="productName"
                      currentSortKey={purchaseLineSort.sortKey}
                      currentSortDir={purchaseLineSort.sortDir}
                      onSort={purchaseLineSort.onSort}
                      className="text-xs"
                    >
                      商品名称
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="spec"
                      currentSortKey={purchaseLineSort.sortKey}
                      currentSortDir={purchaseLineSort.sortDir}
                      onSort={purchaseLineSort.onSort}
                      className="text-xs"
                    >
                      规格
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="quantity"
                      currentSortKey={purchaseLineSort.sortKey}
                      currentSortDir={purchaseLineSort.sortDir}
                      onSort={purchaseLineSort.onSort}
                      className="text-right text-xs"
                    >
                      数量
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="unitPrice"
                      currentSortKey={purchaseLineSort.sortKey}
                      currentSortDir={purchaseLineSort.sortDir}
                      onSort={purchaseLineSort.onSort}
                      className="text-right text-xs"
                    >
                      不含税单价 (¥)
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="lineTotal"
                      currentSortKey={purchaseLineSort.sortKey}
                      currentSortDir={purchaseLineSort.sortDir}
                      onSort={purchaseLineSort.onSort}
                      className="text-right text-xs"
                    >
                      含税小计 (¥)
                    </SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseLineSort.sortedData.map((item: PurchaseItem, idx: number) => (
                    <TableRow key={item.id} className="border-b border-border/30">
                      <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="text-sm font-medium">
                        {item.product?.customsName || '未知商品'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.specification || item.product?.specification || '-'}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {item.quantity} {item.unit || item.product?.unit}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        ¥{(Number(item.unitPrice) || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium tabular-nums">
                        ¥
                        {calculatePurchaseLineAmounts(item, amountSummary.taxRate).grossAmount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* 合计行 */}
                  <TableRow className="border-b-0 bg-muted/30 font-medium">
                    <TableCell colSpan={5} className="text-right text-xs text-muted-foreground">
                      不含税合计
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-emerald-600">
                      ¥{amountSummary.netAmount.toLocaleString()}
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-b-0 bg-muted/30">
                    <TableCell colSpan={5} className="text-right text-xs text-muted-foreground">
                      其中税额 ({amountSummary.taxRate}%)
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                      ¥{amountSummary.taxAmount.toLocaleString()}
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-b-0 bg-muted/40">
                    <TableCell colSpan={5} className="text-right text-sm font-medium">
                      含税合计
                    </TableCell>
                    <TableCell className="text-right font-mono text-base font-bold tabular-nums text-emerald-600">
                      ¥{amountSummary.lineGrossAmount.toLocaleString()}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 合同附件 */}
      <ContractFiles
        contractId={id}
        contractType="PURCHASE"
        files={generalContractFiles}
        onChange={(files) => setContractFiles((current) => [
          ...files,
          ...current.filter((file) => file.category === 'PRODUCTION_PHOTO'),
        ])}
        title="合同附件"
        description="支持 PDF、JPG、PNG、XLSX、DOCX 格式，单文件最大 10MB，用于归档原始合同或补充文件"
        emptyHint="暂无附件，点击「上传附件」归档合同文件"
        categoryOptions={[
          { value: 'SIGNED_CONTRACT', label: '供应商盖章件' },
          { value: 'SUPPLIER_INVOICE', label: '供应商发票' },
          { value: 'OTHER', label: '其他附件' },
        ]}
      />

      {/* 生成购销合同弹窗 */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="h-5 w-5 text-primary" />
              生成购销合同
            </DialogTitle>
            <DialogDescription>填写收货信息后，系统将自动生成标准购销合同文档</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="storeName">收货店铺名称</Label>
              <Input
                id="storeName"
                placeholder="例如：米尔皮塔"
                value={generateForm.storeName}
                onChange={(e) =>
                  setGenerateForm((prev) => ({ ...prev, storeName: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deliveryAddress">收货地址</Label>
              <Input
                id="deliveryAddress"
                placeholder="完整收货地址"
                value={generateForm.deliveryAddress}
                onChange={(e) =>
                  setGenerateForm((prev) => ({ ...prev, deliveryAddress: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deliveryContact">收货联系人</Label>
              <Input
                id="deliveryContact"
                placeholder="联系人及电话"
                value={generateForm.deliveryContact}
                onChange={(e) =>
                  setGenerateForm((prev) => ({ ...prev, deliveryContact: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="depositRate">首付比例 (%)</Label>
              <Input
                id="depositRate"
                type="number"
                min="0"
                max="100"
                placeholder="默认30%"
                value={generateForm.depositRate}
                onChange={(e) =>
                  setGenerateForm((prev) => ({ ...prev, depositRate: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                合同中&quot;第一笔款项&quot;的比例，默认为30%
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleGenerateContract} disabled={generateLoading}>
              {generateLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <FileDown className="mr-2 h-4 w-4" />
                  生成合同
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF预览弹窗 */}
      <Dialog
        open={pdfDialogOpen}
        onOpenChange={(open) => {
          setPdfDialogOpen(open);
          if (!open && pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
            setPdfUrl(null);
          }
        }}
      >
        <DialogContent className="h-[80vh] max-w-4xl">
          <DialogHeader>
            <DialogTitle>合同预览：{contract.contractNo}</DialogTitle>
          </DialogHeader>
          <div className="h-full flex-1">
            {pdfUrl ? (
              <iframe src={pdfUrl} className="h-full w-full rounded border" title="合同预览" />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                暂无合同文档
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
