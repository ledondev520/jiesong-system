/**
 * Input: 系统运维日志 API、logDisplay（动作/实体中文与摘要）
 * Output: 系统日志页面（响应式筛选、日志级别与可换行分页）
 * Pos: 运维中心
 */

'use client';

import { useEffect, useCallback, useState, useMemo } from 'react';
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
import { Search, X, Download, Filter } from 'lucide-react';
import { describeLogValues, labelForAction, labelForEntity } from './logDisplay';
import { formatDateTime } from '@/lib/date-format';
import { MobileListCard } from '@/components/mobile';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';

/** 日志级别映射 */
function getLogLevel(action: string) {
  switch (action) {
    case 'DELETE':
      return { label: '错误', className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800' };
    case 'UPDATE':
      return { label: '警告', className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800' };
    default:
      return { label: '信息', className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800' };
  }
}

/** 展示用用户标签 */
const userLabel = (log: SystemLogItem) => {
  if (log.user?.name) return log.user.name;
  if (log.user?.username) return log.user.username;
  return log.userId || '系统';
};

const ACTION_OPTIONS = [
  { value: 'ALL_ACTIONS', label: '全部操作' },
  { value: 'CREATE', label: '新建' },
  { value: 'UPDATE', label: '修改' },
  { value: 'DELETE', label: '删除' },
  { value: 'IMPORT', label: '导入' },
  { value: 'EXPORT', label: '导出' },
  { value: 'LOGIN', label: '登录' },
  { value: 'LOGOUT', label: '登出' },
  { value: 'GENERATE', label: '生成' },
  { value: 'UPLOAD', label: '上传' },
];

const ALL_USERS_VALUE = 'ALL_USERS';

export default function SystemLogsPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<SystemLogItem[]>([]);
  const [exporting, setExporting] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');

  // 筛选状态
  const [filterAction, setFilterAction] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>();
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  const user = useAuthStore((state) => state.user);
  const canAccess = user?.role === Role.ADMIN;

  const loadLogs = useCallback(async (page: number, size: number, kw: string) => {
    setLoading(true);
    try {
      const response = await getSystemLogs({
        page,
        pageSize: size,
        keyword: kw || undefined,
        action: filterAction || undefined,
        userId: filterUserId || undefined,
        startDate: filterStartDate ? filterStartDate.toISOString() : undefined,
        endDate: filterEndDate ? filterEndDate.toISOString() : undefined,
      });
      const items = response.data?.items || [];
      setLogs(Array.isArray(items) ? items : []);
      setTotal(response.data?.pagination?.total || 0);
      setTotalPages(response.data?.pagination?.totalPages || 1);
    } catch {
      toast.error('加载日志失败');
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterUserId, filterStartDate, filterEndDate]);

  const [debouncedKeyword, setDebouncedKeyword] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 400);
    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedKeyword, filterAction, filterUserId, filterStartDate, filterEndDate]);

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

  // 从日志中提取唯一用户列表用于筛选下拉
  const uniqueUsers = useMemo(() => {
    const map = new Map<string, string>();
    logs.forEach((log) => {
      const id = log.userId;
      const name = userLabel(log);
      if (id && !map.has(id)) map.set(id, name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [logs]);

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      await exportSystemLogsCsv({
        keyword: debouncedKeyword || undefined,
        action: filterAction || undefined,
        userId: filterUserId || undefined,
        startDate: filterStartDate ? filterStartDate.toISOString() : undefined,
        endDate: filterEndDate ? filterEndDate.toISOString() : undefined,
      });
      toast.success('CSV 导出成功');
    } catch {
      toast.error('CSV 导出失败');
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setFilterAction('');
    setFilterUserId('');
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    setKeyword('');
  };

  const hasFilters = filterAction || filterUserId || filterStartDate || filterEndDate;

  if (!user) {
    return (
      <div className="space-y-6">
        <ModuleTabHeader tabs={ADMIN_TABS} moduleName="系统管理" />
        <PageHeader title="系统日志" description="查看系统操作日志，记录所有用户操作与系统变更。" />
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
        <PageHeader title="系统日志" description="查看系统操作日志，记录所有用户操作与系统变更。" />
        <Card>
          <CardHeader>
            <CardTitle>无权限访问</CardTitle>
            <CardDescription>当前账号角色无权查看系统日志。</CardDescription>
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
      <ModuleTabHeader tabs={ADMIN_TABS} moduleName="系统管理" />
      <PageHeader
        title="系统日志"
        description="查看系统操作日志，记录所有用户操作与系统变更。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowFilters((s) => !s)}>
              <Filter className="mr-1.5 h-4 w-4" />
              筛选
              {hasFilters && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary" />}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={exporting}>
              <Download className="mr-1.5 h-4 w-4" />
              {exporting ? '导出中...' : '导出 CSV'}
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">日志列表</CardTitle>
                <CardDescription>共 {total} 条记录</CardDescription>
              </div>
            </div>

            {/* 搜索 */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9 h-9 rounded-lg"
                  placeholder="搜索用户、操作、业务模块..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </div>
              {keyword && (
                <Button variant="ghost" size="sm" onClick={() => setKeyword('')}>
                  <X className="h-4 w-4 mr-1" />
                  重置
                </Button>
              )}
            </div>

            {/* 高级筛选 */}
            {showFilters && (
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in-up">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">操作类型</label>
                  <Select
                    value={filterAction || ACTION_OPTIONS[0].value}
                    onValueChange={(value) => setFilterAction(value === ACTION_OPTIONS[0].value ? '' : value)}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="全部操作" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">操作用户</label>
                  <Select
                    value={filterUserId || ALL_USERS_VALUE}
                    onValueChange={(value) => setFilterUserId(value === ALL_USERS_VALUE ? '' : value)}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="全部用户" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_USERS_VALUE}>全部用户</SelectItem>
                      {uniqueUsers.map(([id, name]) => (
                        <SelectItem key={id} value={id}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">开始日期</label>
                  <DatePicker date={filterStartDate} setDate={setFilterStartDate} placeholder="选择开始日期" className="w-full" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">结束日期</label>
                  <DatePicker date={filterEndDate} setDate={setFilterEndDate} placeholder="选择结束日期" className="w-full" />
                </div>
                <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={clearFilters} disabled={!hasFilters && !keyword}>
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    清除全部筛选
                  </Button>
                </div>
              </div>
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
                const summaryLine = hints[0] || (log.oldValue ? '含旧值快照' : log.newValue ? '含新值快照' : '-');
                const summaryShort = summaryLine.length > 56 ? `${summaryLine.slice(0, 56)}…` : summaryLine;
                const level = getLogLevel(log.action);
                return (
                  <MobileListCard
                    key={log.id}
                    title={labelForAction(log.action)}
                    subtitle={`${formatDateTime(log.createdAt)} · ${userLabel(log)}`}
                    badge={
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className={`w-fit text-[10px] ${level.className}`}>
                          {level.label}
                        </Badge>
                        <Badge variant="outline" className="w-fit text-xs">
                          {labelForEntity(log.entity)}
                        </Badge>
                      </div>
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
                <TableRow className="hover:bg-transparent">
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
                  <TableHead className="text-muted-foreground">级别</TableHead>
                  <TableHead className="text-muted-foreground">操作</TableHead>
                  <SortableTableHead
                    sortKey="entity"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                  >
                    业务模块
                  </SortableTableHead>
                  <TableHead className="text-muted-foreground">IP 地址</TableHead>
                  <TableHead className="w-[320px] text-muted-foreground">变更摘要</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">暂无日志。</TableCell>
                  </TableRow>
                ) : (
                  sort.sortedData.map((log) => {
                    const { hints } = describeLogValues(log);
                    const level = getLogLevel(log.action);
                    return (
                      <TableRow key={log.id} className="transition-colors hover:bg-muted/40">
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateTime(log.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{userLabel(log)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${level.className}`}>
                            {level.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="w-fit text-xs">
                            {labelForAction(log.action)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{labelForEntity(log.entity)}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{log.ipAddress || '-'}</TableCell>
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
            <div className="flex flex-wrap items-center gap-2">
              <PageSizeSelect
                value={pageSize}
                onChange={(size) => { setPageSize(size); setCurrentPage(1); }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                首页
              </Button>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
              >
                末页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
