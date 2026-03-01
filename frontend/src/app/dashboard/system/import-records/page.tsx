/**
 * Input: 系统导入记录 API
 * Output: 导入记录页面（筛选、分页、历史查看）
 * Pos: 运维中心
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { getSystemImportRecords, SystemImportRecordItem } from '@/services/system.service';
import { useAuthStore } from '@/store/auth.store';
import { Role } from '@/types';
import { toast } from 'sonner';

type StatusFilter = 'ALL' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

const PAGE_SIZE = 20;

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: '全部' },
  { value: 'PROCESSING', label: '处理中' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'FAILED', label: '失败' },
];

const statusLabelMap: Record<string, string> = {
  PROCESSING: '处理中',
  COMPLETED: '已完成',
  FAILED: '失败',
};

const statusBadgeVariantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PROCESSING: 'outline',
  COMPLETED: 'secondary',
  FAILED: 'destructive',
};

const formatDateTime = (value: string) => {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return '-';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(time));
};

const getErrorSummary = (errorLog?: string | null) => {
  if (!errorLog) {
    return '-';
  }

  try {
    const parsed = JSON.parse(errorLog);
    if (Array.isArray(parsed)) {
      return `${parsed.length} 条错误`;
    }
  } catch {
    // fallback to plain text
  }

  return errorLog.length > 48 ? `${errorLog.slice(0, 48)}...` : errorLog;
};

const getStatusLabel = (status: string) => statusLabelMap[status] || status || '-';

export default function SystemImportRecordsPage() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<SystemImportRecordItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const user = useAuthStore((state) => state.user);
  const canAccess = user?.role === Role.ADMIN;

  const loadRecords = useCallback(async () => {
    if (!user || !canAccess) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await getSystemImportRecords({
        page,
        pageSize: PAGE_SIZE,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        keyword: keyword || undefined,
      });

      const items = response.data?.items || [];
      const pagination = response.data?.pagination;

      setRecords(Array.isArray(items) ? items : []);
      setTotal(pagination?.total || 0);
      setTotalPages(Math.max(1, pagination?.totalPages || 1));
    } catch {
      toast.error('加载导入记录失败');
    } finally {
      setLoading(false);
    }
  }, [canAccess, keyword, page, statusFilter, user]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const successRateText = useMemo(() => {
    const success = records.reduce((sum, item) => sum + item.successRows, 0);
    const totalRows = records.reduce((sum, item) => sum + item.totalRows, 0);
    if (totalRows === 0) {
      return '0%';
    }
    return `${Math.round((success / totalRows) * 100)}%`;
  }, [records]);

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="导入记录"
          description="查看历史导入任务执行结果"
          backHref="/dashboard"
          backLabel="返回工作台"
        />

        <Card>
          <CardHeader>
            <CardTitle>权限校验中...</CardTitle>
            <CardDescription>正在加载用户权限。</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">加载中...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="导入记录"
          description="查看历史导入任务执行结果"
          backHref="/dashboard"
          backLabel="返回工作台"
        />

        <Card>
          <CardHeader>
            <CardTitle>无权限访问</CardTitle>
            <CardDescription>当前账号角色无权查看导入记录。</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">请联系管理员分配管理员角色后重试。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="导入记录"
        description="查看历史导入任务执行结果"
        backHref="/dashboard"
        backLabel="返回工作台"
      />

      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle>导入历史</CardTitle>
            <CardDescription>
              共 {total} 条记录，当前页成功率 {successRateText}
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {statusOptions.map((option) => (
              <Button
                key={option.value}
                variant={statusFilter === option.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setPage(1);
                  setStatusFilter(option.value);
                }}
              >
                {option.label}
              </Button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Input
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                placeholder="按文件名筛选"
                className="h-9 w-[220px]"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPage(1);
                  setKeyword(keywordInput.trim());
                }}
              >
                查询
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPage(1);
                  setKeywordInput('');
                  setKeyword('');
                  setStatusFilter('ALL');
                }}
              >
                重置
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="surface-panel overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>导入时间</TableHead>
                  <TableHead>文件名</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">总行数</TableHead>
                  <TableHead className="text-right">成功</TableHead>
                  <TableHead className="text-right">失败</TableHead>
                  <TableHead>导入人</TableHead>
                  <TableHead className="max-w-[180px]">错误摘要</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
                  </TableRow>
                ) : records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">暂无导入记录。</TableCell>
                  </TableRow>
                ) : (
                  records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{formatDateTime(record.importedAt)}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={record.fileName}>
                        {record.fileName || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariantMap[record.status] || 'outline'}>
                          {getStatusLabel(record.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{record.totalRows}</TableCell>
                      <TableCell className="text-right text-chart-3">{record.successRows}</TableCell>
                      <TableCell className="text-right text-destructive">{record.failedRows}</TableCell>
                      <TableCell>{record.importedBy || '-'}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground" title={record.errorLog || ''}>
                        {getErrorSummary(record.errorLog)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              第 {page}/{totalPages} 页
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!canPrev} onClick={() => setPage((prev) => prev - 1)}>
                上一页
              </Button>
              <Button variant="outline" size="sm" disabled={!canNext} onClick={() => setPage((prev) => prev + 1)}>
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
