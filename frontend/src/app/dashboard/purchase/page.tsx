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
              <TableHead>供应商</TableHead>
              <TableHead>签订日期</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">总金额</TableHead>
              <TableHead className="text-right">已付</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
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
                    <TableCell className="font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {contract.contractNo}
                    </TableCell>
                    <TableCell>
                      {contract.supplier?.name}
                      {contract.supplier?.hasQualityIssue && (
                         <Badge variant="destructive" className="ml-2 text-[10px] h-5 px-1">质量问题</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(contract.signedAt)}</TableCell>
                    <TableCell>{getStatusBadge(contract.status)}</TableCell>
                    <TableCell className="text-right">¥{totalAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
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
