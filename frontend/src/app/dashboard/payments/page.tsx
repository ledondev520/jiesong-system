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
import { CreditCard, ArrowUpRight, ArrowDownLeft, RefreshCw, Search, X, Plus, Split } from 'lucide-react';
import { MobileListCard } from '@/components/mobile';
import { PaymentDialog, type PaymentSubmitData } from '../../dashboard/finance/components/PaymentDialog';
import { ReceiptDialog, type ReceiptSubmitData } from '../../dashboard/finance/components/ReceiptDialog';
import { AllocateDialog } from '../../dashboard/finance/components/AllocateDialog';
import { toast } from 'sonner';
import { financeService } from '@/services/finance.service';
import { cachedFetch, invalidateCache } from '@/lib/api-cache';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, FINANCE_TABS } from '@/components/layout/ModuleTabHeader';
import { LoadingState, TableStateRow } from '@/components/ui/data-state';
import type { Payment } from '@/types';

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
  stores?: string[];
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
  const [payableError, setPayableError] = useState(false);
  const [selectedPayable, setSelectedPayable] = useState<PayableContract | null>(null);
  
  // 应收账款
  const [receivables, setReceivables] = useState<ReceivableContract[]>([]);
  const [receivableLoading, setReceivableLoading] = useState(true);
  const [receivableError, setReceivableError] = useState(false);
  const [selectedReceivable, setSelectedReceivable] = useState<ReceivableContract | null>(null);
  // 列表关键词（客户端过滤：合同号 / 供应商或门店）
  const [keyword, setKeyword] = useState('');

  // 待分配收款
  const [unallocatedPayments, setUnallocatedPayments] = useState<Payment[]>([]);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [allocateTarget, setAllocateTarget] = useState<Payment | null>(null);

  // 0. 初始化加载
  useEffect(() => {
    fetchStats();
    fetchPayables();
    fetchReceivables();
    fetchUnallocated();
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
    setPayableError(false);
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
      setPayableError(true);
      toast.error('加载应付账款失败');
    } finally {
      setPayableLoading(false);
    }
  };

  // 3a. 加载待分配收款
  const fetchUnallocated = async () => {
    try {
      const res = await financeService.getUnallocatedPayments();
      setUnallocatedPayments(res.data || []);
    } catch {
      // 非关键错误，静默处理
    }
  };

  // 3. 加载应收账款（带缓存）
  const fetchReceivables = async () => {
    setReceivableLoading(true);
    setReceivableError(false);
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
          // 后端已聚合好的门店名称数组（优先）
          stores: (item as unknown as { stores?: string[] }).stores,
          items: item.items,
        })),
      );
    } catch {
      setReceivableError(true);
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

  // 处理收款提交（保留：直接绑定合同的旧流程）
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

  // 处理"先记录到账"提交（新流程：无合同，进入待分配池）
  const handleReceiptSubmit = async (data: ReceiptSubmitData) => {
    try {
      await financeService.createPayment({
        type: PaymentType.RECEIVABLE_RECEIPT,
        amount: data.amount,
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        paymentDate: data.paymentDate.toISOString(),
        note: data.note,
      });
      toast.success('到账记录已保存，请前往分配');
      setReceiptDialogOpen(false);
      fetchUnallocated();
    } catch {
      toast.error('记录到账失败');
    }
  };

  // 处理分配提交
  const handleAllocateSubmit = async (
    paymentId: string,
    allocations: { salesContractId: string; amount: number }[]
  ) => {
    try {
      await financeService.allocatePayment(paymentId, allocations);
      toast.success(`已分配 ${allocations.length} 张合同`);
      setAllocateTarget(null);
      invalidateCache('fin-receivables');
      invalidateCache('fin-stats');
      fetchUnallocated();
      fetchReceivables();
      fetchStats();
    } catch {
      toast.error('分配失败，请重试');
    }
  };

  // 获取门店名称（应收列表展示与关键词筛选）
  // 优先使用后端已聚合的 stores 字段，fallback 到 items[].store.name
  const getStoreNames = (contract: ReceivableContract) => {
    if (contract.stores && contract.stores.length > 0) {
      return contract.stores.join(', ');
    }
    const fromItems = contract.items?.map((item) => item.store?.name).filter(Boolean) as string[];
    return fromItems && fromItems.length > 0 ? fromItems.join(', ') : '-';
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
          <div className="flex gap-2">
            <Button size="sm" className="h-10" onClick={() => setReceiptDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> 记录到账
            </Button>
            <Button variant="outline" size="sm" className="h-10" onClick={() => { fetchStats(); fetchPayables(); fetchReceivables(); fetchUnallocated(); }}>
              <RefreshCw className="mr-2 h-4 w-4" /> 刷新
            </Button>
          </div>
        }
      />

      {/* 待分配款项池 */}
      {unallocatedPayments.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-orange-700 dark:text-orange-400">
              <Split className="h-4 w-4" />
              待分配款项（{unallocatedPayments.length} 笔）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unallocatedPayments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-orange-200 bg-background px-3 py-2 dark:border-orange-900"
              >
                <div>
                  <span className="font-semibold text-sm">
                    {p.currency} {p.amount.toLocaleString()}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(p.paymentDate).toLocaleDateString('zh-CN')}
                    {p.note && ` · ${p.note}`}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setAllocateTarget(p)}
                >
                  <Split className="mr-1 h-3 w-3" /> 分配
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
          {/* 移动端卡片视图 */}
          <div className="space-y-3 md:hidden">
            {payableLoading ? (
              <div className="surface-panel py-10 text-center text-sm text-muted-foreground">加载中...</div>
            ) : payableError ? (
              <div className="surface-panel py-10 text-center text-sm text-destructive">
                加载失败 —&nbsp;
                <button className="underline" onClick={() => void fetchPayables()}>重试</button>
              </div>
            ) : unpaidContracts.length === 0 ? (
              <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
                {keyword ? '没有匹配当前关键词的记录' : '暂无待付账款'}
              </div>
            ) : (
              unpaidContracts.map((contract) => (
                <MobileListCard
                  key={contract.id}
                  title={contract.contractNo}
                  subtitle={contract.supplier?.name || '未知供应商'}
                  badge={<Badge variant="outline" className="text-xs">{contract.status}</Badge>}
                  fields={[
                    { label: '总金额', value: `¥${contract.totalAmount.toLocaleString()}` },
                    { label: '已付', value: `¥${contract.paidAmount.toLocaleString()}`, emphasis: 'primary' },
                  ]}
                  amount={{ label: '待付', value: `¥${contract.unpaidAmount.toLocaleString()}`, emphasis: 'danger' }}
                  action={
                    <Button size="sm" className="h-10 w-full rounded-xl" onClick={() => setSelectedPayable(contract)}>
                      <CreditCard className="mr-2 h-4 w-4" /> 记录付款
                    </Button>
                  }
                />
              ))
            )}
          </div>
          {/* 桌面端表格 */}
          <Card className="hidden overflow-hidden md:block">
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
                  <TableStateRow colSpan={7} variant="loading" title="加载中..." />
                ) : payableError ? (
                  <TableStateRow
                    colSpan={7}
                    variant="error"
                    title="数据加载失败"
                    description="应付账款列表暂时不可用，请稍后重试。"
                    action={
                      <Button variant="outline" size="sm" onClick={() => void fetchPayables()}>
                        <RefreshCw className="mr-1 h-4 w-4" />
                        重试
                      </Button>
                    }
                  />
                ) : unpaidContracts.length === 0 ? (
                  <TableStateRow
                    colSpan={7}
                    variant="empty"
                    icon={Search}
                    title="暂无待付账款"
                    description={keyword ? '没有匹配当前关键词的供应商付款记录。' : '当前没有需要处理的供应商付款记录。'}
                  />
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
          {/* 移动端卡片视图 */}
          <div className="space-y-3 md:hidden">
            {receivableLoading ? (
              <div className="surface-panel py-10 text-center text-sm text-muted-foreground">加载中...</div>
            ) : receivableError ? (
              <div className="surface-panel py-10 text-center text-sm text-destructive">
                加载失败 —&nbsp;
                <button className="underline" onClick={() => void fetchReceivables()}>重试</button>
              </div>
            ) : unreceiveContracts.length === 0 ? (
              <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
                {keyword ? '没有匹配当前关键词的记录' : '暂无待收账款'}
              </div>
            ) : (
              unreceiveContracts.map((contract) => (
                <MobileListCard
                  key={contract.id}
                  title={contract.contractNo}
                  subtitle={getStoreNames(contract)}
                  badge={<Badge variant="outline" className="text-xs">{contract.status}</Badge>}
                  fields={[
                    { label: '总金额', value: `$${contract.totalAmount.toLocaleString()}` },
                    { label: '已收', value: `$${contract.receivedAmount.toLocaleString()}`, emphasis: 'primary' },
                  ]}
                  amount={{ label: '待收', value: `$${contract.unreceiveAmount.toLocaleString()}`, emphasis: 'danger' }}
                  action={
                    <Button size="sm" className="h-10 w-full rounded-xl" onClick={() => setSelectedReceivable(contract)}>
                      <CreditCard className="mr-2 h-4 w-4" /> 记录收款
                    </Button>
                  }
                />
              ))
            )}
          </div>
          {/* 桌面端表格 */}
          <Card className="hidden overflow-hidden md:block">
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
                  <TableStateRow colSpan={7} variant="loading" title="加载中..." />
                ) : receivableError ? (
                  <TableStateRow
                    colSpan={7}
                    variant="error"
                    title="数据加载失败"
                    description="应收账款列表暂时不可用，请稍后重试。"
                    action={
                      <Button variant="outline" size="sm" onClick={() => void fetchReceivables()}>
                        <RefreshCw className="mr-1 h-4 w-4" />
                        重试
                      </Button>
                    }
                  />
                ) : unreceiveContracts.length === 0 ? (
                  <TableStateRow
                    colSpan={7}
                    variant="empty"
                    icon={Search}
                    title="暂无待收账款"
                    description={keyword ? '没有匹配当前关键词的门店回款记录。' : '当前没有需要跟进的门店回款记录。'}
                  />
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

      {/* 直接绑合同收款弹窗（保留旧流程） */}
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

      {/* 记录到账弹窗（新流程：先记录，后分配） */}
      <ReceiptDialog
        open={receiptDialogOpen}
        onOpenChange={setReceiptDialogOpen}
        onSubmit={handleReceiptSubmit}
      />

      {/* 分配弹窗 */}
      <AllocateDialog
        open={!!allocateTarget}
        onOpenChange={(open) => !open && setAllocateTarget(null)}
        payment={allocateTarget}
        receivables={receivables}
        onSubmit={handleAllocateSubmit}
      />
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense
      fallback={
        <LoadingState
          title="加载中..."
          description="正在同步收付款视图和筛选状态。"
          className="min-h-[10rem] border-0 bg-transparent"
        />
      }
    >
      <PaymentsPageContent />
    </Suspense>
  );
}
