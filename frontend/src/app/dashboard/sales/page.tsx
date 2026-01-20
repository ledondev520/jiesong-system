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
import { Plus, Eye, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';

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
    } catch (error) {
      toast.error('加载销售合同失败');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: SalesStatus) => {
    switch (status) {
      case SalesStatus.DRAFT: return <Badge variant="outline">草稿</Badge>;
      case SalesStatus.CONFIRMED: return <Badge className="bg-blue-500">已确认</Badge>;
      case SalesStatus.PAID: return <Badge className="bg-green-500">已收款</Badge>;
      case SalesStatus.SHIPPED: return <Badge className="bg-purple-500">已发货</Badge>;
      case SalesStatus.COMPLETED: return <Badge className="bg-gray-500">已完成</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">销售管理</h2>
          <p className="text-muted-foreground">管理出口合同与收款。</p>
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
              <TableHead>日期</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">总金额 ($)</TableHead>
              <TableHead className="text-right">已收 ($)</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow>
                 <TableCell colSpan={6} className="text-center py-10">加载中...</TableCell>
               </TableRow>
            ) : contracts.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={6} className="text-center py-10">暂无合同。</TableCell>
               </TableRow>
            ) : (
              contracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    {contract.contractNo}
                  </TableCell>
                  <TableCell>{contract.signedAt ? format(new Date(contract.signedAt), 'yyyy-MM-dd') : '-'}</TableCell>
                  <TableCell>{getStatusBadge(contract.status)}</TableCell>
                  <TableCell className="text-right">${contract.totalAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <span className={contract.receivedAmount < contract.totalAmount ? 'text-yellow-600' : 'text-green-600'}>
                      ${contract.receivedAmount.toLocaleString()}
                    </span>
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
