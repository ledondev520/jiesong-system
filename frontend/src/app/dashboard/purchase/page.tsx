/**
 * Input: 采购合同服务API
 * Output: 采购合同列表页面
 * Pos: 采购管理入口，负责合同概览与状态追踪
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
import { PurchaseContract, PurchaseStatus } from '@/types';
import { purchaseService } from '@/services/purchase.service';
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
import { StatusBadge, type StatusBadgeConfig } from '@/components/ui/status-badge';
import { AmountText } from '@/components/ui/amount-text';
import { Plus, Eye, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/date-format';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';

export default function PurchasePage() {
  const [contracts, setContracts] = useState<PurchaseContract[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadContracts();
  }, []);

  const loadContracts = async () => {
    setLoading(true);
    try {
      const response = await purchaseService.getAll({ page: 1, pageSize: 100, lite: true });
      setContracts(response.data?.items || []);
    } catch {
      toast.error('加载采购合同失败');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: PurchaseStatus) => {
    const statusMap: Record<PurchaseStatus, StatusBadgeConfig> = {
      [PurchaseStatus.DRAFT]: { label: '草稿', tone: 'neutral' },
      [PurchaseStatus.SIGNED]: { label: '已签订', tone: 'info' },
      [PurchaseStatus.PRODUCING]: { label: '生产中', tone: 'warning' },
      [PurchaseStatus.SHIPPED]: { label: '已发货', tone: 'progress' },
      [PurchaseStatus.RECEIVED]: { label: '已收货', tone: 'success' },
      [PurchaseStatus.COMPLETED]: { label: '已完成', tone: 'success' },
      [PurchaseStatus.CANCELLED]: { label: '已取消', tone: 'secondary' },
    };
    return <StatusBadge status={status} statusMap={statusMap} />;
  };

  /**
   * 职责：跳转到采购合同详情页
   * @param id 合同ID
   */
  const handleViewContract = (id: string) => {
    router.push(`/dashboard/purchase/${id}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="采购管理"
        description="管理采购合同与付款进度。"
        actions={
          <Button className="h-10 rounded-xl" onClick={() => router.push('/dashboard/purchase/create')}>
            <Plus className="mr-2 h-4 w-4" /> 新增采购合同
          </Button>
        }
      />

      <div className="surface-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>合同编号</TableHead>
              <TableHead className="hidden sm:table-cell">供应商</TableHead>
              <TableHead className="hidden md:table-cell">签订日期</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="hidden sm:table-cell text-right">总金额</TableHead>
              <TableHead className="hidden sm:table-cell text-right">已付</TableHead>
              <TableHead className="w-[60px] sm:w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow>
                 <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
               </TableRow>
            ) : contracts.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">暂无合同。</TableCell>
               </TableRow>
            ) : (
              contracts.map((contract) => {
                const totalAmount = Number(contract.totalAmount || 0);
                const paidAmount = Number(contract.paidAmount || 0);

                return (
                  <TableRow key={contract.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span>{contract.contractNo}</span>
                      </div>
                      {/* 手机端在合同号下内嵌供应商和金额 */}
                      <div className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                        {contract.supplier?.name}
                        {contract.supplier?.hasQualityIssue && (
                          <Badge variant="destructive" className="ml-1 text-[10px] h-4 px-1">质量问题</Badge>
                        )}
                        <span className="mx-1">·</span>
                        ¥{totalAmount.toLocaleString()}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {contract.supplier?.name}
                      {contract.supplier?.hasQualityIssue && (
                         <Badge variant="destructive" className="ml-2 text-[10px] h-5 px-1">质量问题</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{formatDate(contract.signedAt)}</TableCell>
                    <TableCell>{getStatusBadge(contract.status)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-right">¥{totalAmount.toLocaleString()}</TableCell>
                    <TableCell className="hidden sm:table-cell text-right">
                      <AmountText tone={paidAmount < totalAmount ? 'warning' : 'success'}>
                        ¥{paidAmount.toLocaleString()}
                      </AmountText>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`查看合同 ${contract.contractNo}`}
                        onClick={() => handleViewContract(contract.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
