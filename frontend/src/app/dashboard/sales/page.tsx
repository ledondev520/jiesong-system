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
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
import { Plus, Eye, Ship, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';
export default function SalesPage() {
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  
  // 删除确认对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contractToDelete, setContractToDelete] = useState<SalesContract | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadContracts();
  }, []);

  const loadContracts = async () => {
    setLoading(true);
    try {
      const response = await salesService.getAll({ page: 1, pageSize: 100 });
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
    const statusMap: Record<SalesStatus, { label: string; className: string }> = {
      [SalesStatus.DRAFT]: { label: '草稿', className: 'bg-gray-100 text-gray-800' },
      [SalesStatus.CONFIRMED]: { label: '已确认', className: 'bg-blue-500' },
      [SalesStatus.PACKING]: { label: '装柜中', className: 'bg-yellow-500' },
      [SalesStatus.SHIPPED]: { label: '已发运', className: 'bg-purple-500' },
      [SalesStatus.ARRIVED]: { label: '已到达', className: 'bg-green-500' },
      [SalesStatus.COMPLETED]: { label: '已完成', className: 'bg-gray-500' },
      [SalesStatus.CANCELLED]: { label: '已取消', className: 'bg-red-500' },
    };
    const config = statusMap[status] || { label: status, className: '' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">出口合同</h2>
          <p className="text-muted-foreground">管理出口合同与装箱信息。共 {contracts.length} 个合同。</p>
        </div>
        <Button onClick={() => router.push('/dashboard/sales/create')}>
          <Plus className="mr-2 h-4 w-4" /> 新增出口合同
        </Button>
      </div>

      <div className="rounded-md border">
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
              <TableHead className="w-[80px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow>
                 <TableCell colSpan={9} className="text-center py-10">加载中...</TableCell>
               </TableRow>
            ) : contracts.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={9} className="text-center py-10">暂无出口合同。</TableCell>
               </TableRow>
            ) : (
              contracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Ship className="h-4 w-4 text-blue-500" />
                      {contract.contractNo}
                    </div>
                  </TableCell>
                  <TableCell>{contract.port?.name || '-'}</TableCell>
                  <TableCell>{getStatusBadge(contract.status)}</TableCell>
                  <TableCell>
                    {contract.signedAt ? format(new Date(contract.signedAt), 'yyyy-MM-dd') : '-'}
                  </TableCell>
                  <TableCell className="text-right">{contract.totalBoxes || 0}</TableCell>
                  <TableCell className="text-right">{(contract.volume || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{(contract.grossWeight || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right font-medium text-green-600">
                    ${contract.totalAmount.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Link href={`/dashboard/sales/${contract.id}`}>
                        <Button variant="ghost" size="icon" title="查看详情与装箱">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        title="删除合同"
                        onClick={() => openDeleteDialog(contract)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
              className="bg-red-600 hover:bg-red-700"
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
