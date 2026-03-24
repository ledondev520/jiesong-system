/**
 * Input: 系统运维日志 API、logDisplay（动作/实体中文与摘要）
 * Output: 系统日志页面（查看操作日志/导入相关日志）
 * Pos: 运维中心
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
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

type LogFilter = 'all' | 'import';

const normalize = (value: string) => value.toLowerCase();

const isImportLog = (log: SystemLogItem) => {
  const candidates = [
    log.action,
    log.entity,
    log.entityId ?? '',
    log.oldValue ?? '',
    log.newValue ?? '',
  ];
  return candidates.some((item) => normalize(item).includes('import'));
};

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
  const [filter, setFilter] = useState<LogFilter>('all');
  const [exporting, setExporting] = useState(false);
  const [total, setTotal] = useState(0);
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const user = useAuthStore((state) => state.user);
  const filteredLogs = useMemo(() => {
    let result = filter === 'import' ? logs.filter(isImportLog) : logs;
    if (keyword.trim()) {
      const q = keyword.toLowerCase().trim();
      result = result.filter(
        (log) =>
          userLabel(log).toLowerCase().includes(q) ||
          (log.action || '').toLowerCase().includes(q) ||
          (log.entity || '').toLowerCase().includes(q) ||
          (log.entityId || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [filter, logs, keyword]);
  const totalFilteredPages = Math.ceil(filteredLogs.length / pageSize);
  const pagedLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // 筛选变化时重置页码
  const handleFilterChange = useCallback((newFilter: LogFilter) => {
    setFilter(newFilter);
    setCurrentPage(1);
  }, []);

  const canAccess = user?.role === Role.ADMIN;

  useEffect(() => {
    if (!user || !canAccess) {
      setLoading(false);
      return;
    }

    const loadLogs = async () => {
      try {
        const response = await getSystemLogs();
        const items = response.data?.items || [];
        setLogs(Array.isArray(items) ? items : []);
        setTotal(response.data?.pagination?.total || 0);
      } catch {
        toast.error('加载日志失败');
      } finally {
        setLoading(false);
      }
    };

    loadLogs();
  }, [user, canAccess]);

  if (!user) {
    return (
      <div className="space-y-6">
        <ModuleTabHeader tabs={ADMIN_TABS} moduleName="系统管理" />
        <PageHeader
          title="系统日志"
          description="查看系统操作日志。动作/对象为内部代码时可对照中文说明；「内容变更」中 JSON 为审计快照，部分类型会附一句话摘要。"
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
          description="查看系统操作日志。动作/对象为内部代码时可对照中文说明；「内容变更」中 JSON 为审计快照，部分类型会附一句话摘要。"
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
        description="查看系统操作日志。动作/对象为内部代码时可对照中文说明；「内容变更」中 JSON 为审计快照，部分类型会附一句话摘要。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleFilterChange('all')}
            >
              全部日志
            </Button>
            <Button
              variant={filter === 'import' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleFilterChange('import')}
            >
              导入日志
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={exporting}>
              {exporting ? '导出中...' : '导出CSV'}
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>日志列表</CardTitle>
          <CardDescription>
            共 {total} 条记录（筛选后 {filteredLogs.length} 条），当前：{filter === 'all' ? '全部' : '导入相关'}
          </CardDescription>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9"
                placeholder="搜索用户、动作、对象..."
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            {keyword && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setKeyword('');
                  setCurrentPage(1);
                }}
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
            ) : filteredLogs.length === 0 ? (
              <div className="surface-panel py-12 text-center text-sm text-muted-foreground">暂无日志。</div>
            ) : (
              pagedLogs.map((log) => {
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
                      { label: '对象ID', value: log.entityId || '-' },
                      { label: 'IP', value: log.ipAddress || '-' },
                      { label: '动作码', value: log.action || '-' },
                      { label: '摘要', value: summaryShort },
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
                  <TableHead>时间</TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead>动作</TableHead>
                  <TableHead>对象（业务）</TableHead>
                  <TableHead>对象ID</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead className="w-[320px]">内容变更</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">暂无日志。</TableCell>
                  </TableRow>
                ) : (
                  pagedLogs.map((log) => {
                    const { hints } = describeLogValues(log);
                    return (
                    <TableRow key={log.id}>
                      <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                      <TableCell>{userLabel(log)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline" className="w-fit text-xs">
                            {labelForAction(log.action)}
                          </Badge>
                          {log.action && labelForAction(log.action) !== log.action && (
                            <span className="text-[10px] text-muted-foreground font-mono">{log.action}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span>{labelForEntity(log.entity)}</span>
                          {log.entity && labelForEntity(log.entity) !== log.entity && (
                            <span className="text-[10px] text-muted-foreground font-mono">{log.entity}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{log.entityId || '-'}</TableCell>
                      <TableCell>{log.ipAddress || '-'}</TableCell>
                      <TableCell className="max-w-[340px] text-xs text-muted-foreground">
                        <div className="space-y-1.5">
                          {hints.map((line, i) => (
                            <p key={i} className="text-foreground/90 leading-snug">
                              {line}
                            </p>
                          ))}
                          {log.oldValue && (
                            <p className="whitespace-pre-wrap break-all border-t border-border/60 pt-1 text-[11px]">
                              旧值（原始）：{log.oldValue}
                            </p>
                          )}
                          {log.newValue && (
                            <p className="whitespace-pre-wrap break-all text-[11px]">
                              新值（原始）：{log.newValue}
                            </p>
                          )}
                          {!log.oldValue && !log.newValue && hints.length === 0 && <p>-</p>}
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
            <span>第 {currentPage}/{Math.max(1, totalFilteredPages)} 页</span>
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
                onClick={() => setCurrentPage((p) => Math.min(totalFilteredPages, p + 1))}
                disabled={currentPage === totalFilteredPages || totalFilteredPages <= 1}
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
