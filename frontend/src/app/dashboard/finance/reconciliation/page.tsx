/**
 * Input: financeMatchService API
 * Output: 智能关联对账分析页面（三栏：银行流水 / 合同 / 发票）
 * Pos: 财务模块-智能关联对账分析子页面
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ModuleTabHeader, FINANCE_TABS } from '@/components/layout/ModuleTabHeader';
import { ErrorState } from '@/components/ui/data-state';
import { PageSizeSelect } from '@/components/ui/page-size-select';
import { clearApiGetCache } from '@/lib/axios';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search, RefreshCw, AlertTriangle, FileWarning,
  Landmark, FileText, Zap, Link2, Unlink, EyeOff,
  ArrowRightLeft, Package, Ship,
} from 'lucide-react';
import {
  getFullReconciliation,
  getUnmatchedItems,
  postAutoMatch,
  postManualMatch,
  postIgnore,
  getContractsForMatch,
  type FullReconciliationResult,
  type BankTransaction,
  type InvoiceRecord,
  type ContractForMatch,
  type PurchaseContractForMatch,
} from '@/services/bankFlow.service';

function fmt(n: number) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function isPurchaseContract(c: ContractForMatch): c is PurchaseContractForMatch {
  return 'supplier' in c;
}

function contractLabel(c: ContractForMatch): string {
  if (isPurchaseContract(c)) {
    return c.supplier?.name || c.contractNo;
  }
  const stores = Array.from(new Set(c.packingItems?.map(p => p.store?.name).filter(Boolean)));
  return stores.length > 0 ? stores.join(', ') : (c.port?.name || c.contractNo);
}

function contractUnpaid(c: ContractForMatch): number {
  if (isPurchaseContract(c)) {
    return Math.max(c.totalAmount - (c.paidAmount || 0), 0);
  }
  return Math.max(c.totalAmount - (c.receivedAmount || 0), 0);
}

export default function ReconciliationPage() {
  // ========== 原有对账分析数据 ==========
  const [reconData, setReconData] = useState<FullReconciliationResult | null>(null);
  const [reconLoading, setReconLoading] = useState(true);
  const [tab, setTab] = useState('analysis');
  const [reconError, setReconError] = useState(false);
  const [unmatchedError, setUnmatchedError] = useState(false);
  const [contractsError, setContractsError] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');

  // ========== 智能关联数据 ==========
  const [bankItems, setBankItems] = useState<BankTransaction[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceRecord[]>([]);
  const [bankTotal, setBankTotal] = useState(0);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [matchLoading, setMatchLoading] = useState(false);

  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);

  const [contractType, setContractType] = useState<'PURCHASE' | 'SALES'>('PURCHASE');
  const [contractSearch, setContractSearch] = useState('');
  const [contracts, setContracts] = useState<ContractForMatch[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);

  const loadRecon = useCallback(async () => {
    setReconLoading(true);
    setReconError(false);
    try {
      const result = await getFullReconciliation();
      setReconData(result);
    } catch { setReconError(true); } finally { setReconLoading(false); }
  }, []);

  const loadUnmatched = useCallback(async () => {
    setUnmatchedError(false);
    try {
      const result = await getUnmatchedItems({ page, pageSize, search: search || undefined });
      setBankItems(result.bankItems);
      setInvoiceItems(result.invoiceItems);
      setBankTotal(result.bankTotal);
      setInvoiceTotal(result.invoiceTotal);
    } catch { setUnmatchedError(true); }
  }, [page, pageSize, search]);

  const loadContracts = useCallback(async () => {
    setContractsLoading(true);
    setContractsError(false);
    try {
      const list = await getContractsForMatch(contractType, contractSearch || undefined);
      setContracts(list);
    } catch { setContractsError(true); } finally { setContractsLoading(false); }
  }, [contractType, contractSearch]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadRecon(), loadUnmatched()]);
  }, [loadRecon, loadUnmatched]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadContracts(); }, [loadContracts]);

  const selectedBank = bankItems.find(b => b.id === selectedBankId);
  const selectedInvoice = invoiceItems.find(i => i.id === selectedInvoiceId);
  const selectedContract = contracts.find(c => c.id === selectedContractId);
  const hasSelection = !!(selectedBank || selectedInvoice);
  const canLink = hasSelection && !!selectedContract;

  const handleAutoMatch = async () => {
    setMatchLoading(true);
    try {
      await postAutoMatch();
      await loadAll();
    } catch { toast.error('对账操作失败，请重试'); } finally { setMatchLoading(false); }
  };

  const handleLink = async () => {
    if (!canLink) return;
    const entityType = selectedBank ? 'BANK' : 'INVOICE';
    const entityId = selectedBank ? selectedBank.id : selectedInvoice!.id;
    try {
      await postManualMatch({
        entityType,
        entityId,
        contractId: selectedContract!.id,
        contractType,
      });
      setSelectedBankId(null);
      setSelectedInvoiceId(null);
      setSelectedContractId(null);
      await loadUnmatched();
      await loadRecon();
    } catch { toast.error('对账操作失败，请重试'); }
  };

  const handleIgnore = async (entityType: 'BANK' | 'INVOICE', entityId: string) => {
    try {
      await postIgnore({ entityType, entityId });
      if (entityType === 'BANK' && selectedBankId === entityId) setSelectedBankId(null);
      if (entityType === 'INVOICE' && selectedInvoiceId === entityId) setSelectedInvoiceId(null);
      await loadUnmatched();
    } catch { toast.error('对账操作失败，请重试'); }
  };

  const s = reconError ? undefined : reconData?.summary;

  return (
    <div className="space-y-4">
      <ModuleTabHeader tabs={FINANCE_TABS} />

      {(reconError || unmatchedError || contractsError) && <ErrorState title="对账数据读取失败" description="汇总、未匹配项或合同列表尚未更新。" action={<Button variant="outline" onClick={() => { clearApiGetCache(); void loadAll(); void loadContracts(); }}>重试</Button>} />}
      <div className="px-1 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="max-w-sm" value={search} placeholder="搜索未匹配对手方、发票号或摘要" onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
          {search && <Button variant="ghost" onClick={() => { setSearch(''); setPage(1); }}>重置</Button>}
          <PageSizeSelect value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} />
          <span className="text-xs text-muted-foreground">银行 {bankTotal} 条 / 发票 {invoiceTotal} 条，第 {page} 页</span>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
          <Button variant="outline" size="sm" disabled={page * pageSize >= Math.max(bankTotal, invoiceTotal)} onClick={() => setPage(page + 1)}>下一页</Button>
        </div>
        {/* 操作栏 */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">对账分析</h2>
            <p className="text-xs text-muted-foreground">银行流水与发票自动匹配 + 合同智能关联引擎</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { clearApiGetCache(); void loadAll(); }} disabled={matchLoading || reconLoading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${(matchLoading || reconLoading) ? 'animate-spin' : ''}`} />刷新
            </Button>
            <Button size="sm" onClick={handleAutoMatch} disabled={matchLoading}>
              <Zap className="h-4 w-4 mr-1" />自动匹配
            </Button>
          </div>
        </div>

        {/* 汇总卡片 */}
        {s && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">已匹配供应商</p>
                <p className="text-lg font-bold">{s.matchedCount}</p>
                <p className="text-[10px] text-muted-foreground">其中正常 {s.normalCount} 家</p>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50/30 dark:bg-red-950/10">
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">缺票供应商</p>
                <p className="text-lg font-bold text-red-600">{s.underInvoicedCount}</p>
                <p className="text-[10px] text-red-600">缺票总额 ¥{fmt(s.underInvoicedGap)}</p>
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/10">
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">多开票供应商</p>
                <p className="text-lg font-bold text-amber-600">{s.overInvoicedCount}</p>
                <p className="text-[10px] text-amber-600">多开总额 ¥{fmt(s.overInvoicedGap)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">未匹配流水</p>
                <p className="text-lg font-bold">{bankTotal}</p>
                <p className="text-[10px] text-muted-foreground">待人工核对</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">未匹配发票</p>
                <p className="text-lg font-bold">{invoiceTotal}</p>
                <p className="text-[10px] text-muted-foreground">待人工核对</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 选中操作栏 */}
        {hasSelection && (
          <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/50 rounded-lg border">
            <span className="text-sm">
              已选：
              {selectedBank && <span className="font-medium">流水 {selectedBank.counterpart}</span>}
              {selectedInvoice && <span className="font-medium">发票 {selectedInvoice.seller}</span>}
              {selectedContract && (
                <>
                  <ArrowRightLeft className="inline h-3 w-3 mx-1 text-muted-foreground" />
                  <span className="font-medium">{contractType === 'PURCHASE' ? '采购' : '销售'}合同 {contractLabel(selectedContract)}</span>
                </>
              )}
            </span>
            <div className="flex-1" />
            <Button size="sm" variant="default" disabled={!canLink} onClick={handleLink}>
              <Link2 className="h-4 w-4 mr-1" />确认关联
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setSelectedBankId(null); setSelectedInvoiceId(null); }}>
              <Unlink className="h-4 w-4 mr-1" />取消选择
            </Button>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="analysis" className="text-xs">对账分析</TabsTrigger>
            <TabsTrigger value="match" className="text-xs">智能关联</TabsTrigger>
          </TabsList>

          {/* 原有对账分析 Tab */}
          <TabsContent value="analysis">
            {reconLoading ? (
              <Card><CardContent className="py-16 text-center text-muted-foreground">正在分析数据...</CardContent></Card>
            ) : reconError ? (<p className="py-8 text-center text-destructive">汇总读取失败，请重试</p>) : !reconData ? (
              <Card><CardContent className="py-16 text-center text-muted-foreground">暂无数据</CardContent></Card>
            ) : (
              <ReconciliationAnalysisView data={reconData} />
            )}
          </TabsContent>

          {/* 智能关联 Tab */}
          <TabsContent value="match">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* 左：未匹配银行流水 */}
              <Card className="flex flex-col max-h-[70vh]">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-blue-500" />
                    <CardTitle className="text-sm">未匹配银行流水</CardTitle>
                    <Badge variant="secondary" className="text-[10px]">{bankTotal}</Badge>
                  </div>
                </CardHeader>
                <div className="flex-1 overflow-auto px-4 pb-4">
                  {unmatchedError ? (<p className="text-sm text-destructive">未匹配流水读取失败</p>) : bankItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">暂无未匹配流水</p>
                  ) : (
                    <div className="space-y-2">
                      {bankItems.map(txn => (
                        <div
                          key={txn.id}
                          className={`p-2 rounded-md border cursor-pointer transition-colors ${
                            selectedBankId === txn.id
                              ? 'border-primary bg-primary/5 ring-1 ring-primary'
                              : 'border-border hover:bg-accent'
                          }`}
                          onClick={() => {
                            setSelectedBankId(prev => prev === txn.id ? null : txn.id);
                            setSelectedInvoiceId(null);
                            setContractType(txn.direction === 'OUT' ? 'PURCHASE' : 'SALES');
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium truncate max-w-[140px]">{txn.counterpart || '-'}</span>
                            <span className={`text-sm font-bold tabular-nums ${txn.direction === 'OUT' ? 'text-red-600' : 'text-green-600'}`}>
                              {txn.direction === 'OUT' ? '-' : '+'}¥{fmt(Math.abs(txn.amount))}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-muted-foreground">{txn.txnDate}</span>
                            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{txn.summary || ''}</span>
                          </div>
                          <div className="flex justify-end gap-1 mt-1">
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1" onClick={(e) => { e.stopPropagation(); handleIgnore('BANK', txn.id); }}>
                              <EyeOff className="h-3 w-3 mr-0.5" />忽略
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              {/* 中：合同列表 */}
              <Card className="flex flex-col max-h-[70vh]">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    {contractType === 'PURCHASE' ? <Package className="h-4 w-4 text-orange-500" /> : <Ship className="h-4 w-4 text-teal-500" />}
                    <CardTitle className="text-sm">合同列表</CardTitle>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex rounded-md border overflow-hidden">
                      <button
                        className={`px-2 py-1 text-xs ${contractType === 'PURCHASE' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                        onClick={() => setContractType('PURCHASE')}
                      >采购</button>
                      <button
                        className={`px-2 py-1 text-xs ${contractType === 'SALES' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                        onClick={() => setContractType('SALES')}
                      >销售</button>
                    </div>
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground" />
                      <Input
                        placeholder="搜索合同或客户"
                        value={contractSearch}
                        onChange={e => setContractSearch(e.target.value)}
                        className="pl-6 h-7 text-xs"
                      />
                    </div>
                  </div>
                </CardHeader>
                <div className="flex-1 overflow-auto px-4 pb-4">
                  {contractsLoading ? (
                    <p className="text-sm text-muted-foreground text-center py-8">加载中...</p>
                  ) : contracts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">无合同数据</p>
                  ) : (
                    <div className="space-y-2">
                      {contracts.map(c => (
                        <div
                          key={c.id}
                          className={`p-2 rounded-md border cursor-pointer transition-colors ${
                            selectedContractId === c.id
                              ? 'border-primary bg-primary/5 ring-1 ring-primary'
                              : 'border-border hover:bg-accent'
                          }`}
                          onClick={() => setSelectedContractId(prev => prev === c.id ? null : c.id)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{c.contractNo}</span>
                            <Badge variant="outline" className="text-[10px]">{contractType === 'PURCHASE' ? '采购' : '销售'}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">{contractLabel(c)}</div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-muted-foreground">总额 ¥{fmt(c.totalAmount)}</span>
                            <span className="text-[10px] font-medium text-orange-600">未收/付 ¥{fmt(contractUnpaid(c))}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              {/* 右：未匹配发票 */}
              <Card className="flex flex-col max-h-[70vh]">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-violet-500" />
                    <CardTitle className="text-sm">未匹配发票</CardTitle>
                    <Badge variant="secondary" className="text-[10px]">{invoiceTotal}</Badge>
                  </div>
                </CardHeader>
                <div className="flex-1 overflow-auto px-4 pb-4">
                  {unmatchedError ? (<p className="text-sm text-destructive">未匹配发票读取失败</p>) : invoiceItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">暂无未匹配发票</p>
                  ) : (
                    <div className="space-y-2">
                      {invoiceItems.map(inv => (
                        <div
                          key={inv.id}
                          className={`p-2 rounded-md border cursor-pointer transition-colors ${
                            selectedInvoiceId === inv.id
                              ? 'border-primary bg-primary/5 ring-1 ring-primary'
                              : 'border-border hover:bg-accent'
                          }`}
                          onClick={() => {
                            setSelectedInvoiceId(prev => prev === inv.id ? null : inv.id);
                            setSelectedBankId(null);
                            setContractType('PURCHASE');
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium truncate max-w-[140px]">{inv.seller}</span>
                            <span className="text-sm font-bold tabular-nums">¥{fmt(inv.total)}</span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-muted-foreground">{inv.invDate}</span>
                            <span className="text-[10px] text-muted-foreground">{inv.invNo || '-'}</span>
                          </div>
                          <div className="flex justify-end gap-1 mt-1">
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1" onClick={(e) => { e.stopPropagation(); handleIgnore('INVOICE', inv.id); }}>
                              <EyeOff className="h-3 w-3 mr-0.5" />忽略
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ========== 原有对账分析视图（提取为子组件，保持功能完整）==========

function ReconciliationAnalysisView({ data }: { data: FullReconciliationResult }) {
  const [search, setSearch] = useState('');
  const q = search.toLowerCase().trim();

  const filteredMatched = data.matched.filter(m =>
    !q || m.payName.toLowerCase().includes(q) || (m.invName || '').toLowerCase().includes(q)
  );
  const filteredUnmatchedPay = data.unmatchedPayments.filter(p => !q || p.counterpart.toLowerCase().includes(q));
  const filteredUnmatchedInv = data.unmatchedInvoices.filter(i => !q || i.seller.toLowerCase().includes(q));

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索供应商名称"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      <div className="space-y-4">
        {/* 已匹配供应商 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">已匹配供应商 ({filteredMatched.length})</CardTitle></CardHeader>
          <div className="overflow-x-auto px-4 pb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>供应商</TableHead>
                  <TableHead className="text-right">净付款</TableHead>
                  <TableHead className="text-right">有效发票</TableHead>
                  <TableHead className="text-right">差额</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMatched.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">暂无匹配数据</TableCell></TableRow>
                ) : filteredMatched.map(m => (
                  <TableRow key={m.payName} className={m.category === 'under_invoiced' ? 'bg-red-50/30 dark:bg-red-950/5' : m.category === 'over_invoiced' ? 'bg-amber-50/30 dark:bg-amber-950/5' : ''}>
                    <TableCell className="max-w-[200px]">
                      <span className="text-sm font-medium truncate block">{m.payName}</span>
                      {m.invName && <span className="text-[10px] text-muted-foreground">发票名: {m.invName}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmt(m.netPaid)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(m.totalInvoice)}</TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${m.gap > 0 ? 'text-red-600' : m.gap < 0 ? 'text-amber-600' : ''}`}>
                      {m.gap > 0 ? '+' : ''}{fmt(m.gap)}
                    </TableCell>
                    <TableCell>
                      {m.category === 'under_invoiced' ? (
                        <Badge variant="destructive" className="text-[10px]">缺票 ¥{fmt(m.gap)}</Badge>
                      ) : m.category === 'over_invoiced' ? (
                        <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500">多开 ¥{fmt(Math.abs(m.gap))}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-600 border-green-200 text-[10px]">已匹配</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                          <Link href={`/dashboard/finance/bank-flow?search=${encodeURIComponent(m.payName)}`}><Landmark className="h-3.5 w-3.5" /></Link>
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                          <Link href={`/dashboard/finance/invoices?search=${encodeURIComponent(m.invName || m.payName)}`}><FileText className="h-3.5 w-3.5" /></Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* 无票付款 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <FileWarning className="h-4 w-4 text-red-500" />
              <CardTitle className="text-sm">无票付款 ({filteredUnmatchedPay.length})</CardTitle>
            </div>
          </CardHeader>
          <div className="overflow-x-auto px-4 pb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>付款对方</TableHead>
                  <TableHead className="text-right">净付款</TableHead>
                  <TableHead className="text-right">交易笔数</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUnmatchedPay.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">暂无数据</TableCell></TableRow>
                ) : filteredUnmatchedPay.map(p => (
                  <TableRow key={p.counterpart}>
                    <TableCell className="font-medium">{p.counterpart}</TableCell>
                    <TableCell className="text-right tabular-nums text-red-600 font-medium">{fmt(p.netPaid)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{p.txnCount}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                        <Link href={`/dashboard/finance/bank-flow?search=${encodeURIComponent(p.counterpart)}`}><Landmark className="h-3.5 w-3.5" /></Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* 无流水发票 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-sm">无流水发票 ({filteredUnmatchedInv.length})</CardTitle>
            </div>
          </CardHeader>
          <div className="overflow-x-auto px-4 pb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>发票销方</TableHead>
                  <TableHead className="text-right">有效发票金额</TableHead>
                  <TableHead className="text-right">发票张数</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUnmatchedInv.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">暂无数据</TableCell></TableRow>
                ) : filteredUnmatchedInv.map(i => (
                  <TableRow key={i.seller}>
                    <TableCell className="font-medium">{i.seller}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmt(i.totalInvoice)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{i.invCount}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                        <Link href={`/dashboard/finance/invoices?search=${encodeURIComponent(i.seller)}`}><FileText className="h-3.5 w-3.5" /></Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}
