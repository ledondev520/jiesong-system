/**
 * Input: 银行流水 API
 * Output: 手机合计栏自动换行、银行流水查询页面（表头可排序：日期、金额、对方名称）
 * Pos: 财务模块-银行流水子页面
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useTableSort } from '@/lib/hooks/useTableSort';
import { useSearchParams } from 'next/navigation';
import { ModuleTabHeader, FINANCE_TABS } from '@/components/layout/ModuleTabHeader';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ArrowDownLeft, ArrowUpRight, Search, X, ChevronLeft, ChevronRight, FileText, Upload } from 'lucide-react';
import Link from 'next/link';
import {
  getTransactions, getTransactionStats, getBatches,
  type BankTransaction, type BankFlowStats, type FinanceDataBatch,
} from '@/services/bankFlow.service';
import { ErrorState } from '@/components/ui/data-state';
import { clearApiGetCache } from '@/lib/axios';
import { PageSizeSelect } from '@/components/ui/page-size-select';
import { PaymentListCard } from '@/components/finance/PaymentListCard';
import { BankFlowImportDialog } from './components/BankFlowImportDialog';

function fmt(n: number) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function BankFlowPage() {
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get('search') || '';

  const [items, setItems] = useState<BankTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState(urlSearch);
  const [direction, setDirection] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [loadError, setLoadError] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [stats, setStats] = useState<BankFlowStats | null>(null);
  const [batches, setBatches] = useState<FinanceDataBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [txnRes, statsRes, batchRes] = await Promise.all([
        getTransactions({ page, pageSize, search: search || undefined, direction: direction || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, currency, amountMin: amountMin ? Number(amountMin) : undefined, amountMax: amountMax ? Number(amountMax) : undefined }),
        getTransactionStats({ search: search || undefined, direction: direction || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, currency, amountMin: amountMin ? Number(amountMin) : undefined, amountMax: amountMax ? Number(amountMax) : undefined }),
        getBatches('BANK_FLOW'),
      ]);
      setItems(txnRes.items || []);
      setTotal(txnRes.pagination?.total || 0);
      setStats(statsRes);
      setBatches(batchRes || []);
    } catch { setLoadError(true); } finally { setLoading(false); }
  }, [page, pageSize, search, direction, dateFrom, dateTo, currency, amountMin, amountMax]);

  useEffect(() => { loadData(); }, [loadData]);

  const sort = useTableSort<BankTransaction, string>(
    items,
    useCallback((item, key) => {
      switch (key) {
        case 'txnDate':
          return item.txnDate;
        case 'amount':
          return Math.abs(item.amount);
        case 'counterpart':
          return item.counterpart ?? '';
        case 'summary':
          return item.summary ?? '';
        case 'txnType':
          return item.txnType ?? '';
        default:
          return null;
      }
    }, [])
  );

  const filteredByAmount = sort.sortedData;

  const totalPages = Math.ceil(total / pageSize);

  const resetFilters = () => {
    setSearch(''); setDirection(''); setDateFrom(''); setDateTo(''); setAmountMin(''); setAmountMax(''); setCurrency('CNY'); setPage(1);
  };

  const hasFilters = search || direction || dateFrom || dateTo || amountMin || amountMax;

  return (
    <div className="space-y-4">
      <ModuleTabHeader tabs={FINANCE_TABS} />

      {loadError && <ErrorState title="银行流水读取失败" description="当前明细和统计未更新，请重试。" action={<Button variant="outline" onClick={() => { clearApiGetCache(); void loadData(); }}>重试</Button>} />}
      <div className="px-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Select value={currency} onValueChange={(value) => { setCurrency(value); setPage(1); }}><SelectTrigger className="w-28" aria-label="币种"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CNY">CNY 人民币</SelectItem><SelectItem value="USD">USD 美元</SelectItem></SelectContent></Select>
          <PageSizeSelect value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} />
          <span className="text-xs text-muted-foreground">金额与汇总币种：{currency}；表头为本页排序</span>
        </div>
        {/* KPI */}
        {stats && !loadError && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">总收入</p>
                <p className="text-lg font-bold text-emerald-600">{fmt(stats.totalIn)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">总支出</p>
                <p className="text-lg font-bold text-red-600">{fmt(stats.totalOut)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">净现金流</p>
                <p className={`text-lg font-bold ${stats.netFlow >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(stats.netFlow)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-1">交易笔数</p>
                <p className="text-lg font-bold">{stats.txnCount.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 导入批次信息 */}
        {batches.length > 0 && (
          <div className="text-xs text-muted-foreground mb-3">
            数据来源：{batches.map(b => (
              <span key={b.id} className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-1 mr-3">
                <Badge variant="outline" className="max-w-full whitespace-normal break-all text-[10px]">{b.fileName}</Badge>
                {b.dataStartDate}~{b.dataEndDate}
                ・导入于 {new Date(b.importedAt).toLocaleDateString('zh-CN')}
              </span>
            ))}
          </div>
        )}

        {/* 筛选栏 */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索对方名称 / 摘要 / 流水号"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 h-9"
            />
          </div>
          <Select value={direction} onValueChange={v => { setDirection(v === 'ALL' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-[100px] h-9"><SelectValue placeholder="方向" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部</SelectItem>
              <SelectItem value="IN">收入</SelectItem>
              <SelectItem value="OUT">支出</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="w-[140px] h-9" />
          <span className="text-muted-foreground text-sm">~</span>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="w-[140px] h-9" />
          <Input
            type="number"
            placeholder="最小金额"
            value={amountMin}
            onChange={e => { setAmountMin(e.target.value); setPage(1); }}
            className="w-[100px] h-9"
          />
          <span className="text-muted-foreground text-sm">-</span>
          <Input
            type="number"
            placeholder="最大金额"
            value={amountMax}
            onChange={e => { setAmountMax(e.target.value); setPage(1); }}
            className="w-[100px] h-9"
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="h-3 w-3 mr-1" />清除
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-3 w-3 mr-1" />导入
          </Button>
        </div>

        {/* 移动端卡片视图 */}
        <div className="space-y-2 md:hidden mb-4">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">加载中...</div>
          ) : loadError ? (<p className="py-8 text-center text-destructive">读取失败，请使用上方重试</p>) : filteredByAmount.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {hasFilters ? '没有匹配当前筛选条件的记录' : '暂无数据'}
            </div>
          ) : (
            filteredByAmount.map(item => (
              <PaymentListCard
                key={item.id}
                direction={item.direction === 'IN' ? 'IN' : 'OUT'}
                amount={Math.abs(item.amount)}
                currency={`${item.currency} `}
                date={item.txnDate}
                counterpart={item.counterpart || undefined}
                summary={item.summary || undefined}
                txnType={item.txnType || undefined}
              />
            ))
          )}
        </div>

        {/* 桌面端表格 */}
        <Card className="hidden md:block">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    sortKey="txnDate"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                    className="w-[100px]"
                  >
                    日期
                  </SortableTableHead>
                  <TableHead className="w-[60px]">方向</TableHead>
                  <SortableTableHead
                    sortKey="amount"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                    className="text-right w-[120px]"
                  >
                    金额
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="counterpart"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                  >
                    对方名称
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="summary"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                  >
                    摘要
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="txnType"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                  >
                    交易类型
                  </SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
                ) : loadError ? (<TableRow><TableCell colSpan={6} className="text-center py-8 text-destructive">读取失败，请重试</TableCell></TableRow>) : filteredByAmount.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{hasFilters ? '没有匹配当前筛选条件的记录' : '暂无数据'}</TableCell></TableRow>
                ) : filteredByAmount.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs tabular-nums">{item.txnDate}</TableCell>
                    <TableCell>
                      {item.direction === 'IN'
                        ? <Badge variant="outline" className="text-emerald-600 border-emerald-200 text-[10px]"><ArrowDownLeft className="h-3 w-3 mr-0.5" />收</Badge>
                        : <Badge variant="outline" className="text-red-600 border-red-200 text-[10px]"><ArrowUpRight className="h-3 w-3 mr-0.5" />付</Badge>}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${item.direction === 'IN' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {item.currency} {item.direction === 'IN' ? '+' : '-'}{fmt(Math.abs(item.amount))}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {item.counterpart ? (
                        <span className="flex items-center gap-1 group">
                          <button
                            className="truncate text-left hover:text-primary hover:underline underline-offset-2 transition-colors"
                            onClick={() => { setSearch(item.counterpart || ''); setPage(1); }}
                            title={`筛选"${item.counterpart}"`}
                          >
                            {item.counterpart}
                          </button>
                          <Link
                            href={`/dashboard/finance/invoices?search=${encodeURIComponent(item.counterpart)}`}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                            title="查看相关发票"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </Link>
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">{item.summary || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.txnType || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* 合计栏 */}
        {stats && !loadError && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="text-muted-foreground">本页合计</span>
              <span className="font-semibold text-emerald-600">
                收 {currency} {fmt(filteredByAmount.filter(i => i.direction === 'IN').reduce((s, i) => s + Math.abs(i.amount), 0))}
              </span>
              <span className="font-semibold text-red-600">
                付 {currency} {fmt(filteredByAmount.filter(i => i.direction === 'OUT').reduce((s, i) => s + Math.abs(i.amount), 0))}
              </span>
              <span className="font-semibold text-foreground">
                净 {currency} {fmt(
                  filteredByAmount.filter(i => i.direction === 'IN').reduce((s, i) => s + Math.abs(i.amount), 0) -
                  filteredByAmount.filter(i => i.direction === 'OUT').reduce((s, i) => s + Math.abs(i.amount), 0)
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">共 {total.toLocaleString()} 条</p>
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-end mt-3">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs px-2">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <BankFlowImportDialog open={importOpen} onOpenChange={setImportOpen} onSuccess={loadData} />
      </div>
    </div>
  );
}
