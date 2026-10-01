/**
 * Input: 出口合同服务 (salesService)、binPacking（出柜双80%判定）、通用表格排序 hook、按需 Excel 导入 Module
 * Output: 出口合同列表页面（含前置搜索、删除、列排序和分页、出柜条件徽章）
 * Pos: 出口合同管理入口，展示合同列表、货柜信息与出柜双80%指标，支持删除操作
 *
 * 2026-01-26 新增：管理员可删除出口合同（带确认对话框）
 * 2026-06-07 改造：物流进度可视化、货柜信息、金额列优化、状态图标化
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { SalesContract, SalesStatus } from '@/types';
import { salesService } from '@/services/sales.service';
import { evaluateShippingReadiness } from '@/lib/binPacking';
import { clearApiGetCache } from '@/lib/axios';
import { useTabSync } from '@/lib/tab-sync';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import { AmountText } from '@/components/ui/amount-text';
import { SemanticBadge } from '@/components/ui/semantic-badge';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  Eye,
  Ship,
  Trash2,
  Loader2,
  FileSpreadsheet,
  Container,
  Anchor,
  Boxes,
  Clock3,
  Search,
  Upload,
  ArrowUp,
  ArrowDown,
  Truck,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  ArrowRight,
} from 'lucide-react';
import type { ImportRow } from '@/components/batch-import';
import { batchImportService } from '@/services/batchImport.service';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/date-format';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, EXPORT_TABS } from '@/components/layout/ModuleTabHeader';
import { PageSizeSelect } from '@/components/ui/page-size-select';
import { MobileListCard } from '@/components/mobile';
import { useTableSort } from '@/lib/hooks/useTableSort';

const LazyBatchImportDialog = lazy(() =>
  import('@/components/batch-import').then((module) => ({
    default: module.BatchImportDialog,
  }))
);

const LOGISTICS_STEPS = [
  { key: 'draft', label: '草稿', status: SalesStatus.DRAFT },
  { key: 'confirmed', label: '确认', status: SalesStatus.CONFIRMED },
  { key: 'packing', label: '装箱', status: SalesStatus.PACKING },
  { key: 'shipped', label: '发运', status: SalesStatus.SHIPPED },
  { key: 'arrived', label: '到港', status: SalesStatus.ARRIVED },
  { key: 'completed', label: '收款', status: SalesStatus.COMPLETED },
];

const STATUS_STEP_MAP: Record<SalesStatus, number> = {
  [SalesStatus.DRAFT]: 0,
  [SalesStatus.CONFIRMED]: 1,
  [SalesStatus.PACKING]: 2,
  [SalesStatus.SHIPPED]: 3,
  [SalesStatus.ARRIVED]: 4,
  [SalesStatus.COMPLETED]: 5,
  [SalesStatus.CANCELLED]: -1,
};

export default function SalesPage() {
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [total, setTotal] = useState(0);
  const requestId = useRef(0);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 删除确认对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contractToDelete, setContractToDelete] = useState<SalesContract | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  // 搜索状态
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || searchParams.get('keyword') || '');

  // 批量导入对话框状态
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // 从 URL 读取分页状态
  const [currentPage, setCurrentPage] = useState(() => {
    const page = searchParams.get('page');
    return Math.max(1, Number.parseInt(page || '1', 10) || 1);
  });
  const [pageSize, setPageSize] = useState(() => {
    const size = searchParams.get('pageSize');
    return [20, 50, 100].includes(Number(size)) ? Number(size) : 20;
  });

  const statusFilter = searchParams.get('status') || '';
  const shipped = searchParams.get('shipped') === 'true';
  const shippedFrom = searchParams.get('shippedFrom') || '';
  const shippedTo = searchParams.get('shippedTo') || '';
  const storeId = searchParams.get('storeId') || '';
  const urlPage = searchParams.get('page');
  const urlPageSize = searchParams.get('pageSize');
  const urlKeyword = searchParams.get('q') ?? searchParams.get('keyword') ?? '';

  // 仅在URL实际改变时同步，避免每次本地输入被旧URL覆盖。
  useEffect(() => {
    setCurrentPage(Math.max(1, Number.parseInt(urlPage || '1', 10) || 1));
    setPageSize([20, 50, 100].includes(Number(urlPageSize)) ? Number(urlPageSize) : 20);
    setSearchQuery(urlKeyword);
  }, [urlPage, urlPageSize, urlKeyword, statusFilter, shipped, shippedFrom, shippedTo, storeId]);

  const loadContracts = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true); setError(false);
    try {
      const response = await salesService.getAll({
        page: currentPage, pageSize, lite: true,
        keyword: searchQuery.trim() || undefined,
        status: statusFilter ? statusFilter as SalesStatus : undefined,
        storeId: storeId || undefined,
        shipped: shipped || undefined,
        shippedFrom: shippedFrom || undefined, shippedTo: shippedTo || undefined,
      });
      if (currentRequest !== requestId.current) return;
      const items = response.data?.items || [];
      setContracts(items);
      setTotal(response.data?.pagination?.total ?? items.length);
    } catch {
      if (currentRequest !== requestId.current) return;
      setError(true); toast.error('加载出口合同失败');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [currentPage, pageSize, searchQuery, statusFilter, storeId, shipped, shippedFrom, shippedTo]);

  useEffect(() => { void loadContracts(); }, [loadContracts]);
  const refreshContracts = useCallback(() => { clearApiGetCache(); void loadContracts(); }, [loadContracts]);
  useTabSync('sales-contract-created', refreshContracts);
  useTabSync('sales-contract-updated', refreshContracts);
  useTabSync('sales-contract-deleted', refreshContracts);

  // 更新 URL 参数
  const updateUrlParams = (params: { page?: number; pageSize?: number; q?: string; clearScope?: boolean }) => {
    const newParams = new URLSearchParams(searchParams.toString());

    if (params.page !== undefined) {
      if (params.page === 1) newParams.delete('page');
      else newParams.set('page', params.page.toString());
    }
    if (params.pageSize !== undefined) {
      if (params.pageSize === 20) newParams.delete('pageSize');
      else newParams.set('pageSize', params.pageSize.toString());
    }
    if (params.clearScope) ['status', 'shipped', 'shippedFrom', 'shippedTo', 'storeId'].forEach((key) => newParams.delete(key));
    if (params.q !== undefined) {
      newParams.delete('keyword');
      if (params.q === '') newParams.delete('q');
      else newParams.set('q', params.q);
    }

    const newUrl = newParams.toString() ? `${pathname}?${newParams.toString()}` : pathname;
    router.replace(newUrl, { scroll: false });
  };

  /**
   * 职责：打开删除确认对话框
   */
  const openDeleteDialog = (contract: SalesContract) => {
    setContractToDelete(contract);
    setDeleteDialogOpen(true);
  };

  /**
   * 职责：导出单份合同为标准销售 Excel（三 Sheet）
   * 思路：调用 salesService.exportExcel 触发浏览器下载
   * @param contract - 要导出的出口合同对象
   */
  const handleExportExcel = async (contract: SalesContract) => {
    setExportingId(contract.id);
    try {
      await salesService.exportExcel(contract.id, contract.contractNo);
      toast.success(`合同 ${contract.contractNo} Excel 已下载`);
    } catch {
      toast.error('导出 Excel 失败，请稍后重试');
    } finally {
      setExportingId(null);
    }
  };

  /**
   * 职责：执行删除合同操作
   * 思路：调用API删除后刷新列表
   */
  const handleDeleteContract = async () => {
    if (!contractToDelete) return;
    
    setDeleting(true);
    try {
      await salesService.delete(contractToDelete.id);
      toast.success(`合同 ${contractToDelete.contractNo} 已删除`);
      setDeleteDialogOpen(false);
      setContractToDelete(null);
      clearApiGetCache();
      // 通知其他标签页
      import('@/lib/tab-sync').then(({ getTabSyncManager }) => {
        getTabSyncManager().send('sales-contract-deleted', { contractNo: contractToDelete!.contractNo });
      });
      loadContracts(); // 刷新列表
    } catch {
      toast.error('删除合同失败');
    } finally {
      setDeleting(false);
    }
  };

  // 批量导入列定义
  const importColumns = [
    { key: 'productName', label: '商品名称', required: true },
    { key: 'storeName', label: '门店名称', required: true },
    { key: 'quantity', label: '数量', required: true },
    { key: 'unit', label: '单位' },
    { key: 'costPrice', label: '成本价', required: true },
    { key: 'sellingPrice', label: '销售价', required: true },
    { key: 'exchangeRate', label: '汇率' },
  ];

  // 批量导入模板数据
  const importTemplateData = [
    {
      productName: '示例商品A',
      storeName: '示例门店',
      quantity: 100,
      unit: '件',
      costPrice: 50,
      sellingPrice: 80,
      exchangeRate: 7.2,
    },
  ];

  // 处理批量导入
  const handleBatchImport = async (data: ImportRow[]) => {
    const result = await batchImportService.importSales(data);
    return result.data;
  };

  /**
   * 职责：根据销售状态返回左侧色条颜色
   * 思路：DRAFT/CONFIRMED→蓝色；PACKING/SHIPPED→琥珀色；ARRIVED/COMPLETED→绿色；CANCELLED→红色
   */
  const getSalesStatusColor = (status: SalesStatus) => {
    switch (status) {
      case SalesStatus.DRAFT:
      case SalesStatus.CONFIRMED:
        return 'oklch(0.55 0.1 250)';
      case SalesStatus.PACKING:
      case SalesStatus.SHIPPED:
        return 'oklch(0.6 0.12 85)';
      case SalesStatus.ARRIVED:
      case SalesStatus.COMPLETED:
        return 'oklch(0.55 0.14 150)';
      case SalesStatus.CANCELLED:
        return 'oklch(0.55 0.1 25)';
      default:
        return 'oklch(0.55 0.14 150)';
    }
  };

  /**
   * 获取状态徽章
   */
  const getStatusBadge = (status: SalesStatus) => {
    const statusConfig: Record<SalesStatus, { label: string; tone: React.ComponentProps<typeof SemanticBadge>['tone']; icon: React.ReactNode }> = {
      [SalesStatus.DRAFT]: { label: '草稿', tone: 'neutral', icon: <CircleDashed className="h-3 w-3" /> },
      [SalesStatus.CONFIRMED]: { label: '已确认', tone: 'info', icon: <CircleDot className="h-3 w-3" /> },
      [SalesStatus.PACKING]: { label: '装柜中', tone: 'warning', icon: <Boxes className="h-3 w-3" /> },
      [SalesStatus.SHIPPED]: { label: '已发运', tone: 'progress', icon: <Truck className="h-3 w-3" /> },
      [SalesStatus.ARRIVED]: { label: '已到达', tone: 'success', icon: <Anchor className="h-3 w-3" /> },
      [SalesStatus.COMPLETED]: { label: '已收款', tone: 'success', icon: <CheckCircle2 className="h-3 w-3" /> },
      [SalesStatus.CANCELLED]: { label: '已取消', tone: 'danger', icon: <CircleDashed className="h-3 w-3" /> },
    };
    const config = statusConfig[status] || { label: status, tone: 'neutral', icon: null };
    return (
      <SemanticBadge tone={config.tone} className="gap-1">
        {config.icon}
        {config.label}
      </SemanticBadge>
    );
  };

  /**
   * 职责：从出口合同行取出可排序字段（编号、日期时间戳、箱数、体积、金额）
   */
  const salesAccessor = useCallback((item: SalesContract, key: string) => {
    switch (key) {
      case 'contractNo':
        return item.contractNo;
      case 'signedAt':
        return item.signedAt ? new Date(item.signedAt).getTime() : null;
      case 'totalBoxes':
        return item.totalBoxes ?? null;
      case 'volume':
        return item.volume ?? null;
      case 'totalAmount':
        return item.totalAmount;
      case 'portName':
        return item.port?.name ?? '';
      case 'stores':
        return item.stores?.join(' ') ?? '';
      default:
        return null;
    }
  }, []);

  const salesSort = useTableSort<SalesContract, string>(contracts, salesAccessor, { key: 'signedAt', dir: 'desc' });
  const sortedContracts = salesSort.sortedData;

  // 分页逻辑
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pagedContracts = sortedContracts;
  const exportOverview = {
    preparing: contracts.filter((contract) => [SalesStatus.CONFIRMED, SalesStatus.PACKING].includes(contract.status)).length,
    inTransit: contracts.filter((contract) => contract.status === SalesStatus.SHIPPED).length,
    arrivedPendingClose: contracts.filter((contract) => contract.status === SalesStatus.ARRIVED).length,
    totalBoxes: contracts.reduce((sum, contract) => sum + (contract.totalBoxes || 0), 0),
  };

  /**
   * 职责：渲染物流进度条
   * 思路：根据合同当前状态，高亮已完成的步骤，当前步骤用不同样式
   */
  const LogisticsProgress = ({ status }: { status: SalesStatus }) => {
    if (status === SalesStatus.CANCELLED) {
      return (
        <div className="flex items-center gap-1 text-xs text-destructive/70">
          <CircleDashed className="h-3 w-3" />
          <span>已取消</span>
        </div>
      );
    }
    const currentStep = STATUS_STEP_MAP[status] ?? 0;
    return (
      <div className="flex items-center gap-0.5">
        {LOGISTICS_STEPS.map((step, idx) => {
          const isCompleted = idx <= currentStep;
          const isCurrent = idx === currentStep;
          return (
            <div key={step.key} className="flex items-center">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  isCompleted
                    ? isCurrent
                      ? 'w-5 bg-primary'
                      : 'w-3.5 bg-primary/70'
                    : 'w-3.5 bg-muted'
                }`}
                title={step.label}
              />
              {idx < LOGISTICS_STEPS.length - 1 && (
                <div className={`w-0.5 h-px ${isCompleted && idx < currentStep ? 'bg-primary/40' : 'bg-muted'}`} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  /**
   * 职责：渲染货柜信息（含出柜双80%指标徽章）
   * 思路：毛重(22t)/体积(68CBM)任一利用率 ≥ 80% 显示「可出柜」，仅装箱前状态显示未达标提示
   */
  const ContainerInfo = ({ contract }: { contract: SalesContract }) => {
    if (!contract.totalBoxes && !contract.volume && !contract.grossWeight) return null;
    const readiness = evaluateShippingReadiness(contract.grossWeight || 0, contract.volume || 0);
    const beforeShipment =
      contract.status === SalesStatus.DRAFT ||
      contract.status === SalesStatus.CONFIRMED ||
      contract.status === SalesStatus.PACKING;
    return (
      <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
          <Container className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium truncate">{contract.contractNo}</span>
            <span className="text-[10px] text-muted-foreground">40HQ</span>
            {beforeShipment && (
              readiness.ready ? (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-700">
                  可出柜
                </span>
              ) : (
                <span
                  className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-700"
                  title={`毛重 ${readiness.weightPct.toFixed(0)}% / 体积 ${readiness.volumePct.toFixed(0)}%，任一 ≥ 80% 可出柜`}
                >
                  {Math.max(readiness.weightPct, readiness.volumePct).toFixed(0)}% 未达80%
                </span>
              )
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {contract.totalBoxes ? <span>{contract.totalBoxes} 箱</span> : null}
            {contract.volume ? <span>{contract.volume.toFixed(1)} CBM</span> : null}
            {contract.grossWeight ? <span>{contract.grossWeight.toLocaleString()} kg</span> : null}
          </div>
        </div>
        {contract.port?.name && (
          <div className="shrink-0 text-[10px] text-muted-foreground flex items-center gap-0.5">
            <ArrowRight className="h-2.5 w-2.5" />
            {contract.port.name}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-w-0 space-y-5">
      <ModuleTabHeader tabs={EXPORT_TABS} moduleName="出口" />
      <PageHeader
        title="出口合同"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-10 rounded-xl"
              onClick={() => setImportDialogOpen(true)}
            >
              <Upload className="mr-2 h-4 w-4" /> 批量导入
            </Button>
            <Button className="h-10 rounded-xl" onClick={() => router.push('/dashboard/sales/create')}>
              <Plus className="mr-2 h-4 w-4" /> 新增出口合同
            </Button>
          </div>
        }
      />

      {/* 搜索栏 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="sales-search-input"
            placeholder="搜索合同号、港口、门店..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
              updateUrlParams({ q: e.target.value, page: 1 });
            }}
            className="pl-9 rounded-xl"
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {searchQuery ? `找到 ${total} 条结果` : `共 ${total} 个合同`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>全量服务端搜索；概览和排序仅统计当前页。</span>
        {shipped && <span>已发运、已到港、已完成</span>}
        {statusFilter && getStatusBadge(statusFilter as SalesStatus)}
        {(shippedFrom || shippedTo) && <span>上海发运期间：{shippedFrom || '不限'} 至 {shippedTo || '不限'}</span>}
        <Button variant="outline" size="sm" onClick={refreshContracts}>刷新</Button>
        {searchQuery && <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setCurrentPage(1); updateUrlParams({ q: '', page: 1 }); }}>清除搜索</Button>}
        {(shipped || statusFilter || shippedFrom || shippedTo || storeId) && <Button variant="ghost" size="sm" onClick={() => { setCurrentPage(1); updateUrlParams({ clearScope: true, page: 1 }); }}>清除范围筛选</Button>}
      </div>
      {error && <div role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">出口合同读取失败，保留上次结果。<Button variant="outline" size="sm" className="ml-2" onClick={refreshContracts}>重试</Button></div>}
      {/* 出运概览 — 当前页统计 */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card className="border-border/60 py-0 md:py-6">
          <CardContent className="flex items-center justify-between px-3 py-3 md:px-4">
            <div>
              <p className="text-xs text-muted-foreground">待装柜</p>
              <p className="text-xl font-semibold tabular-nums">{exportOverview.preparing}</p>
            </div>
            <Boxes className="h-4 w-4 text-primary" />
          </CardContent>
        </Card>
        <Card className="border-border/60 py-0 md:py-6">
          <CardContent className="flex items-center justify-between px-3 py-3 md:px-4">
            <div>
              <p className="text-xs text-muted-foreground">在途</p>
              <p className="text-xl font-semibold tabular-nums">{exportOverview.inTransit}</p>
            </div>
            <Container className="h-4 w-4 text-sky-600" />
          </CardContent>
        </Card>
        <Card className="border-border/60 py-0 md:py-6">
          <CardContent className="flex items-center justify-between px-3 py-3 md:px-4">
            <div>
              <p className="text-xs text-muted-foreground">已到港</p>
              <p className="text-xl font-semibold tabular-nums">{exportOverview.arrivedPendingClose}</p>
            </div>
            <Anchor className="h-4 w-4 text-emerald-600" />
          </CardContent>
        </Card>
        <Card className="border-border/60 py-0 md:py-6">
          <CardContent className="flex items-center justify-between px-3 py-3 md:px-4">
            <div>
              <p className="text-xs text-muted-foreground">总箱数</p>
              <p className="text-xl font-semibold tabular-nums">{exportOverview.totalBoxes}</p>
            </div>
            <Clock3 className="h-4 w-4 text-amber-600" />
          </CardContent>
        </Card>
      </div>

      {/* 移动端卡片视图 */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="surface-panel py-12 text-center text-sm text-muted-foreground">加载中...</div>
        ) : error && contracts.length === 0 ? <div className="surface-panel py-12 text-center text-sm text-muted-foreground">列表暂不可用，请重试。</div> : contracts.length === 0 ? (
          <div className="surface-panel flex flex-col items-center justify-center py-16 text-center">
            <Ship className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground mb-2">暂无出口合同</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              还没有创建任何出口合同，点击下方的按钮开始创建
            </p>
            <Button onClick={() => router.push('/dashboard/sales/create')}>
              <Plus className="mr-2 h-4 w-4" /> 新建出口合同
            </Button>
          </div>
        ) : (
          pagedContracts.map((contract) => (
            <MobileListCard
              key={contract.id}
              title={contract.contractNo}
              subtitle={contract.port?.name || '未知目的港'}
              badge={getStatusBadge(contract.status)}
              fields={[
                { label: '签订日期', value: formatDate(contract.signedAt) || '—' },
                { label: '箱数', value: `${contract.totalBoxes || 0} 箱` },
                { label: '体积', value: `${(contract.volume || 0).toFixed(2)} CBM` },
                {
                  label: '门店',
                  value: contract.stores && contract.stores.length > 0
                    ? contract.stores.join(', ')
                    : '—',
                },
              ]}
              amount={{
                label: '合同金额',
                value: `$${contract.totalAmount.toLocaleString()}`,
                emphasis: 'success',
              }}
              onClick={() => router.push(`/dashboard/sales/${contract.id}`)}
              action={
                <div className="grid grid-cols-3 gap-2">
                  <Link href={`/dashboard/sales/${contract.id}`}>
                    <Button variant="outline" className="h-10 w-full rounded-xl text-xs">
                      <Eye className="mr-1 h-3.5 w-3.5" /> 详情
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    className="h-10 rounded-xl text-xs"
                    disabled={exportingId === contract.id}
                    onClick={() => handleExportExcel(contract)}
                  >
                    {exportingId === contract.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <FileSpreadsheet className="mr-1 h-3.5 w-3.5 text-emerald-600" />}
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 rounded-xl text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => openDeleteDialog(contract)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> 删除
                  </Button>
                </div>
              }
            />
          ))
        )}
      </div>

      {/* 桌面端卡片视图 */}
      <div className="hidden md:block space-y-4">
        {/* 排序栏 */}
        <div className="flex items-center gap-1 flex-wrap border-b border-border/40 pb-3">
          <span className="text-xs text-muted-foreground mr-2">本页排序</span>
          {[
            { key: 'contractNo', label: '合同编号', testId: 'sort-contractNo' },
            { key: 'portName', label: '港口' },
            { key: 'signedAt', label: '签订日期', testId: 'sort-signedAt' },
            { key: 'totalBoxes', label: '箱数', testId: 'sort-totalBoxes' },
            { key: 'volume', label: '体积', testId: 'sort-volume' },
            { key: 'totalAmount', label: '金额', testId: 'sort-totalAmount' },
          ].map(({ key, label, testId }) => {
            const isActive = salesSort.sortKey === key;
            return (
              <button
                key={key}
                data-testid={testId}
                onClick={() => salesSort.onSort(key)}
                className={`inline-flex items-center rounded-md px-2 py-1 text-xs transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {label}
                {isActive && (
                  salesSort.sortDir === 'asc'
                    ? <ArrowUp className="ml-1 h-3 w-3" />
                    : <ArrowDown className="ml-1 h-3 w-3" />
                )}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="surface-panel py-12 text-center text-sm text-muted-foreground">加载中...</div>
        ) : error && contracts.length === 0 ? <div className="surface-panel py-12 text-center text-sm text-muted-foreground">列表暂不可用，请重试。</div> : contracts.length === 0 ? (
          <div className="surface-panel flex flex-col items-center justify-center py-16 text-center">
            <Ship className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground mb-2">暂无出口合同</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              还没有创建任何出口合同，点击下方的按钮开始创建
            </p>
            <Button onClick={() => router.push('/dashboard/sales/create')}>
              <Plus className="mr-2 h-4 w-4" /> 新建出口合同
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {pagedContracts.map((contract) => (
              <Card
                key={contract.id}
                className="border-border/40 border-l-[3px] hover:border-primary/20 hover:shadow-md transition-all duration-300 cursor-pointer hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/10"
                style={{ borderLeftColor: getSalesStatusColor(contract.status) }}
                onClick={() => router.push(`/dashboard/sales/${contract.id}`)}
                data-testid={`contract-row-${contract.contractNo}`}
              >
                <CardContent className="p-4 space-y-3">
                  {/* 头部：合同编号 + 状态 */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Ship className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-semibold text-sm truncate">{contract.contractNo}</span>
                    </div>
                    <div className="shrink-0">
                      {getStatusBadge(contract.status)}
                    </div>
                  </div>

                  {/* 物流进度条 */}
                  <div className="flex items-center justify-between">
                    <LogisticsProgress status={contract.status} />
                    <span className="text-[10px] text-muted-foreground ml-2">
                      {LOGISTICS_STEPS[STATUS_STEP_MAP[contract.status] ?? 0]?.label}
                    </span>
                  </div>

                  {/* 货柜信息 */}
                  <ContainerInfo contract={contract} />

                  {/* 门店 + 第三方拼柜 */}
                  <div className="flex flex-wrap gap-1">
                    {contract.stores && contract.stores.length > 0
                      ? contract.stores.map((store, i) => (
                          <span key={i} className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {store}
                          </span>
                        ))
                      : <span className="text-xs text-muted-foreground">-</span>}
                    {contract.hasThirdPartyCargo && (
                      <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
                        含第三方拼柜
                      </span>
                    )}
                  </div>
                  {contract.hasThirdPartyCargo && contract.sourceParties?.length ? (
                    <div className="text-xs text-muted-foreground">
                      来源方：{contract.sourceParties.join(', ')}
                    </div>
                  ) : null}

                  {/* 数据行 */}
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">签订日期</p>
                      <p className="tabular-nums text-sm">{formatDate(contract.signedAt) || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">箱数</p>
                      <p className="tabular-nums text-sm">{contract.totalBoxes || 0} 箱</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">体积</p>
                      <p className="tabular-nums text-sm">{(contract.volume || 0).toFixed(1)} CBM</p>
                    </div>
                  </div>

                  {/* 金额 — 右对齐，区分货币 */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/30">
                    <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">合同金额</span>
                    <div className="text-right">
                      <span className="text-sm font-semibold tabular-nums">
                        <AmountText tone="success">${contract.totalAmount.toLocaleString()}</AmountText>
                      </span>
                      {contract.receivedAmount > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          已收 ${contract.receivedAmount.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                    <Link
                      href={`/dashboard/sales/${contract.id}`}
                      data-testid={`contract-detail-${contract.contractNo}`}
                      className="flex-1"
                    >
                      <Button
                        variant="default"
                        size="sm"
                        className="h-8 w-full rounded-lg text-xs"
                        title="查看详情与装箱"
                        aria-label={`查看合同 ${contract.contractNo}`}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        <span className="text-xs">详情</span>
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg text-xs"
                      title="导出标准出口 Excel"
                      aria-label={`导出合同 ${contract.contractNo} Excel`}
                      data-testid={`contract-export-${contract.contractNo}`}
                      disabled={exportingId === contract.id}
                      onClick={() => handleExportExcel(contract)}
                    >
                      {exportingId === contract.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <FileSpreadsheet className="mr-1 h-3.5 w-3.5 text-emerald-600" />}
                      Excel
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg text-xs text-destructive hover:bg-destructive/10"
                      title="删除合同"
                      aria-label={`删除合同 ${contract.contractNo}`}
                      data-testid={`contract-delete-${contract.contractNo}`}
                      onClick={() => openDeleteDialog(contract)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> 删除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 分页控制 */}
      <div className="flex flex-col gap-2 pt-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>共 {total} 条{totalPages > 1 ? `，第 ${currentPage}/${totalPages} 页` : ''}</span>
        <div className="flex items-center gap-2">
          <PageSizeSelect
            value={pageSize}
            onChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
              updateUrlParams({ pageSize: size, page: 1 });
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newPage = Math.max(1, currentPage - 1);
              setCurrentPage(newPage);
              updateUrlParams({ page: newPage });
            }}
            disabled={currentPage === 1}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newPage = Math.min(totalPages, currentPage + 1);
              setCurrentPage(newPage);
              updateUrlParams({ page: newPage });
            }}
            disabled={currentPage === totalPages || totalPages <= 1}
          >
            下一页
          </Button>
        </div>
      </div>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除出口合同 <strong>{contractToDelete?.contractNo}</strong> 吗？
              <br />
              此操作将同时删除该合同下的所有装箱明细，且无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteContract}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  删除中...
                </>
              ) : (
                '确认删除'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excel 解析依赖仅在用户打开批量导入时加载。 */}
      {importDialogOpen && (
        <Suspense fallback={null}>
          <LazyBatchImportDialog
            open={importDialogOpen}
            onOpenChange={setImportDialogOpen}
            title="批量导入出口合同"
            description="上传 Excel 文件批量导入出口合同。请先下载模板，按照模板格式填写数据后上传。"
            columns={importColumns}
            templateData={importTemplateData}
            onImport={handleBatchImport}
            onSuccess={() => {
              loadContracts();
              clearApiGetCache();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
