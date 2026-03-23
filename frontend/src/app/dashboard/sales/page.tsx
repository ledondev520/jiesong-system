/**
 * Input: 出口合同服务 (salesService)
 * Output: 出口合同列表页面（含删除功能）
 * Pos: 出口合同管理入口，展示合同列表、货柜信息，支持删除操作
 * 
 * 2026-01-26 新增：管理员可删除出口合同（带确认对话框）
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
import { SalesContract, SalesStatus } from '@/types';
import { salesService } from '@/services/sales.service';
import { cachedFetch, invalidateCache } from '@/lib/api-cache';
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
import { Plus, Eye, Ship, Trash2, Loader2, FileSpreadsheet, Container, Anchor, Boxes, Clock3 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/date-format';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, EXPORT_TABS } from '@/components/layout/ModuleTabHeader';
import { PageSizeSelect } from '@/components/ui/page-size-select';
export default function SalesPage() {
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  
  // 删除确认对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contractToDelete, setContractToDelete] = useState<SalesContract | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    loadContracts();
  }, []);

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
      loadContracts(); // 刷新列表
    } catch {
      toast.error('删除合同失败');
    } finally {
      setDeleting(false);
    }
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

  const totalPages = Math.ceil(contracts.length / pageSize);
  const pagedContracts = contracts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const exportOverview = {
    preparing: contracts.filter((contract) => [SalesStatus.CONFIRMED, SalesStatus.PACKING].includes(contract.status)).length,
    inTransit: contracts.filter((contract) => contract.status === SalesStatus.SHIPPED).length,
    arrivedPendingClose: contracts.filter((contract) => contract.status === SalesStatus.ARRIVED).length,
    totalBoxes: contracts.reduce((sum, contract) => sum + (contract.totalBoxes || 0), 0),
  };

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={EXPORT_TABS} moduleName="出口" />
      <PageHeader
        title="出口合同"
        description={`管理出口合同与装箱信息。共 ${contracts.length} 个合同。`}
        actions={
          <Button className="h-10 rounded-xl" onClick={() => router.push('/dashboard/sales/create')}>
            <Plus className="mr-2 h-4 w-4" /> 新增出口合同
          </Button>
        }
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">出口出运概览</p>
            <h3 className="text-lg font-semibold tracking-tight">围绕装柜、在途与到港节点安排出口履约节奏</h3>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/tax-refunds')}>
            前往退税跟进
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border/70">
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="text-sm text-muted-foreground">待装柜合同</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{exportOverview.preparing}</p>
              </div>
              <Boxes className="h-5 w-5 text-primary" />
            </CardContent>
          </Card>
          <Card className="border-border/70">
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="text-sm text-muted-foreground">在途货柜</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{exportOverview.inTransit}</p>
              </div>
              <Container className="h-5 w-5 text-sky-600" />
            </CardContent>
          </Card>
          <Card className="border-border/70">
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="text-sm text-muted-foreground">已到港待结清</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{exportOverview.arrivedPendingClose}</p>
              </div>
              <Anchor className="h-5 w-5 text-emerald-600" />
            </CardContent>
          </Card>
          <Card className="border-border/70">
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="text-sm text-muted-foreground">总箱数</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{exportOverview.totalBoxes}</p>
              </div>
              <Clock3 className="h-5 w-5 text-amber-600" />
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="surface-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>合同编号</TableHead>
              <TableHead>目的港口</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>签订日期</TableHead>
              <TableHead className="text-right">箱数</TableHead>
              <TableHead className="text-right">体积 (CBM)</TableHead>
              <TableHead className="text-right">毛重 (kg)</TableHead>
              <TableHead className="text-right">金额 ($)</TableHead>
              <TableHead className="w-[112px]">操作</TableHead>
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
                <TableRow key={contract.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Ship className="h-4 w-4 text-primary" />
                      {contract.contractNo}
                    </div>
                  </TableCell>
                  <TableCell>{contract.port?.name || '-'}</TableCell>
                  <TableCell>{getStatusBadge(contract.status)}</TableCell>
                  <TableCell>
                    {formatDate(contract.signedAt)}
                  </TableCell>
                  <TableCell className="text-right">{contract.totalBoxes || 0}</TableCell>
                  <TableCell className="text-right">{(contract.volume || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{(contract.grossWeight || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <AmountText tone="success">${contract.totalAmount.toLocaleString()}</AmountText>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Link href={`/dashboard/sales/${contract.id}`}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-xl border border-border/65 bg-background/55"
                          title="查看详情与装箱"
                          aria-label={`查看合同 ${contract.contractNo}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-xl border border-border/65 bg-background/55"
                        title="导出标准出口 Excel"
                        aria-label={`导出合同 ${contract.contractNo} Excel`}
                        disabled={exportingId === contract.id}
                        onClick={() => handleExportExcel(contract)}
                      >
                        {exportingId === contract.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                        }
                      </Button>
                      <Button 
                        variant="ghost"
                        size="icon" 
                        className="rounded-xl border border-border/65 bg-background/55"
                        title="删除合同"
                        aria-label={`删除合同 ${contract.contractNo}`}
                        onClick={() => openDeleteDialog(contract)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 分页控制 */}
      <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>共 {contracts.length} 条{totalPages > 1 ? `，第 ${currentPage}/${totalPages} 页` : ''}</span>
        <div className="flex items-center gap-2">
          <PageSizeSelect
            value={pageSize}
            onChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
    </div>
  );
}
