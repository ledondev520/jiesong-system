/**
 * Input: 后端 finance API
 * Output: 收付款管理页面（应付+应收 Tab切换）
 * Pos: 核心业务页面，管理所有收付款
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
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
import { Input } from '@/components/ui/input';
import { CreditCard, ArrowUpRight, ArrowDownLeft, RefreshCw, Search, X } from 'lucide-react';
import { PaymentDialog, type PaymentSubmitData } from '../../dashboard/finance/components/PaymentDialog';
import { toast } from 'sonner';
import { financeService } from '@/services/finance.service';
import { cachedFetch, invalidateCache } from '@/lib/api-cache';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, FINANCE_TABS } from '@/components/layout/ModuleTabHeader';

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
function PaymentsPageContent() {
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
  // 列表关键词（客户端过滤：合同号 / 供应商或门店）
  const [keyword, setKeyword] = useState('');

  // 0. 初始化加载
  useEffect(() => {
    fetchStats();
    fetchPayables();
    fetchReceivables();
  }, []);

  // 1. 加载统计数据
  const fetchStats = async () => {
    try {
      const data = await cachedFetch('fin-stats', () => financeService.getStats());
      setStats(data);
    } catch {
      console.error('获取财务统计失败');
    }
  };

  // 2. 加载应付账款（带缓存）
  const fetchPayables = async () => {
    setPayableLoading(true);
    try {
      const response = await cachedFetch('fin-payables-p1', () => financeService.getPayables({ pageSize: 100 }));
      setPayables(
        (response.data?.items || []).map((item) => ({
          id: item.id,
          contractNo: item.contractNo,
          totalAmount: item.totalAmount,
          paidAmount: item.paidAmount ?? 0,
          unpaidAmount: item.unpaidAmount ?? Math.max(0, item.totalAmount - (item.paidAmount ?? 0)),
          status: item.status,
          supplier: item.supplier,
        })),
      );
    } catch {
      toast.error('加载应付账款失败');
    } finally {
      setPayableLoading(false);
    }
  };

  // 3. 加载应收账款（带缓存）
  const fetchReceivables = async () => {
    setReceivableLoading(true);
    try {
      const response = await cachedFetch('fin-receivables-p1', () => financeService.getReceivables({ pageSize: 100 }));
      setReceivables(
        (response.data?.items || []).map((item) => ({
          id: item.id,
          contractNo: item.contractNo,
          totalAmount: item.totalAmount,
          receivedAmount: item.receivedAmount ?? 0,
          unreceiveAmount: item.unreceiveAmount ?? Math.max(0, item.totalAmount - (item.receivedAmount ?? 0)),
          exchangeRate: 0,
          status: item.status,
          items: item.items,
        })),
      );
    } catch {
      toast.error('加载应收账款失败');
    } finally {
      setReceivableLoading(false);
    }
  };

  // 处理付款提交
  const handlePayableSubmit = async (data: PaymentSubmitData) => {
    if (!selectedPayable) return;
    try {
      await financeService.createPayment({
        type: PaymentType.PAYABLE,
        purchaseContractId: selectedPayable.id,
        amount: Number(data.amount),
        currency: 'CNY',
        paymentMethod: data.paymentMethod,
        paymentDate: new Date().toISOString(),
        note: data.note,
      });
      toast.success('付款记录已保存');
      setSelectedPayable(null);
      invalidateCache('fin-payables');
      invalidateCache('fin-stats');
      fetchPayables();
      fetchStats();
    } catch {
      toast.error('记录付款失败');
    }
  };

  // 处理收款提交
  const handleReceivableSubmit = async (data: PaymentSubmitData) => {
    if (!selectedReceivable) return;
    try {
      await financeService.createPayment({
        type: PaymentType.RECEIVABLE,
        salesContractId: selectedReceivable.id,
        amount: Number(data.amount),
        currency: 'USD',
        paymentMethod: data.paymentMethod,
        paymentDate: new Date().toISOString(),
        note: data.note,
      });
      toast.success('收款记录已保存');
      setSelectedReceivable(null);
      invalidateCache('fin-receivables');
      invalidateCache('fin-stats');
      fetchReceivables();
      fetchStats();
    } catch {
      toast.error('记录收款失败');
    }
  };

  // 获取门店名称（应收列表展示与关键词筛选）
  const getStoreNames = (contract: ReceivableContract) => {
    const stores = contract.items?.map((item) => item.store?.name).filter(Boolean);
    return stores && stores.length > 0 ? stores.join(', ') : '-';
  };

  // 待付/待收基础列表（统计卡片用全量；表格再套关键词）
  const unpaidBase = useMemo(
    () => payables.filter((c) => c.unpaidAmount > 0),
    [payables]
  );
  const unreceiveBase = useMemo(
    () => receivables.filter((c) => c.unreceiveAmount > 0),
    [receivables]
  );

  const unpaidContracts = useMemo(() => {
    if (!keyword.trim()) {
      return unpaidBase;
    }
    const q = keyword.toLowerCase().trim();
    return unpaidBase.filter(
      (c) =>
        (c.contractNo || '').toLowerCase().includes(q) ||
        (c.supplier?.name || '').toLowerCase().includes(q)
    );
  }, [unpaidBase, keyword]);

  const unreceiveContracts = useMemo(() => {
    if (!keyword.trim()) {
      return unreceiveBase;
    }
    const q = keyword.toLowerCase().trim();
    return unreceiveBase.filter(
      (c) =>
        (c.contractNo || '').toLowerCase().includes(q) ||
        getStoreNames(c).toLowerCase().includes(q)
    );
  }, [unreceiveBase, keyword]);

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={FINANCE_TABS} moduleName="财务" />
      <PageHeader
        title="收付款"
        description="管理应付账款与应收账款"
        actions={
          <Button variant="outline" size="sm" className="h-10" onClick={() => { fetchStats(); fetchPayables(); fetchReceivables(); }}>
            <RefreshCw className="mr-2 h-4 w-4" /> 刷新
          </Button>
        }
      />

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">待付账款</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              ¥{(stats?.payable?.unpaid ?? 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              共 {unpaidBase.length} 笔待付
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
              共 {unreceiveBase.length} 笔待收
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 统一搜索：对当前 Tab 下列表做客户端过滤 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            placeholder="搜索合同号、供应商/门店..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        {keyword && (
          <Button variant="ghost" size="sm" onClick={() => setKeyword('')}>
            <X className="mr-1 h-4 w-4" />
            重置
          </Button>
        )}
      </div>

      {/* Tab切换 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="border bg-background">
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
          <Card className="overflow-hidden">
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
                      <TableCell className="text-right text-primary/80">
                        {contract.paidAmount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-bold text-primary">
                        {contract.unpaidAmount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setSelectedPayable(contract)}>
                          <CreditCard className="mr-1 h-3 w-3" /> 付款
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* 应收账款Tab */}
        <TabsContent value="receivable" className="space-y-4">
          <Card className="overflow-hidden">
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
                      <TableCell className="text-right text-primary/80">
                        {contract.receivedAmount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-primary font-bold">
                        {contract.unreceiveAmount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setSelectedReceivable(contract)}>
                          <CreditCard className="mr-1 h-3 w-3" /> 收款
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
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

export default function PaymentsPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <PaymentsPageContent />
    </Suspense>
  );
}
