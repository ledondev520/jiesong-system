/**
 * Input: 后端 finance/receivables API
 * Output: 应收账款独立列表页面
 * Pos: 财务模块应收账款 Tab，展示待回款合同明细
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
import { Search, ArrowDownLeft, RefreshCw, CreditCard } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, FINANCE_TABS } from '@/components/layout/ModuleTabHeader';
import { LoadingState, ErrorState, TableStateRow } from '@/components/ui/data-state';
import { MobileListCard } from '@/components/mobile';
import { financeService } from '@/services/finance.service';
import { cachedFetch } from '@/lib/api-cache';
import { toast } from 'sonner';

interface ReceivableContract {
  id: string;
  contractNo: string;
  totalAmount: number;
  receivedAmount: number;
  unreceiveAmount: number;
  status: string;
  stores?: string[];
  hasThirdPartyCargo?: boolean;
  items?: Array<{ store?: { id: string; name: string } }>;
}

export default function ReceivablePage() {
  const [receivables, setReceivables] = useState<ReceivableContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [keyword, setKeyword] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await cachedFetch('fin-receivables-page', () =>
        financeService.getReceivables({ pageSize: 100 }),
      );
      setReceivables(
        (response.data?.items || []).map((item) => ({
          id: item.id,
          contractNo: item.contractNo,
          totalAmount: item.totalAmount,
          receivedAmount: item.receivedAmount ?? 0,
          unreceiveAmount: item.unreceiveAmount ?? Math.max(0, item.totalAmount - (item.receivedAmount ?? 0)),
          status: item.status,
          stores: (item as unknown as { stores?: string[] }).stores,
          hasThirdPartyCargo: (item as unknown as { hasThirdPartyCargo?: boolean }).hasThirdPartyCargo,
          items: item.items,
        })),
      );
    } catch {
      setError(true);
      toast.error('加载应收账款失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getStoreNames = (contract: ReceivableContract) => {
    if (contract.stores && contract.stores.length > 0) {
      return contract.stores.join(', ');
    }
    const fromItems = contract.items?.map((item) => item.store?.name).filter(Boolean) as string[];
    return fromItems && fromItems.length > 0 ? fromItems.join(', ') : '-';
  };

  const filtered = useMemo(() => {
    if (!keyword.trim()) return receivables;
    const q = keyword.toLowerCase().trim();
    return receivables.filter(
      (c) =>
        (c.contractNo || '').toLowerCase().includes(q) ||
        getStoreNames(c).toLowerCase().includes(q),
    );
  }, [receivables, keyword]);

  const totalUnreceived = receivables.reduce((sum, c) => sum + c.unreceiveAmount, 0);

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={FINANCE_TABS} moduleName="财务" />
      <PageHeader
        title="应收账款"
        description="查看各门店待回款详情与催收状态"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-10" onClick={() => loadData()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button size="sm" className="h-10" asChild>
              <Link href="/dashboard/payments?tab=receivable">
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
                <p className="text-2xl font-bold tabular-nums">{receivables.length}</p>
              </div>
              <ArrowDownLeft className="h-8 w-8 text-primary opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">待收总额 (USD)</p>
                <p className="text-2xl font-bold tabular-nums text-amber-600">
                  {totalUnreceived.toLocaleString()}
                </p>
              </div>
              <ArrowDownLeft className="h-8 w-8 text-amber-600 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">已收总额 (USD)</p>
                <p className="text-2xl font-bold tabular-nums text-green-600">
                  {receivables.reduce((sum, c) => sum + c.receivedAmount, 0).toLocaleString()}
                </p>
              </div>
              <ArrowDownLeft className="h-8 w-8 text-green-600 opacity-60" />
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
            placeholder="搜索合同号、门店..."
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
        <LoadingState title="加载中..." description="正在同步应收账款数据。" />
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
                {keyword ? '没有匹配当前关键词的记录' : '暂无应收账款数据'}
              </div>
            ) : (
              filtered.map((contract) => (
                <MobileListCard
                  key={contract.id}
                  title={contract.contractNo}
                  subtitle={getStoreNames(contract)}
                  badge={
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs">{contract.status}</Badge>
                      {contract.hasThirdPartyCargo && (
                        <Badge variant="secondary" className="text-xs">含第三方拼柜</Badge>
                      )}
                    </div>
                  }
                  fields={[
                    { label: '总金额', value: `$${contract.totalAmount.toLocaleString()}` },
                    { label: '已收', value: `$${contract.receivedAmount.toLocaleString()}`, emphasis: 'primary' },
                  ]}
                  amount={{ label: '待收', value: `$${contract.unreceiveAmount.toLocaleString()}`, emphasis: 'danger' }}
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableStateRow
                    colSpan={6}
                    variant="empty"
                    icon={Search}
                    title={keyword ? '没有匹配的记录' : '暂无应收账款'}
                    description={keyword ? '没有匹配当前关键词的门店回款记录。' : '当前没有需要跟进的门店回款记录。'}
                  />
                ) : (
                  filtered.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell className="font-medium">{contract.contractNo}</TableCell>
                      <TableCell>{getStoreNames(contract)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">{contract.status}</Badge>
                          {contract.hasThirdPartyCargo && (
                            <Badge variant="secondary" className="text-xs">含第三方拼柜</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{contract.totalAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums text-primary/80">
                        {contract.receivedAmount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-bold text-amber-600">
                        {contract.unreceiveAmount.toLocaleString()}
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
