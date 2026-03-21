/**
 * Input: 报关单服务、URL 查询参数、router
 * Output: 报关单列表页
 * Pos: 报关单管理主列表页
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { startTransition, useCallback, useDeferredValue, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CustomsDeclaration } from '@/types';
import { customsDeclarationService } from '@/services/customsDeclaration.service';
import { cachedFetch } from '@/lib/api-cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, EXPORT_TABS } from '@/components/layout/ModuleTabHeader';
import { Search, Plus, FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  CustomsDeclarationStatusBadge,
  customsDeclarationStatusOptions,
} from './CustomsDeclarationStatusBadge';

const PAGE_SIZE = 20;

const formatAmount = (amount: number, currency: string) =>
  `${currency} ${amount.toLocaleString()}`;

export function CustomsDeclarationListPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialKeyword = searchParams.get('keyword') || '';
  const initialStatus = searchParams.get('status') || 'ALL';

  const [keyword, setKeyword] = useState(initialKeyword);
  const [status, setStatus] = useState(initialStatus);
  const deferredKeyword = useDeferredValue(keyword);

  const [declarations, setDeclarations] = useState<CustomsDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingDrafts, setGeneratingDrafts] = useState(false);

  const loadDeclarations = useCallback(async () => {
    setLoading(true);
    try {
      const cacheKey = `customs-declarations-${deferredKeyword}-${status}`;
      const response = await cachedFetch(
        cacheKey,
        () => customsDeclarationService.getAll({
          page: 1,
          pageSize: PAGE_SIZE,
          keyword: deferredKeyword || undefined,
          status: status === 'ALL' ? undefined : status,
        }),
      );
      setDeclarations(response?.data?.items || []);
    } catch {
      toast.error('加载报关单失败');
    } finally {
      setLoading(false);
    }
  }, [deferredKeyword, status]);

  useEffect(() => {
    void loadDeclarations();
  }, [loadDeclarations]);

  const draftCount = declarations.filter((item) => item.status === 'DRAFT').length;
  const releasedCount = declarations.filter((item) => item.status === 'RELEASED').length;
  const totalAmount = declarations.reduce((sum, item) => sum + item.totalAmount, 0);

  const openDetail = (id: string) => {
    startTransition(() => {
      router.push(`/customs-declarations/${id}`);
    });
  };

  const handleGenerateDrafts = async () => {
    setGeneratingDrafts(true);
    try {
      const response = await customsDeclarationService.generateDrafts({});
      const created = response?.data?.created ?? 0;
      const skipped = response?.data?.skipped ?? 0;
      toast.success(`自动生成完成：新增 ${created} 条，跳过 ${skipped} 条`);
      await loadDeclarations();
    } catch {
      toast.error('自动生成报关单草稿失败');
    } finally {
      setGeneratingDrafts(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <ModuleTabHeader tabs={EXPORT_TABS} moduleName="出口" />
      <PageHeader
        title="报关单管理"
        description="跟踪出口报关草稿、申报进度、查验与放行状态。"
        actions={
          <>
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索报关单号、客户或目的国..."
                className="h-11 rounded-xl border-border/70 bg-background/70 pl-10"
              />
            </div>

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-11 w-40 rounded-xl">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                {customsDeclarationStatusOptions.map((option) => (
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

            <Button
              className="h-11 rounded-xl"
              onClick={() => router.push('/customs-declarations/create')}
            >
              <Plus className="mr-2 h-4 w-4" />
              新建报关单
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">当前列表总单量</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {declarations.length}
          </CardContent>
        </Card>

        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">草稿 / 待完善</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {draftCount}
          </CardContent>
        </Card>

        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">当前列表货值</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            USD {totalAmount.toLocaleString()}
          </CardContent>
        </Card>
      </div>

      <Card className="surface-panel overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            报关单列表
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>报关单号</TableHead>
                <TableHead>发货人</TableHead>
                <TableHead>收货人</TableHead>
                <TableHead>目的国</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>申报日期</TableHead>
                <TableHead className="text-right">货值</TableHead>
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
              ) : declarations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-14 text-center text-muted-foreground">
                    暂无报关单数据。
                  </TableCell>
                </TableRow>
              ) : (
                declarations.map((declaration) => (
                  <TableRow key={declaration.id}>
                    <TableCell className="font-medium">{declaration.declarationNo}</TableCell>
                    <TableCell>{declaration.exporter}</TableCell>
                    <TableCell>{declaration.consignee}</TableCell>
                    <TableCell>{declaration.destinationCountry}</TableCell>
                    <TableCell>
                      <CustomsDeclarationStatusBadge status={declaration.status} />
                    </TableCell>
                    <TableCell>{declaration.declarationDate}</TableCell>
                    <TableCell className="text-right">
                      {formatAmount(declaration.totalAmount, declaration.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        aria-label={`查看详情 ${declaration.declarationNo}`}
                        onClick={() => openDetail(declaration.id)}
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

      <div className="text-sm text-muted-foreground">
        已放行单量：{releasedCount}
      </div>
    </div>
  );
}
