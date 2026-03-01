/**
 * Input: 系统运维日志 API
 * Output: 系统日志页面（查看操作日志/导入相关日志）
 * Pos: 运维中心
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { getSystemLogs, SystemLogItem } from '@/services/system.service';
import { toast } from 'sonner';

type LogFilter = 'all' | 'import';

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

export default function SystemLogsPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<SystemLogItem[]>([]);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [total, setTotal] = useState(0);

  useEffect(() => {
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
  }, []);

  const filteredLogs = useMemo(
    () => (filter === 'import' ? logs.filter(isImportLog) : logs),
    [filter, logs]
  );

  const userLabel = (log: SystemLogItem) => {
    if (log.user?.name) {
      return log.user.name;
    }
    if (log.user?.username) {
      return log.user.username;
    }
    return log.userId || '系统';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="系统日志"
        description="查看系统操作日志与导入相关日志"
        backHref="/dashboard"
        backLabel="返回工作台"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              全部日志
            </Button>
            <Button
              variant={filter === 'import' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('import')}
            >
              导入日志
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>日志列表</CardTitle>
          <CardDescription>
            共 {total} 条记录，当前筛选：{filter === 'all' ? '全部' : '导入相关'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="surface-panel overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead>动作</TableHead>
                  <TableHead>对象</TableHead>
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
                  filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                      <TableCell>{userLabel(log)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {log.action || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>{log.entity || '-'}</TableCell>
                      <TableCell>{log.entityId || '-'}</TableCell>
                      <TableCell>{log.ipAddress || '-'}</TableCell>
                      <TableCell className="max-w-[320px] text-xs text-muted-foreground">
                        <div className="space-y-1">
                          {log.oldValue && <p className="whitespace-pre-wrap break-all">旧值：{log.oldValue}</p>}
                          {log.newValue && <p className="whitespace-pre-wrap break-all">新值：{log.newValue}</p>}
                          {!log.oldValue && !log.newValue && <p>-</p>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
