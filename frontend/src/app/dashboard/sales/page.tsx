/**
 * Input: 出口合同服务
 * Output: 出口合同列表页面
 * Pos: 出口合同管理入口，展示合同列表与货柜信息
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
import { Plus, Eye, Ship } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { PORTS } from '@/lib/constants';

export default function SalesPage() {
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

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
   * 获取港口名称
   */
  const getPortName = (portId: string | undefined | null) => {
    if (!portId) return '-';
    return PORTS.find(p => p.id === portId)?.name || '-';
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
                  <TableCell>{getPortName(contract.portId)}</TableCell>
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
                    <Link href={`/dashboard/sales/${contract.id}`}>
                      <Button variant="ghost" size="icon" title="查看详情与装箱">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
