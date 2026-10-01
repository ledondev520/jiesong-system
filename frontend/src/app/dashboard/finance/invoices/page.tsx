/**
 * Input: 发票查询 API
 * Output: 发票台账查询页面（手机卡片与可排序桌面表格）
 * Pos: 财务模块-发票台账子页面
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useTableSort } from '@/lib/hooks/useTableSort';
import { useSearchParams } from 'next/navigation';
import { MobileListCard } from '@/components/mobile';
import { ModuleTabHeader, FINANCE_TABS } from '@/components/layout/ModuleTabHeader';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, X, ChevronLeft, ChevronRight, FileText, Landmark, Upload } from 'lucide-react';
import Link from 'next/link';
import {
  getInvoices, getInvoiceStats, getBatches,
  type InvoiceRecord, type InvoiceStats, type FinanceDataBatch,
} from '@/services/bankFlow.service';
import { InvoiceImportDialog } from './components/InvoiceImportDialog';

function fmt(n: number) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function statusBadge(status: string, isPositive: string) {
  if (status.includes('红冲')) return <Badge variant="destructive" className="text-[10px]">已红冲</Badge>;
  if (isPositive === '否') return <Badge variant="secondary" className="text-[10px]">红冲负数</Badge>;
  return <Badge variant="outline" className="text-green-600 border-green-200 text-[10px]">正常</Badge>;
}

export default function InvoicesPage() {
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get('search') || '';

  const [items, setItems] = useState<InvoiceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState(urlSearch);
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [batches, setBatches] = useState<FinanceDataBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, statsRes, batchRes] = await Promise.all([
        getInvoices({ page, pageSize, search: search || undefined, status: status || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
        getInvoiceStats({ search: search || undefined, status: status || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
        getBatches('INVOICE'),
      ]);
      setItems(invRes.items || []);
      setTotal(invRes.pagination?.total || 0);
      setStats(statsRes);
      setBatches(batchRes || []);
    } catch { /* */ } finally { setLoading(false); }
  }, [page, pageSize, search, status, dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  const sort = useTableSort<InvoiceRecord, string>(
    items,
    useCallback((item, key) => {
      switch (key) {
        case 'invDate':
          return item.invDate;
        case 'seller':
          return item.seller;
        case 'amount':
          return item.amount;
        case 'tax':
          return item.tax;
        case 'total':
          return item.total;
        case 'itemName':
          return item.itemName ?? '';
        default:
          return null;
      }
    }, [])
  );

  const totalPages = Math.ceil(total / pageSize);

  const resetFilters = () => {
    setSearch(''); setStatus(''); setDateFrom(''); setDateTo(''); setPage(1);
  };

  return (
    <div className="space-y-4">
      <ModuleTabHeader tabs={FINANCE_TABS} />

      <div className="px-1">
        {/* KPI */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Card><CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground mb-1">有效发票金额</p>
              <p className="text-lg font-bold text-blue-600">{fmt(stats.validTotal)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground mb-1">可抵扣税额</p>
              <p className="text-lg font-bold text-green-600">{fmt(stats.validTax)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground mb-1">有效发票张数</p>
              <p className="text-lg font-bold">{stats.validCount.toLocaleString()}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground mb-1">已红冲</p>
              <p className="text-lg font-bold text-orange-500">{stats.reversedCount}</p>
            </CardContent></Card>
          </div>
        )}

        {/* 导入批次 */}
        {batches.length > 0 && (
          <div className="text-xs text-muted-foreground mb-3">
            数据来源：{batches.map(b => (
              <span key={b.id} className="inline-flex items-center gap-1 mr-3">
                <FileText className="h-3 w-3" />
                <Badge variant="outline" className="text-[10px]">{b.fileName}</Badge>
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
              placeholder="搜索销方名称 / 品名 / 发票号"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 h-9"
            />
          </div>
          <Select value={status} onValueChange={v => { setStatus(v === 'ALL' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-[100px] h-9"><SelectValue placeholder="状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部</SelectItem>
              <SelectItem value="正常">正常</SelectItem>
              <SelectItem value="已红冲-全额">已红冲</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="w-[140px] h-9" />
          <span className="text-muted-foreground text-sm">~</span>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="w-[140px] h-9" />
          {(search || status || dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="h-3 w-3 mr-1" />清除
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-3 w-3 mr-1" />导入
          </Button>
        </div>

        <div className="space-y-3 md:hidden">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">加载中...</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">暂无数据</p>
          ) : sort.sortedData.map(item => (
            <MobileListCard
              key={item.id}
              title={item.seller}
              subtitle={item.itemName || '未填写品名'}
              badge={statusBadge(item.status, item.isPositive)}
              fields={[
                { label: '开票日期', value: item.invDate },
                { label: '票种', value: item.invoiceType?.includes('专用') ? '专票' : '普票' },
                { label: '金额', value: `¥${fmt(item.amount)}` },
                { label: '税额', value: `¥${fmt(item.tax)}` },
              ]}
              amount={{ label: '价税合计', value: `¥${fmt(item.total)}` }}
              action={
                <div className="space-y-2">
                  <p className="break-words text-xs text-muted-foreground">{item.seller} · {item.itemName || '未填写品名'}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="h-11" onClick={() => { setSearch(item.seller); setPage(1); }}>筛选销方</Button>
                    <Button variant="outline" className="h-11" asChild><Link href={`/dashboard/finance/bank-flow?search=${encodeURIComponent(item.seller)}`}>相关流水</Link></Button>
                  </div>
                </div>
              }
            />
          ))}
        </div>

        {/* 桌面端表格 */}
        <Card className="hidden md:block">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    sortKey="invDate"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                    className="w-[90px]"
                  >
                    开票日期
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="seller"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                  >
                    销方
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="itemName"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                  >
                    品名
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="amount"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                    className="text-right w-[100px]"
                  >
                    不含税金额
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="tax"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                    className="text-right w-[80px]"
                  >
                    税额
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="total"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                    className="text-right w-[100px]"
                  >
                    价税合计
                  </SortableTableHead>
                  <TableHead className="w-[70px]">状态</TableHead>
                  <TableHead className="w-[80px]">票种</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">暂无数据</TableCell></TableRow>
                ) : sort.sortedData.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs tabular-nums">{item.invDate}</TableCell>
                    <TableCell className="max-w-[180px]">
                      <span className="flex items-center gap-1 group">
                        <button
                          className="truncate text-left text-sm hover:text-primary hover:underline underline-offset-2 transition-colors"
                          onClick={() => { setSearch(item.seller); setPage(1); }}
                          title={`筛选"${item.seller}"`}
                        >
                          {item.seller}
                        </button>
                        <Link
                          href={`/dashboard/finance/bank-flow?search=${encodeURIComponent(item.seller)}`}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                          title="查看相关银行流水"
                        >
                          <Landmark className="h-3.5 w-3.5" />
                        </Link>
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground">{item.itemName || '-'}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{fmt(item.amount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{fmt(item.tax)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmt(item.total)}</TableCell>
                    <TableCell>{statusBadge(item.status, item.isPositive)}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">
                      {item.invoiceType?.includes('专用') ? (
                        <Badge variant="default" className="text-[10px]">专票</Badge>
                      ) : (
                        <span>普票</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-muted-foreground">共 {total.toLocaleString()} 条</p>
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

        <InvoiceImportDialog open={importOpen} onOpenChange={setImportOpen} onSuccess={loadData} />
      </div>
    </div>
  );
}
