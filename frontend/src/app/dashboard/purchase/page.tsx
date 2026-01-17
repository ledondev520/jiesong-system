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
import { Plus, Eye, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';

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
      const response = await purchaseService.getAll({ page: 1, pageSize: 100 });
      setContracts(response.data?.items || []);
    } catch (error) {
      toast.error('加载采购合同失败');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: PurchaseStatus) => {
    switch (status) {
      case PurchaseStatus.DRAFT: return <Badge variant="outline">草稿</Badge>;
      case PurchaseStatus.SIGNED: return <Badge className="bg-blue-500">已签订</Badge>;
      case PurchaseStatus.PRODUCING: return <Badge className="bg-yellow-500">生产中</Badge>;
      case PurchaseStatus.SHIPPED: return <Badge className="bg-purple-500">已发货</Badge>;
      case PurchaseStatus.COMPLETED: return <Badge className="bg-green-500">已完成</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">采购管理</h2>
          <p className="text-muted-foreground">管理采购合同与付款进度。</p>
        </div>
        <Button onClick={() => router.push('/dashboard/purchase/create')}>
          <Plus className="mr-2 h-4 w-4" /> 新增采购合同
        </Button>
      </div>

      <div className="rounded-md border">
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
                 <TableCell colSpan={7} className="text-center py-10">加载中...</TableCell>
               </TableRow>
            ) : contracts.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={7} className="text-center py-10">暂无合同。</TableCell>
               </TableRow>
            ) : (
              contracts.map((contract) => (
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
                  <TableCell>{contract.signedAt ? format(new Date(contract.signedAt), 'yyyy-MM-dd') : '-'}</TableCell>
                  <TableCell>{getStatusBadge(contract.status)}</TableCell>
                  <TableCell className="text-right">¥{contract.totalAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <span className={contract.paidAmount < contract.totalAmount ? 'text-yellow-600' : 'text-green-600'}>
                      ¥{contract.paidAmount.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon">
                      <Eye className="h-4 w-4" />
                    </Button>
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
