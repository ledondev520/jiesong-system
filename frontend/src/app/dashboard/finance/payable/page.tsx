/**
 * Input: 后端 finance/payables API
 * Output: 应付账款独立列表页面
 * Pos: 财务模块应付账款 Tab，展示供应商欠款明细
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Search, ArrowUpRight, RefreshCw, CreditCard } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, FINANCE_TABS } from '@/components/layout/ModuleTabHeader';
import { LoadingState, ErrorState, TableStateRow } from '@/components/ui/data-state';
import { MobileListCard } from '@/components/mobile';
import { financeService } from '@/services/finance.service';
import { cachedFetch } from '@/lib/api-cache';
import { toast } from 'sonner';

interface PayableContract {
  id: string;
  contractNo: string;
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  status: string;
  supplier?: { id: string; name: string };
}

export default function PayablePage() {
  const [payables, setPayables] = useState<PayableContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [keyword, setKeyword] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await cachedFetch('fin-payables-page', () =>
        financeService.getPayables({ pageSize: 100 }),
      );
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
      setError(true);
      toast.error('加载应付账款失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => {
    if (!keyword.trim()) return payables;
    const q = keyword.toLowerCase().trim();
    return payables.filter(
      (c) =>
        (c.contractNo || '').toLowerCase().includes(q) ||
        (c.supplier?.name || '').toLowerCase().includes(q),
    );
  }, [payables, keyword]);

  const totalUnpaid = payables.reduce((sum, c) => sum + c.unpaidAmount, 0);

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={FINANCE_TABS} moduleName="财务" />
      <PageHeader
        title="应付账款"
        description="查看各供应商欠款详情与付款状态"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-10" onClick={() => loadData()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button size="sm" className="h-10" asChild>
              <Link href="/dashboard/payments?tab=payable">
                <CreditCard className="mr-2 h-4 w-4" /> 去收付款管理
              </Link>
            </Button>
          </div>
        }
      />

      {/* KPI 卡片 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">合同总数</p>
                <p className="text-2xl font-bold tabular-nums">{payables.length}</p>
              </div>
              <ArrowUpRight className="h-8 w-8 text-primary opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">待付总额 (¥)</p>
                <p className="text-2xl font-bold tabular-nums text-red-600">
                  {totalUnpaid.toLocaleString()}
                </p>
              </div>
              <ArrowUpRight className="h-8 w-8 text-red-600 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">已付总额 (¥)</p>
                <p className="text-2xl font-bold tabular-nums text-green-600">
                  {payables.reduce((sum, c) => sum + c.paidAmount, 0).toLocaleString()}
                </p>
              </div>
              <ArrowUpRight className="h-8 w-8 text-green-600 opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            placeholder="搜索合同号、供应商..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        {keyword && (
          <Button variant="ghost" size="sm" onClick={() => setKeyword('')}>
            重置
          </Button>
        )}
      </div>

      {loading ? (
        <LoadingState title="加载中..." description="正在同步应付账款数据。" />
      ) : error ? (
        <ErrorState
          title="数据加载失败"
          description="无法连接到服务器，请稍后重试。"
          action={
            <Button variant="outline" size="sm" onClick={() => loadData()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              重试
            </Button>
          }
        />
      ) : (
        <>
          {/* 移动端卡片 */}
          <div className="space-y-3 md:hidden">
            {filtered.length === 0 ? (
              <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
                {keyword ? '没有匹配当前关键词的记录' : '暂无应付账款数据'}
              </div>
            ) : (
              filtered.map((contract) => (
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
                  <TableHead className="text-right">合同金额 (¥)</TableHead>
                  <TableHead className="text-right">已付 (¥)</TableHead>
                  <TableHead className="text-right">待付 (¥)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableStateRow
                    colSpan={6}
                    variant="empty"
                    icon={Search}
                    title={keyword ? '没有匹配的记录' : '暂无应付账款'}
                    description={keyword ? '没有匹配当前关键词的供应商付款记录。' : '当前没有需要处理的供应商付款记录。'}
                  />
                ) : (
                  filtered.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell className="font-medium">{contract.contractNo}</TableCell>
                      <TableCell className="max-w-[160px] truncate">{contract.supplier?.name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{contract.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{contract.totalAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums text-primary/80">
                        {contract.paidAmount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-bold text-red-600">
                        {contract.unpaidAmount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
