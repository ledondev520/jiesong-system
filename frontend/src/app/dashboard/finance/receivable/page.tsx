/**
 * Input: 后端 /finance/receivables API
 * Output: 应收账款管理页面
 * Pos: 财务模块子页面，展示并管理门店待收款项
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

interface ReceivableContract {
  id: string;
  contractNo: string;
  totalAmount: number;
  receivedAmount: number;
  unreceiveAmount: number;
  exchangeRate: number;
  status: string;
  stores?: string[]; // 去重后的门店名称列表
}

export default function ReceivablePage() {
  const [contracts, setContracts] = useState<ReceivableContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContract, setSelectedContract] = useState<ReceivableContract | null>(null);

  // 加载应收账款数据
  const fetchReceivables = async () => {
    try {
      setLoading(true);
      const response = await api.get<
        ApiResponse<PaginatedResponse<ReceivableContract>>,
        ApiResponse<PaginatedResponse<ReceivableContract>>
      >('/finance/receivables', { params: { pageSize: 100 } });
      const data = response.data;
      setContracts(data?.items || []);
    } catch (error) {
      console.error('获取应收账款失败:', error);
      toast.error('加载应收账款失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReceivables();
  }, []);

  const handleReceive = (contract: ReceivableContract) => {
    setSelectedContract(contract);
  };

  const handleSubmit = async (data: PaymentSubmitData) => {
    if (!selectedContract) return;
    
    try {
      // 调用后端API创建收款记录
      await api.post('/finance/payments', {
        type: 'RECEIVABLE',
        salesContractId: selectedContract.id,
        amount: Number(data.amount),
        currency: 'USD',
        paymentMethod: data.paymentMethod,
        paymentDate: new Date().toISOString(),
        note: data.note,
      });
      
      toast.success('收款记录已保存');
      setSelectedContract(null);
      // 重新加载数据
      fetchReceivables();
    } catch (error) {
      console.error('记录收款失败:', error);
      toast.error('记录收款失败');
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

  // 过滤出有待收金额的合同
  const unreceiveContracts = contracts.filter(c => c.unreceiveAmount > 0);

  /**
   * 获取门店名称列表（后端已去重）
   */
  const getStoreNames = (contract: ReceivableContract) => {
    return contract.stores?.length ? contract.stores.join(', ') : '-';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="应收账款"
        description={`门店收款跟踪。共 ${unreceiveContracts.length} 笔待收账款。`}
        actions={
          <Button variant="outline" className="h-10 rounded-xl border-border/70 bg-background/60" onClick={fetchReceivables}>
            刷新
          </Button>
        }
      />

      <div className="surface-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">合同编号</TableHead>
              <TableHead className="max-w-[200px]">门店</TableHead>
              <TableHead className="w-[100px]">状态</TableHead>
              <TableHead className="text-right w-[120px]">总金额 ($)</TableHead>
              <TableHead className="text-right w-[100px]">已收 ($)</TableHead>
              <TableHead className="text-right w-[100px]">待收 ($)</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {unreceiveContracts.length > 0 ? (
              unreceiveContracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell className="font-medium">{contract.contractNo}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={getStoreNames(contract)}>
                    {getStoreNames(contract)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{contract.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">${contract.totalAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-chart-3">${contract.receivedAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-destructive font-bold">
                    ${contract.unreceiveAmount.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" className="rounded-xl" onClick={() => handleReceive(contract)}>
                      <CreditCard className="mr-2 h-3 w-3" /> 记录收款
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  暂无待收账款
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
          type={PaymentType.RECEIVABLE}
          contractId={selectedContract.id}
          contractNo={selectedContract.contractNo}
          remainingAmount={selectedContract.unreceiveAmount}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
