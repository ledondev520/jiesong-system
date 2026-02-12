/**
 * Input: 后端 finance API
 * Output: 收付款管理页面（应付+应收 Tab切换）
 * Pos: 核心业务页面，管理所有收付款
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { PaymentType } from '@/types';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CreditCard, ArrowUpRight, ArrowDownLeft, RefreshCw } from 'lucide-react';
import { PaymentDialog } from '../../dashboard/finance/components/PaymentDialog';
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
  supplier?: { id: string; name: string };
}

interface ReceivableContract {
  id: string;
  contractNo: string;
  totalAmount: number;
  receivedAmount: number;
  unreceiveAmount: number;
  exchangeRate: number;
  status: string;
  items?: Array<{ store?: { id: string; name: string } }>;
}

interface FinanceStats {
  payable: { total: number; paid: number; unpaid: number };
  receivable: { total: number; received: number; unreceived: number };
}

/**
 * 职责：渲染收付款管理页面
 * 思路：
 *   1. 顶部显示统计卡片
 *   2. 使用Tab切换应付/应收列表
 *   3. 支持快速记录付款/收款
 */
export default function PaymentsPage() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab') || 'payable';
  
  // Tab状态（受控模式）
  const [activeTab, setActiveTab] = useState(tabFromUrl);
  
  // 同步URL参数变化
  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);
  
  // 统计数据
  const [stats, setStats] = useState<FinanceStats | null>(null);
  
  // 应付账款
  const [payables, setPayables] = useState<PayableContract[]>([]);
  const [payableLoading, setPayableLoading] = useState(true);
  const [selectedPayable, setSelectedPayable] = useState<PayableContract | null>(null);
  
  // 应收账款
  const [receivables, setReceivables] = useState<ReceivableContract[]>([]);
  const [receivableLoading, setReceivableLoading] = useState(true);
  const [selectedReceivable, setSelectedReceivable] = useState<ReceivableContract | null>(null);

  // 0. 初始化加载
  useEffect(() => {
    fetchStats();
    fetchPayables();
    fetchReceivables();
  }, []);

  // 1. 加载统计数据
  const fetchStats = async () => {
    try {
      const response = await api.get('/finance/stats');
      setStats((response as { data: FinanceStats }).data);
    } catch {
      console.error('获取财务统计失败');
    }
  };

  // 2. 加载应付账款
  const fetchPayables = async () => {
    setPayableLoading(true);
    try {
      const response = await api.get('/finance/payables', { params: { pageSize: 100 } });
      setPayables((response as any).data?.items || []);
    } catch {
      toast.error('加载应付账款失败');
    } finally {
      setPayableLoading(false);
    }
  };

  // 3. 加载应收账款
  const fetchReceivables = async () => {
    setReceivableLoading(true);
    try {
      const response = await api.get('/finance/receivables', { params: { pageSize: 100 } });
      setReceivables((response as any).data?.items || []);
    } catch {
      toast.error('加载应收账款失败');
    } finally {
      setReceivableLoading(false);
    }
  };

  // 处理付款提交
  const handlePayableSubmit = async (data: any) => {
    if (!selectedPayable) return;
    try {
      await api.post('/finance/payments', {
        type: 'PAYABLE',
        purchaseContractId: selectedPayable.id,
        amount: Number(data.amount),
        currency: 'CNY',
        paymentMethod: data.paymentMethod,
        paymentDate: new Date().toISOString(),
        note: data.note,
      });
      toast.success('付款记录已保存');
      setSelectedPayable(null);
      fetchPayables();
      fetchStats();
    } catch {
      toast.error('记录付款失败');
    }
  };

  // 处理收款提交
  const handleReceivableSubmit = async (data: any) => {
    if (!selectedReceivable) return;
    try {
      await api.post('/finance/payments', {
        type: 'RECEIVABLE',
        salesContractId: selectedReceivable.id,
        amount: Number(data.amount),
        currency: 'USD',
        paymentMethod: data.paymentMethod,
        paymentDate: new Date().toISOString(),
        note: data.note,
      });
      toast.success('收款记录已保存');
      setSelectedReceivable(null);
      fetchReceivables();
      fetchStats();
    } catch {
      toast.error('记录收款失败');
    }
  };

  // 获取门店名称
  const getStoreNames = (contract: ReceivableContract) => {
    const stores = contract.items?.map(item => item.store?.name).filter(Boolean);
    return stores && stores.length > 0 ? stores.join(', ') : '-';
  };

  // 过滤出待付/待收的合同
  const unpaidContracts = payables.filter(c => c.unpaidAmount > 0);
  const unreceiveContracts = receivables.filter(c => c.unreceiveAmount > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="收付款"
        description="管理应付账款与应收账款"
        actions={
          <Button variant="outline" size="sm" className="h-10 rounded-xl border-border/70 bg-background/60" onClick={() => { fetchStats(); fetchPayables(); fetchReceivables(); }}>
            <RefreshCw className="mr-2 h-4 w-4" /> 刷新
          </Button>
        }
      />

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">待付账款</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-chart-5" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-chart-5">
              ¥{(stats?.payable?.unpaid ?? 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              共 {unpaidContracts.length} 笔待付
            </p>
          </CardContent>
        </Card>
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">待收账款</CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              ${(stats?.receivable?.unreceived ?? 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              共 {unreceiveContracts.length} 笔待收
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tab切换 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="rounded-xl border border-border/70 bg-background/60">
          <TabsTrigger value="payable" className="gap-2">
            <ArrowUpRight className="h-4 w-4" />
            应付账款
          </TabsTrigger>
          <TabsTrigger value="receivable" className="gap-2">
            <ArrowDownLeft className="h-4 w-4" />
            应收账款
          </TabsTrigger>
        </TabsList>

        {/* 应付账款Tab */}
        <TabsContent value="payable" className="space-y-4">
          <div className="surface-panel overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>合同编号</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">总金额 (¥)</TableHead>
                  <TableHead className="text-right">已付 (¥)</TableHead>
                  <TableHead className="text-right">待付 (¥)</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payableLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : unpaidContracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      暂无待付账款
                    </TableCell>
                  </TableRow>
                ) : (
                  unpaidContracts.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell className="font-medium">{contract.contractNo}</TableCell>
                      <TableCell>{contract.supplier?.name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{contract.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{contract.totalAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-chart-3">
                        {contract.paidAmount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-chart-5 font-bold">
                        {contract.unpaidAmount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="rounded-xl border-border/70 bg-background/60" onClick={() => setSelectedPayable(contract)}>
                          <CreditCard className="mr-1 h-3 w-3" /> 付款
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* 应收账款Tab */}
        <TabsContent value="receivable" className="space-y-4">
          <div className="surface-panel overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>合同编号</TableHead>
                  <TableHead>门店</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">总金额 ($)</TableHead>
                  <TableHead className="text-right">已收 ($)</TableHead>
                  <TableHead className="text-right">待收 ($)</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receivableLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : unreceiveContracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      暂无待收账款
                    </TableCell>
                  </TableRow>
                ) : (
                  unreceiveContracts.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell className="font-medium">{contract.contractNo}</TableCell>
                      <TableCell>{getStoreNames(contract)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{contract.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{contract.totalAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-chart-3">
                        {contract.receivedAmount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-primary font-bold">
                        {contract.unreceiveAmount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="rounded-xl border-border/70 bg-background/60" onClick={() => setSelectedReceivable(contract)}>
                          <CreditCard className="mr-1 h-3 w-3" /> 收款
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* 付款弹窗 */}
      {selectedPayable && (
        <PaymentDialog 
          open={!!selectedPayable} 
          onOpenChange={(open) => !open && setSelectedPayable(null)}
          type={PaymentType.PAYABLE}
          contractId={selectedPayable.id}
          contractNo={selectedPayable.contractNo}
          remainingAmount={selectedPayable.unpaidAmount}
          onSubmit={handlePayableSubmit}
        />
      )}

      {/* 收款弹窗 */}
      {selectedReceivable && (
        <PaymentDialog 
          open={!!selectedReceivable} 
          onOpenChange={(open) => !open && setSelectedReceivable(null)}
          type={PaymentType.RECEIVABLE}
          contractId={selectedReceivable.id}
          contractNo={selectedReceivable.contractNo}
          remainingAmount={selectedReceivable.unreceiveAmount}
          onSubmit={handleReceivableSubmit}
        />
      )}
    </div>
  );
}
