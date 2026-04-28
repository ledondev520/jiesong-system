/**
 * Input: 出口合同服务 (salesService)、通用表格排序 hook
 * Output: 出口合同列表页面（含删除、列排序、分页与搜索）
 * Pos: 出口合同管理入口，展示合同列表、货柜信息，支持删除操作
 *
 * 2026-01-26 新增：管理员可删除出口合同（带确认对话框）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { SalesContract, SalesStatus } from '@/types';
import { salesService } from '@/services/sales.service';
import { cachedFetch, invalidateCache } from '@/lib/api-cache';
import { useTabSync } from '@/lib/tab-sync';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AmountText } from '@/components/ui/amount-text';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
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
import { Plus, Eye, Ship, Trash2, Loader2, FileSpreadsheet, Container, Anchor, Boxes, Clock3, Search, Upload } from 'lucide-react';
import { BatchImportDialog, type ImportRow } from '@/components/batch-import';
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
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useTableSort } from '@/lib/hooks/useTableSort';

export default function SalesPage() {
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 删除确认对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contractToDelete, setContractToDelete] = useState<SalesContract | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('');

  // 批量导入对话框状态
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // 从 URL 读取分页状态
  const [currentPage, setCurrentPage] = useState(() => {
    const page = searchParams.get('page');
    return page ? parseInt(page, 10) : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    const size = searchParams.get('pageSize');
    return size ? parseInt(size, 10) : 20;
  });

  useEffect(() => {
    loadContracts();
  }, []);

  // 监听多标签页数据同步事件
  useTabSync('sales-contract-created', useCallback(() => {
    toast.info('新合同已创建，刷新列表');
    invalidateCache('sales-contracts-list');
    loadContracts();
  }, []));

  useTabSync('sales-contract-updated', useCallback(() => {
    toast.info('合同已更新，刷新列表');
    invalidateCache('sales-contracts-list');
    loadContracts();
  }, []));

  useTabSync('sales-contract-deleted', useCallback(() => {
    toast.info('合同已删除，刷新列表');
    invalidateCache('sales-contracts-list');
    loadContracts();
  }, []));

  // 同步 URL 参数到状态
  useEffect(() => {
    const page = searchParams.get('page');
    const size = searchParams.get('pageSize');
    const q = searchParams.get('q');

    if (page) setCurrentPage(parseInt(page, 10));
    if (size) setPageSize(parseInt(size, 10));
    if (q !== null) setSearchQuery(q);
  }, [searchParams]);

  // 更新 URL 参数
  const updateUrlParams = (params: { page?: number; pageSize?: number; q?: string }) => {
    const newParams = new URLSearchParams(searchParams.toString());

    if (params.page !== undefined) {
      if (params.page === 1) newParams.delete('page');
      else newParams.set('page', params.page.toString());
    }
    if (params.pageSize !== undefined) {
      if (params.pageSize === 20) newParams.delete('pageSize');
      else newParams.set('pageSize', params.pageSize.toString());
    }
    if (params.q !== undefined) {
      if (params.q === '') newParams.delete('q');
      else newParams.set('q', params.q);
    }

    const newUrl = newParams.toString() ? `${pathname}?${newParams.toString()}` : pathname;
    router.replace(newUrl, { scroll: false });
  };

  const loadContracts = async () => {
    setLoading(true);
    try {
      const response = await cachedFetch(
        'sales-contracts-list',
        () => salesService.getAll({ page: 1, pageSize: 100, lite: true }),
      );
      setContracts(response.data?.items || []);
    } catch {
      toast.error('加载出口合同失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 职责：打开删除确认对话框
   */
  const openDeleteDialog = (contract: SalesContract) => {
    setContractToDelete(contract);
    setDeleteDialogOpen(true);
  };

  /**
   * 职责：导出单份合同为标准出口 Excel（三 Sheet）
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
      invalidateCache('sales-contracts-list');
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
   * 获取状态徽章
   */
  const getStatusBadge = (status: SalesStatus) => {
    const statusMap: Record<SalesStatus, { label: string; tone: NonNullable<Parameters<typeof StatusBadge>[0]['statusMap']>[keyof NonNullable<Parameters<typeof StatusBadge>[0]['statusMap']>]['tone'] }> = {
      [SalesStatus.DRAFT]: { label: '草稿', tone: 'neutral' },
      [SalesStatus.CONFIRMED]: { label: '已确认', tone: 'info' },
      [SalesStatus.PACKING]: { label: '装柜中', tone: 'warning' },
      [SalesStatus.SHIPPED]: { label: '已发运', tone: 'progress' },
      [SalesStatus.ARRIVED]: { label: '已到达', tone: 'success' },
      [SalesStatus.COMPLETED]: { label: '已完成', tone: 'secondary' },
      [SalesStatus.CANCELLED]: { label: '已取消', tone: 'danger' },
    };
    const config = statusMap[status] || { label: status, tone: 'neutral' as const };
    return <StatusBadge status={status} statusMap={{ [status]: config }} />;
  };

  // 搜索过滤逻辑
  const filteredContracts = useMemo(() => {
    if (!searchQuery.trim()) return contracts;
    const query = searchQuery.toLowerCase();
    return contracts.filter(contract =>
      contract.contractNo.toLowerCase().includes(query) ||
      (contract.port?.name || '').toLowerCase().includes(query) ||
      contract.stores?.some(store => store.toLowerCase().includes(query))
    );
  }, [contracts, searchQuery]);

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

  const salesSort = useTableSort<SalesContract, string>(filteredContracts, salesAccessor, { key: 'signedAt', dir: 'desc' });
  const sortedContracts = salesSort.sortedData;

  // 分页逻辑
  const totalPages = Math.ceil(sortedContracts.length / pageSize);
  const pagedContracts = sortedContracts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const exportOverview = {
    preparing: contracts.filter((contract) => [SalesStatus.CONFIRMED, SalesStatus.PACKING].includes(contract.status)).length,
    inTransit: contracts.filter((contract) => contract.status === SalesStatus.SHIPPED).length,
    arrivedPendingClose: contracts.filter((contract) => contract.status === SalesStatus.ARRIVED).length,
    totalBoxes: contracts.reduce((sum, contract) => sum + (contract.totalBoxes || 0), 0),
  };

  return (
    <div className="min-w-0 space-y-4">
      <ModuleTabHeader tabs={EXPORT_TABS} moduleName="出口" />
      <PageHeader
        title="出口合同"
        description={`管理出口合同与装箱信息，共 ${contracts.length} 个合同`}
        actions={
          <div className="flex items-center gap-2">
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

      {/* 快捷入口 — 横向紧凑 */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3">
        <span className="mr-auto text-sm text-muted-foreground">
          回签后先补录箱数与重量，再推进报关与退税
        </span>
        <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => router.push('/customs-declarations')}>
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
          报关单
        </Button>
        <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => router.push('/dashboard/tax-refunds')}>
          <Ship className="mr-1.5 h-3.5 w-3.5" />
          退税跟进
        </Button>
      </div>

      {/* 出运概览 — 紧凑统计行 */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card className="border-border/70">
          <CardContent className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">待装柜</p>
              <p className="text-xl font-semibold tabular-nums">{exportOverview.preparing}</p>
            </div>
            <Boxes className="h-4 w-4 text-primary" />
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">在途</p>
              <p className="text-xl font-semibold tabular-nums">{exportOverview.inTransit}</p>
            </div>
            <Container className="h-4 w-4 text-sky-600" />
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">已到港</p>
              <p className="text-xl font-semibold tabular-nums">{exportOverview.arrivedPendingClose}</p>
            </div>
            <Anchor className="h-4 w-4 text-emerald-600" />
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="flex items-center justify-between px-4 py-3">
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
        ) : contracts.length === 0 ? (
          <div className="surface-panel py-12 text-center text-sm text-muted-foreground">暂无出口合同</div>
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
                { label: '毛重', value: `${(contract.grossWeight || 0).toLocaleString()} kg` },
                {
                  label: '门店',
                  value: contract.stores && contract.stores.length > 0
                    ? contract.stores.join(', ')
                    : '—',
                },
                ...(contract.hasThirdPartyCargo && contract.sourceParties?.length
                  ? [{ label: '第三方来源', value: contract.sourceParties.join(', ') }]
                  : []),
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

      {/* 桌面端表格视图 */}
      <div className="hidden surface-panel overflow-hidden md:block">
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow>
              <SortableTableHead
                className="w-[130px]"
                sortKey="contractNo"
                currentSortKey={salesSort.sortKey}
                currentSortDir={salesSort.sortDir}
                onSort={salesSort.onSort}
                data-testid="sort-contractNo"
              >
                合同编号
              </SortableTableHead>
              <SortableTableHead
                className="w-[80px]"
                sortKey="portName"
                currentSortKey={salesSort.sortKey}
                currentSortDir={salesSort.sortDir}
                onSort={salesSort.onSort}
              >
                港口
              </SortableTableHead>
              <SortableTableHead
                sortKey="stores"
                currentSortKey={salesSort.sortKey}
                currentSortDir={salesSort.sortDir}
                onSort={salesSort.onSort}
              >
                门店
              </SortableTableHead>
              <TableHead className="w-[80px]">状态</TableHead>
              <SortableTableHead
                className="w-[100px]"
                sortKey="signedAt"
                currentSortKey={salesSort.sortKey}
                currentSortDir={salesSort.sortDir}
                onSort={salesSort.onSort}
                data-testid="sort-signedAt"
              >
                签订日期
              </SortableTableHead>
              <SortableTableHead
                className="w-[60px] text-right"
                sortKey="totalBoxes"
                currentSortKey={salesSort.sortKey}
                currentSortDir={salesSort.sortDir}
                onSort={salesSort.onSort}
                data-testid="sort-totalBoxes"
              >
                箱数
              </SortableTableHead>
              <SortableTableHead
                className="w-[80px] text-right"
                sortKey="volume"
                currentSortKey={salesSort.sortKey}
                currentSortDir={salesSort.sortDir}
                onSort={salesSort.onSort}
                data-testid="sort-volume"
              >
                体积
              </SortableTableHead>
              <SortableTableHead
                className="w-[90px] text-right"
                sortKey="totalAmount"
                currentSortKey={salesSort.sortKey}
                currentSortDir={salesSort.sortDir}
                onSort={salesSort.onSort}
                data-testid="sort-totalAmount"
              >
                金额 ($)
              </SortableTableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow>
                 <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
               </TableRow>
            ) : contracts.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">暂无出口合同。</TableCell>
               </TableRow>
            ) : (
              pagedContracts.map((contract) => (
                <TableRow
                  key={contract.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/dashboard/sales/${contract.id}`)}
                  data-testid={`contract-row-${contract.contractNo}`}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      <Ship className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate">{contract.contractNo}</span>
                    </div>
                  </TableCell>
                  <TableCell className="truncate">{contract.port?.name || '-'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {contract.stores && contract.stores.length > 0
                        ? contract.stores.map((store, i) => (
                            <Badge key={i} variant="secondary" className="text-[11px] font-normal px-1.5 py-0">
                              {store}
                            </Badge>
                          ))
                        : <span className="text-muted-foreground">-</span>}
                      {contract.hasThirdPartyCargo && (
                        <Badge variant="outline" className="text-[11px] border-amber-500/40 text-amber-700">
                          含第三方拼柜
                        </Badge>
                      )}
                    </div>
                    {contract.hasThirdPartyCargo && contract.sourceParties?.length ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        来源方：{contract.sourceParties.join(', ')}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{getStatusBadge(contract.status)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatDate(contract.signedAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{contract.totalBoxes || 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{(contract.volume || 0).toFixed(1)}</TableCell>
                  <TableCell className="text-right">
                    <AmountText tone="success">${contract.totalAmount.toLocaleString()}</AmountText>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/dashboard/sales/${contract.id}`}
                        data-testid={`contract-detail-${contract.contractNo}`}
                      >
                        <Button
                          variant="default"
                          size="sm"
                          className="h-8 px-3 rounded-lg"
                          title="查看详情与装箱"
                          aria-label={`查看合同 ${contract.contractNo}`}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1.5" />
                          <span className="text-xs">详情</span>
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        title="导出标准出口 Excel"
                        aria-label={`导出合同 ${contract.contractNo} Excel`}
                        data-testid={`contract-export-${contract.contractNo}`}
                        disabled={exportingId === contract.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportExcel(contract);
                        }}
                      >
                        {exportingId === contract.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                        }
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg hover:text-destructive hover:border-destructive"
                        title="删除合同"
                        aria-label={`删除合同 ${contract.contractNo}`}
                        data-testid={`contract-delete-${contract.contractNo}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteDialog(contract);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 搜索栏 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm">
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
          {searchQuery ? `找到 ${filteredContracts.length} 条结果` : `共 ${contracts.length} 个合同`}
        </span>
      </div>

      {/* 分页控制 */}
      <div className="flex flex-col gap-2 pt-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>共 {sortedContracts.length} 条{totalPages > 1 ? `，第 ${currentPage}/${totalPages} 页` : ''}</span>
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

      {/* 批量导入对话框 */}
      <BatchImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        title="批量导入出口合同"
        description="上传 Excel 文件批量导入出口合同。请先下载模板，按照模板格式填写数据后上传。"
        columns={importColumns}
        templateData={importTemplateData}
        onImport={handleBatchImport}
        onSuccess={() => {
          loadContracts();
          invalidateCache('sales-contracts-list');
        }}
      />
    </div>
  );
}
