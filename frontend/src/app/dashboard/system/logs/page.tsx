/**
 * Input: 系统运维日志 API、logDisplay（动作/实体中文与摘要）
 * Output: 系统日志页面（查看全部操作日志，纯中文展示）
 * Pos: 运维中心
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useCallback, useState } from 'react';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useTableSort } from '@/lib/hooks/useTableSort';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, ADMIN_TABS } from '@/components/layout/ModuleTabHeader';
import { Badge } from '@/components/ui/badge';
import { exportSystemLogsCsv, getSystemLogs, SystemLogItem } from '@/services/system.service';
import { toast } from 'sonner';
import { Role } from '@/types';
import { useAuthStore } from '@/store/auth.store';
import { PageSizeSelect } from '@/components/ui/page-size-select';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { describeLogValues, labelForAction, labelForEntity } from './logDisplay';
import { formatDateTime } from '@/lib/date-format';
import { MobileListCard } from '@/components/mobile';

/** 展示用用户标签（供列表与关键词筛选复用） */
const userLabel = (log: SystemLogItem) => {
  if (log.user?.name) {
    return log.user.name;
  }
  if (log.user?.username) {
    return log.user.username;
  }
  return log.userId || '系统';
};

export default function SystemLogsPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<SystemLogItem[]>([]);
  const [exporting, setExporting] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const user = useAuthStore((state) => state.user);

  const canAccess = user?.role === Role.ADMIN;

  const loadLogs = useCallback(async (page: number, size: number, kw: string) => {
    setLoading(true);
    try {
      const response = await getSystemLogs({ page, pageSize: size, keyword: kw || undefined });
      const items = response.data?.items || [];
      setLogs(Array.isArray(items) ? items : []);
      setTotal(response.data?.pagination?.total || 0);
      setTotalPages(response.data?.pagination?.totalPages || 1);
    } catch {
      toast.error('加载日志失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const [debouncedKeyword, setDebouncedKeyword] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 400);
    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedKeyword]);

  useEffect(() => {
    if (!user || !canAccess) {
      setLoading(false);
      return;
    }
    loadLogs(currentPage, pageSize, debouncedKeyword);
  }, [user, canAccess, currentPage, pageSize, debouncedKeyword, loadLogs]);

  const sort = useTableSort<SystemLogItem, string>(
    logs,
    useCallback((item, key) => {
      switch (key) {
        case 'createdAt':
          return item.createdAt ? new Date(item.createdAt).getTime() : null;
        case 'user':
          return userLabel(item);
        case 'entity':
          return labelForEntity(item.entity);
        default:
          return null;
      }
    }, [])
  );

  if (!user) {
    return (
      <div className="space-y-6">
        <ModuleTabHeader tabs={ADMIN_TABS} moduleName="系统管理" />
        <PageHeader
          title="系统日志"
          description="查看系统操作日志，记录所有用户操作与系统变更。"
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
        <ModuleTabHeader tabs={ADMIN_TABS} moduleName="系统管理" />
        <PageHeader
          title="系统日志"
          description="查看系统操作日志，记录所有用户操作与系统变更。"
        />

        <Card>
          <CardHeader>
            <CardTitle>无权限访问</CardTitle>
            <CardDescription>当前账号角色无权查看系统日志。</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              请联系管理员分配管理员角色后重试。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      await exportSystemLogsCsv();
      toast.success('CSV导出成功');
    } catch {
      toast.error('CSV导出失败');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={ADMIN_TABS} moduleName="系统管理" />
      <PageHeader
        title="系统日志"
        description="查看系统操作日志，记录所有用户操作与系统变更。"
        actions={
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={exporting}>
            {exporting ? '导出中...' : '导出CSV'}
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>日志列表</CardTitle>
          <CardDescription>共 {total} 条记录</CardDescription>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9"
                placeholder="搜索用户、操作、业务模块..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            {keyword && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setKeyword('')}
              >
                <X className="h-4 w-4 mr-1" />
                重置
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="md:hidden space-y-3">
            {loading ? (
              <div className="surface-panel py-12 text-center text-sm text-muted-foreground">加载中...</div>
            ) : logs.length === 0 ? (
              <div className="surface-panel py-12 text-center text-sm text-muted-foreground">暂无日志。</div>
            ) : (
              sort.sortedData.map((log) => {
                const { hints } = describeLogValues(log);
                const summaryLine = hints[0]
                  || (log.oldValue ? '含旧值快照' : log.newValue ? '含新值快照' : '-');
                const summaryShort = summaryLine.length > 56 ? `${summaryLine.slice(0, 56)}…` : summaryLine;
                return (
                  <MobileListCard
                    key={log.id}
                    title={labelForAction(log.action)}
                    subtitle={`${formatDateTime(log.createdAt)} · ${userLabel(log)}`}
                    badge={
                      <Badge variant="outline" className="w-fit text-xs">
                        {labelForEntity(log.entity)}
                      </Badge>
                    }
                    fields={[
                      { label: 'IP 地址', value: log.ipAddress || '-' },
                      { label: '变更摘要', value: summaryShort },
                    ]}
                  />
                );
              })
            )}
          </div>
          <div className="hidden md:block surface-panel overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    sortKey="createdAt"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                  >
                    时间
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="user"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                  >
                    用户
                  </SortableTableHead>
                  <TableHead>操作</TableHead>
                  <SortableTableHead
                    sortKey="entity"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                  >
                    业务模块
                  </SortableTableHead>
                  <TableHead>IP 地址</TableHead>
                  <TableHead className="w-[320px]">变更摘要</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">暂无日志。</TableCell>
                  </TableRow>
                ) : (
                  sort.sortedData.map((log) => {
                    const { hints } = describeLogValues(log);
                    return (
                    <TableRow key={log.id}>
                      <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                      <TableCell>{userLabel(log)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="w-fit text-xs">
                          {labelForAction(log.action)}
                        </Badge>
                      </TableCell>
                      <TableCell>{labelForEntity(log.entity)}</TableCell>
                      <TableCell>{log.ipAddress || '-'}</TableCell>
                      <TableCell className="max-w-[340px] text-xs text-muted-foreground">
                        <div className="space-y-1.5">
                          {hints.length > 0 ? hints.map((line, i) => (
                            <p key={i} className="text-foreground/90 leading-snug">
                              {line}
                            </p>
                          )) : <p>-</p>}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {/* 分页控制 */}
          <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>第 {currentPage}/{Math.max(1, totalPages)} 页，共 {total} 条</span>
            <div className="flex items-center gap-2">
              <PageSizeSelect
                value={pageSize}
                onChange={(size) => { setPageSize(size); setCurrentPage(1); }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
