/**
 * Input: 后端 /finance/payables API
 * Output: 应付账款管理页面
 * Pos: 财务模块子页面，展示并管理供应商待付款项
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
import { PaymentType, type ApiResponse, type PaginatedResponse } from '@/types';
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
import { CreditCard, Loader2 } from 'lucide-react';
import { PaymentDialog, type PaymentSubmitData } from '../components/PaymentDialog';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { PageHeader } from '@/components/layout/PageHeader';

interface PayableContract {
  id: string;
  contractNo: string;
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  status: string;
  supplier?: {
    id: string;
    name: string;
  };
}

export default function PayablePage() {
  const [contracts, setContracts] = useState<PayableContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContract, setSelectedContract] = useState<PayableContract | null>(null);

  // 加载应付账款数据
  const fetchPayables = async () => {
    try {
      setLoading(true);
      const response = await api.get<
        ApiResponse<PaginatedResponse<PayableContract>>,
        ApiResponse<PaginatedResponse<PayableContract>>
      >('/finance/payables', { params: { pageSize: 100 } });
      const data = response.data;
      setContracts(data?.items || []);
    } catch (error) {
      console.error('获取应付账款失败:', error);
      toast.error('加载应付账款失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayables();
  }, []);

  const handlePay = (contract: PayableContract) => {
    setSelectedContract(contract);
  };

  const handleSubmit = async (data: PaymentSubmitData) => {
    if (!selectedContract) return;
    
    try {
      // 调用后端API创建付款记录
      await api.post('/finance/payments', {
        type: 'PAYABLE',
        purchaseContractId: selectedContract.id,
        amount: Number(data.amount),
        currency: 'CNY',
        paymentMethod: data.paymentMethod,
        paymentDate: new Date().toISOString(),
        note: data.note,
      });
      
      toast.success('付款记录已保存');
      setSelectedContract(null);
      // 重新加载数据
      fetchPayables();
    } catch (error) {
      console.error('记录付款失败:', error);
      toast.error('记录付款失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2">加载中...</span>
      </div>
    );
  }

  // 过滤出有待付金额的合同
  const unpaidContracts = contracts.filter(c => c.unpaidAmount > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="应付账款"
        description={`供应商付款跟踪。共 ${unpaidContracts.length} 笔待付账款。`}
        actions={
          <Button variant="outline" className="h-10 rounded-xl border-border/70 bg-background/60" onClick={fetchPayables}>
            刷新
          </Button>
        }
      />

      <div className="surface-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>合同编号</TableHead>
              <TableHead>供应商</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">总金额</TableHead>
              <TableHead className="text-right">已付</TableHead>
              <TableHead className="text-right">待付</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {unpaidContracts.length > 0 ? (
              unpaidContracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell className="font-medium">{contract.contractNo}</TableCell>
                  <TableCell>{contract.supplier?.name || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{contract.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">¥{contract.totalAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-chart-3">¥{contract.paidAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-destructive font-bold">
                    ¥{contract.unpaidAmount.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" className="rounded-xl" onClick={() => handlePay(contract)}>
                      <CreditCard className="mr-2 h-3 w-3" /> 记录付款
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  暂无待付账款
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {selectedContract && (
        <PaymentDialog 
          open={!!selectedContract} 
          onOpenChange={(open) => !open && setSelectedContract(null)}
          type={PaymentType.PAYABLE}
          contractId={selectedContract.id}
          contractNo={selectedContract.contractNo}
          remainingAmount={selectedContract.unpaidAmount}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
