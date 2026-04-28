/**
 * Input: bank-flow/reconciliation/full API
 * Output: 对账分析页面（银行流水 vs 发票按供应商汇总匹配展示；各表支持列排序）
 * Pos: 财务模块-对账分析子页面
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useTableSort } from '@/lib/hooks/useTableSort';
import Link from 'next/link';
import { ModuleTabHeader, FINANCE_TABS } from '@/components/layout/ModuleTabHeader';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search, RefreshCw, AlertTriangle, FileWarning,
  Landmark, FileText,
} from 'lucide-react';
import {
  getFullReconciliation,
  type FullReconciliationResult, type MatchedEntry,
  type UnmatchedPayment, type UnmatchedInvoice,
} from '@/services/bankFlow.service';

function fmt(n: number) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function GapBadge({ gap, category }: { gap: number; category: string }) {
  if (category === 'under_invoiced') {
    return <Badge variant="destructive" className="text-[10px]">缺票 ¥{fmt(gap)}</Badge>;
  }
  if (category === 'over_invoiced') {
    return <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500">多开 ¥{fmt(Math.abs(gap))}</Badge>;
  }
  return <Badge variant="outline" className="text-green-600 border-green-200 text-[10px]">已匹配</Badge>;
}

export default function ReconciliationPage() {
  const [data, setData] = useState<FullReconciliationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('matched');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getFullReconciliation();
      setData(result);
    } catch { /* */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const q = search.toLowerCase().trim();

  const filteredMatched: MatchedEntry[] = data
    ? data.matched.filter(m =>
      !q || m.payName.toLowerCase().includes(q) || (m.invName || '').toLowerCase().includes(q)
    )
    : [];

  const filteredUnmatchedPay: UnmatchedPayment[] = data
    ? data.unmatchedPayments.filter(p => !q || p.counterpart.toLowerCase().includes(q))
    : [];

  const filteredUnmatchedInv: UnmatchedInvoice[] = data
    ? data.unmatchedInvoices.filter(i => !q || i.seller.toLowerCase().includes(q))
    : [];

  const matchedSort = useTableSort<MatchedEntry, string>(
    filteredMatched,
    useCallback((item, key) => {
      switch (key) {
        case 'payName':
          return item.payName;
        case 'netPaid':
          return item.netPaid;
        case 'totalInvoice':
          return item.totalInvoice;
        case 'gap':
          return item.gap;
        case 'txnCount':
          return item.txnCount;
        case 'invCount':
          return item.invCount;
        default:
          return null;
      }
    }, [])
  );

  const unmatchedPaySort = useTableSort<UnmatchedPayment, string>(
    filteredUnmatchedPay,
    useCallback((item, key) => {
      switch (key) {
        case 'counterpart':
          return item.counterpart;
        case 'netPaid':
          return item.netPaid;
        case 'txnCount':
          return item.txnCount;
        default:
          return null;
      }
    }, [])
  );

  const unmatchedInvSort = useTableSort<UnmatchedInvoice, string>(
    filteredUnmatchedInv,
    useCallback((item, key) => {
      switch (key) {
        case 'seller':
          return item.seller;
        case 'totalInvoice':
          return item.totalInvoice;
        case 'invCount':
          return item.invCount;
        default:
          return null;
      }
    }, [])
  );

  const s = data?.summary;

  return (
    <div className="space-y-4">
      <ModuleTabHeader tabs={FINANCE_TABS} />

      <div className="px-1">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">对账分析</h2>
            <p className="text-xs text-muted-foreground">银行流水与发票按供应商自动匹配，识别缺票、多开票和未关联记录</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />刷新
          </Button>
        </div>

        {/* 汇总卡片 */}
        {s && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
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
                <p className="text-xs text-muted-foreground mb-1">无票付款</p>
                <p className="text-lg font-bold">{s.unmatchedPaymentCount}</p>
                <p className="text-[10px] text-muted-foreground">合计 ¥{fmt(s.unmatchedPaymentTotal)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">无流水发票</p>
                <p className="text-lg font-bold">{s.unmatchedInvoiceCount}</p>
                <p className="text-[10px] text-muted-foreground">合计 ¥{fmt(s.unmatchedInvoiceTotal)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 搜索 */}
        <div className="relative max-w-sm mb-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索供应商名称"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        {loading ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">正在分析数据...</CardContent></Card>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-3">
              <TabsTrigger value="matched" className="text-xs">
                已匹配 ({filteredMatched.length})
              </TabsTrigger>
              <TabsTrigger value="unmatched_pay" className="text-xs">
                无票付款 ({filteredUnmatchedPay.length})
              </TabsTrigger>
              <TabsTrigger value="unmatched_inv" className="text-xs">
                无流水发票 ({filteredUnmatchedInv.length})
              </TabsTrigger>
            </TabsList>

            {/* 已匹配供应商 */}
            <TabsContent value="matched">
              <Card>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHead
                          sortKey="payName"
                          currentSortKey={matchedSort.sortKey}
                          currentSortDir={matchedSort.sortDir}
                          onSort={matchedSort.onSort}
                        >
                          供应商
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="netPaid"
                          currentSortKey={matchedSort.sortKey}
                          currentSortDir={matchedSort.sortDir}
                          onSort={matchedSort.onSort}
                          className="text-right"
                        >
                          净付款
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="totalInvoice"
                          currentSortKey={matchedSort.sortKey}
                          currentSortDir={matchedSort.sortDir}
                          onSort={matchedSort.onSort}
                          className="text-right"
                        >
                          有效发票
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="gap"
                          currentSortKey={matchedSort.sortKey}
                          currentSortDir={matchedSort.sortDir}
                          onSort={matchedSort.onSort}
                          className="text-right"
                        >
                          差额
                        </SortableTableHead>
                        <TableHead>状态</TableHead>
                        <SortableTableHead
                          sortKey="txnCount"
                          currentSortKey={matchedSort.sortKey}
                          currentSortDir={matchedSort.sortDir}
                          onSort={matchedSort.onSort}
                          className="text-right w-[60px]"
                        >
                          流水
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="invCount"
                          currentSortKey={matchedSort.sortKey}
                          currentSortDir={matchedSort.sortDir}
                          onSort={matchedSort.onSort}
                          className="text-right w-[60px]"
                        >
                          发票
                        </SortableTableHead>
                        <TableHead className="w-[80px]">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMatched.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">暂无匹配数据</TableCell></TableRow>
                      ) : matchedSort.sortedData.map(m => (
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
                          <TableCell><GapBadge gap={m.gap} category={m.category} /></TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{m.txnCount}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{m.invCount}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                                <Link href={`/dashboard/finance/bank-flow?search=${encodeURIComponent(m.payName)}`} title="查看流水">
                                  <Landmark className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                                <Link href={`/dashboard/finance/invoices?search=${encodeURIComponent(m.invName || m.payName)}`} title="查看发票">
                                  <FileText className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>

            {/* 无票付款 */}
            <TabsContent value="unmatched_pay">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <FileWarning className="h-4 w-4 text-red-500" />
                    <CardTitle className="text-sm">只有付款、没有对应发票的支出</CardTitle>
                  </div>
                  <CardDescription className="text-xs">这些付款对方在发票记录中未找到匹配的销方</CardDescription>
                </CardHeader>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHead
                          sortKey="counterpart"
                          currentSortKey={unmatchedPaySort.sortKey}
                          currentSortDir={unmatchedPaySort.sortDir}
                          onSort={unmatchedPaySort.onSort}
                        >
                          付款对方
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="netPaid"
                          currentSortKey={unmatchedPaySort.sortKey}
                          currentSortDir={unmatchedPaySort.sortDir}
                          onSort={unmatchedPaySort.onSort}
                          className="text-right"
                        >
                          净付款
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="txnCount"
                          currentSortKey={unmatchedPaySort.sortKey}
                          currentSortDir={unmatchedPaySort.sortDir}
                          onSort={unmatchedPaySort.onSort}
                          className="text-right"
                        >
                          交易笔数
                        </SortableTableHead>
                        <TableHead className="w-[80px]">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUnmatchedPay.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">暂无数据</TableCell></TableRow>
                      ) : unmatchedPaySort.sortedData.map(p => (
                        <TableRow key={p.counterpart}>
                          <TableCell className="font-medium">{p.counterpart}</TableCell>
                          <TableCell className="text-right tabular-nums text-red-600 font-medium">{fmt(p.netPaid)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{p.txnCount}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                              <Link href={`/dashboard/finance/bank-flow?search=${encodeURIComponent(p.counterpart)}`} title="查看流水">
                                <Landmark className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>

            {/* 无流水发票 */}
            <TabsContent value="unmatched_inv">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <CardTitle className="text-sm">有发票但未找到对应银行流水</CardTitle>
                  </div>
                  <CardDescription className="text-xs">可能为个人垫付、跨年结算或名称不匹配导致</CardDescription>
                </CardHeader>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHead
                          sortKey="seller"
                          currentSortKey={unmatchedInvSort.sortKey}
                          currentSortDir={unmatchedInvSort.sortDir}
                          onSort={unmatchedInvSort.onSort}
                        >
                          发票销方
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="totalInvoice"
                          currentSortKey={unmatchedInvSort.sortKey}
                          currentSortDir={unmatchedInvSort.sortDir}
                          onSort={unmatchedInvSort.onSort}
                          className="text-right"
                        >
                          有效发票金额
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="invCount"
                          currentSortKey={unmatchedInvSort.sortKey}
                          currentSortDir={unmatchedInvSort.sortDir}
                          onSort={unmatchedInvSort.onSort}
                          className="text-right"
                        >
                          发票张数
                        </SortableTableHead>
                        <TableHead className="w-[80px]">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUnmatchedInv.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">暂无数据</TableCell></TableRow>
                      ) : unmatchedInvSort.sortedData.map(i => (
                        <TableRow key={i.seller}>
                          <TableCell className="font-medium">{i.seller}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(i.totalInvoice)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{i.invCount}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                              <Link href={`/dashboard/finance/invoices?search=${encodeURIComponent(i.seller)}`} title="查看发票">
                                <FileText className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
