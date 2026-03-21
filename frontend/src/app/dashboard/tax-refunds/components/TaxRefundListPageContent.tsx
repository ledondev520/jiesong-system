/**
 * Input: 退税服务、URL 查询参数、router
 * Output: 退税列表页
 * Pos: 退税管理主列表页
 */

'use client';

import { startTransition, useCallback, useDeferredValue, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Plus, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import type { TaxRefund } from '@/types';
import { taxRefundService } from '@/services/taxRefund.service';
import { cachedFetch } from '@/lib/api-cache';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, EXPORT_TABS } from '@/components/layout/ModuleTabHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TaxRefundStatusBadge, taxRefundStatusOptions } from './TaxRefundStatusBadge';
import { PageSizeSelect } from '@/components/ui/page-size-select';

const DEFAULT_PAGE_SIZE = 20;

export function TaxRefundListPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialKeyword = searchParams.get('keyword') || '';
  const initialStatus = searchParams.get('status') || 'ALL';

  const [keyword, setKeyword] = useState(initialKeyword);
  const [status, setStatus] = useState(initialStatus);
  const [taxRefunds, setTaxRefunds] = useState<TaxRefund[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingDrafts, setGeneratingDrafts] = useState(false);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const deferredKeyword = useDeferredValue(keyword);

  const loadTaxRefunds = useCallback(async () => {
    setLoading(true);
    try {
      const cacheKey = `tax-refunds-${deferredKeyword}-${status}-${pageSize}`;
      const response = await cachedFetch(
        cacheKey,
        () => taxRefundService.getAll({
          page: 1,
          pageSize,
          keyword: deferredKeyword || undefined,
          status: status === 'ALL' ? undefined : status,
        }),
      );
      setTaxRefunds(response?.data?.items || []);
    } catch {
      toast.error('加载退税记录失败');
    } finally {
      setLoading(false);
    }
  }, [deferredKeyword, status, pageSize]);

  useEffect(() => {
    void loadTaxRefunds();
  }, [loadTaxRefunds]);

  const totalRefundable = taxRefunds.reduce((sum, item) => sum + item.refundableAmount, 0);
  const totalRefunded = taxRefunds.reduce((sum, item) => sum + item.refundedAmount, 0);
  const pendingCount = taxRefunds.filter((item) => item.status === 'APPLIED' || item.status === 'APPROVED').length;

  const openDetail = (id: string) => {
    startTransition(() => {
      router.push(`/dashboard/tax-refunds/${id}`);
    });
  };

  const handleGenerateDrafts = async () => {
    setGeneratingDrafts(true);
    try {
      const response = await taxRefundService.generateDrafts({});
      const created = response?.data?.created ?? 0;
      const skipped = response?.data?.skipped ?? 0;
      toast.success(`自动生成完成：新增 ${created} 条，跳过 ${skipped} 条`);
      await loadTaxRefunds();
    } catch {
      toast.error('自动生成退税草稿失败');
    } finally {
      setGeneratingDrafts(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <ModuleTabHeader tabs={EXPORT_TABS} moduleName="出口" />
      <PageHeader
        title="出口退税"
        description="管理退税批次、申报进度与到账状态。"
        actions={
          <>
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索退税单号、备注..."
                className="h-11 rounded-xl border-border/70 bg-background/70 pl-10"
              />
            </div>

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-11 w-40 rounded-xl">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                {taxRefundStatusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(keyword || status !== 'ALL') && (
              <Button
                variant="ghost"
                className="h-11 rounded-xl"
                onClick={() => { setKeyword(''); setStatus('ALL'); }}
              >
                重置
              </Button>
            )}

            <Button
              variant="outline"
              className="h-11 rounded-xl"
              onClick={handleGenerateDrafts}
              disabled={generatingDrafts}
            >
              自动生成草稿
            </Button>

            <Button className="h-11 rounded-xl" onClick={() => router.push('/dashboard/tax-refunds/create')}>
              <Plus className="mr-2 h-4 w-4" />
              新建退税单
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">当前记录数</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{taxRefunds.length}</CardContent>
        </Card>
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">可退金额合计</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{totalRefundable.toLocaleString()}</CardContent>
        </Card>
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">待跟进批次</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{pendingCount}</CardContent>
        </Card>
      </div>

      <Card className="surface-panel overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4" />
            退税单列表
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>退税单号</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">申报金额</TableHead>
                <TableHead className="text-right">可退金额</TableHead>
                <TableHead className="text-right">已退金额</TableHead>
                <TableHead>申请日期</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="w-[140px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-14 text-center text-muted-foreground">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : taxRefunds.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-14 text-center text-muted-foreground">
                    暂无退税记录。
                  </TableCell>
                </TableRow>
              ) : (
                taxRefunds.map((taxRefund) => (
                  <TableRow key={taxRefund.id}>
                    <TableCell className="font-medium">{taxRefund.refundNo}</TableCell>
                    <TableCell>
                      <TaxRefundStatusBadge status={taxRefund.status} />
                    </TableCell>
                    <TableCell className="text-right">{taxRefund.declaredAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{taxRefund.refundableAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{taxRefund.refundedAmount.toLocaleString()}</TableCell>
                    <TableCell>{taxRefund.appliedAt}</TableCell>
                    <TableCell>{taxRefund.note || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        aria-label={`查看详情 ${taxRefund.refundNo}`}
                        onClick={() => openDetail(taxRefund.id)}
                      >
                        查看详情
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>已退金额合计：{totalRefunded.toLocaleString()}</span>
        <PageSizeSelect
          value={pageSize}
          onChange={(size) => setPageSize(size)}
        />
      </div>
    </div>
  );
}
