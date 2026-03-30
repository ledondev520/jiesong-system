/**
 * Input: 本地项目状态快照
 * Output: 手机友好的项目驾驶舱
 * Pos: 前端管理页子组件
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Clock3,
  FileDiff,
  GitBranch,
  ListTodo,
  Monitor,
  RefreshCcw,
  ScanText,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, ADMIN_TABS } from '@/components/layout/ModuleTabHeader';
import type { DevCockpitSnapshot } from '@/lib/dev-cockpit';
import { cn } from '@/lib/utils';

const POLL_INTERVAL_MS = 10_000;

const getStatusVariant = (status: string) => {
  if (status === 'DONE') return 'secondary';
  if (status === 'DOING') return 'default';
  return 'outline';
};

const getFileStatusLabel = (status: string) => {
  if (status === '??') return '新增';
  if (status.startsWith('M')) return '修改';
  if (status.startsWith('A')) return '新增';
  if (status.startsWith('D')) return '删除';
  if (status.startsWith('R')) return '重命名';
  return status;
};

const StatCard = ({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) => (
  <Card className="border-border/70 bg-muted/20">
    <CardHeader className="pb-2">
      <CardDescription>{title}</CardDescription>
      <CardTitle className="text-2xl">{value}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
);

export function DevCockpitClient({ initialSnapshot }: { initialSnapshot: DevCockpitSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSnapshot = useCallback(async () => {
    setIsRefreshing(true);

    try {
      const response = await fetch('/api/dev/status', {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const nextSnapshot = (await response.json()) as DevCockpitSnapshot;
      setSnapshot(nextSnapshot);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '刷新失败');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshSnapshot();

    const timer = window.setInterval(() => {
      void refreshSnapshot();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [refreshSnapshot]);

  const updatedAt = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(snapshot.generatedAt));

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={ADMIN_TABS} moduleName="系统管理" />
      <PageHeader
        eyebrow="本地实时观察"
        title="项目驾驶舱"
        description="只读查看当前本地项目正在改什么、任务推进到哪、工作树变了哪些文件。页面会自动刷新。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={snapshot.dirty ? 'destructive' : 'secondary'} className="h-9 rounded-full px-3">
              {snapshot.dirty ? '工作树已变更' : '工作树干净'}
            </Badge>
            <Button variant="outline" onClick={() => void refreshSnapshot()} disabled={isRefreshing}>
              <RefreshCcw className={cn('mr-2 h-4 w-4', isRefreshing && 'animate-spin')} />
              {isRefreshing ? '刷新中' : '手动刷新'}
            </Button>
          </div>
        }
      />

      <Card className="border-primary/15 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Monitor className="h-4 w-4 text-primary" />
            打开方式
          </CardTitle>
          <CardDescription>电脑上跑前端，另开一个终端启动穿透。手机访问生成的公网 URL，就能实时看本地状态。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border bg-background p-4">
            <div className="mb-2 text-sm font-medium">1. 启动本地前端</div>
            <pre className="overflow-x-auto rounded-lg bg-muted/30 p-3 text-xs leading-6">
              <code>cd frontend && npm run dev</code>
            </pre>
          </div>
          <div className="rounded-xl border bg-background p-4">
            <div className="mb-2 text-sm font-medium">2. 启动穿透</div>
            <pre className="overflow-x-auto rounded-lg bg-muted/30 p-3 text-xs leading-6">
              <code>cd frontend && npm run tunnel:cockpit</code>
            </pre>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-4 text-sm text-destructive">
            <Monitor className="h-4 w-4" />
            <span>状态刷新失败：{error}</span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          title="仓库"
          value={`${snapshot.branch || 'unknown'} / ${snapshot.head}`}
          description={`最后刷新 ${updatedAt} · ${snapshot.repoRoot}`}
        />
        <StatCard
          title="当前任务"
          value={`${snapshot.openTasks.length} 个待处理`}
          description={`已完成 ${snapshot.taskDoneCount} 项 · 本轮台账 ${snapshot.taskRows.length} 行`}
        />
        <StatCard
          title="变更"
          value={`${snapshot.changedFiles.length} 个文件`}
          description={`${snapshot.diffStatLines.length > 0 ? snapshot.diffStatLines.length : 0} 行 diff stat 摘要`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <GitBranch className="h-4 w-4 text-primary" />
              工作树变更
            </CardTitle>
            <CardDescription>手机上先看这块，最快知道当前本地改了哪些文件。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {snapshot.changedFiles.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                当前没有未提交改动。
              </div>
            ) : (
              snapshot.changedFiles.map((entry) => (
                <div key={`${entry.status}-${entry.path}`} className="flex items-start gap-3 rounded-xl border px-4 py-3">
                  <Badge variant="outline" className="mt-0.5 shrink-0">
                    {getFileStatusLabel(entry.status)}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="break-all text-sm font-medium">{entry.path}</div>
                    <div className="text-xs text-muted-foreground">{entry.status}</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileDiff className="h-4 w-4 text-primary" />
              Diff 摘要
            </CardTitle>
            <CardDescription>这是你最直观看到“这轮到底动了什么”的地方。</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[28rem] overflow-auto rounded-xl bg-muted/30 p-4 text-xs leading-6">
              <code>{snapshot.diffStatLines.length > 0 ? snapshot.diffStatLines.join('\n') : '暂无 diff stat。'}</code>
            </pre>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ListTodo className="h-4 w-4 text-primary" />
              当前台账
            </CardTitle>
            <CardDescription>只看当前 section 的主线任务，避免被历史条目干扰。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.openTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                当前没有待办任务。
              </div>
            ) : (
              snapshot.openTasks.map((task) => (
                <div key={task.id} className="rounded-xl border px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getStatusVariant(task.status)}>{task.status}</Badge>
                    <Badge variant="outline">{task.priority}</Badge>
                    <span className="text-sm font-semibold">{task.id}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{task.task}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ScanText className="h-4 w-4 text-primary" />
                计划片段
              </CardTitle>
              <CardDescription>{snapshot.planExcerpt.title}</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-64 overflow-auto rounded-xl bg-muted/30 p-4 text-xs leading-6">
                <code>{snapshot.planExcerpt.lines.join('\n')}</code>
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock3 className="h-4 w-4 text-primary" />
                指标片段
              </CardTitle>
              <CardDescription>{snapshot.metricsExcerpt.title}</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-64 overflow-auto rounded-xl bg-muted/30 p-4 text-xs leading-6">
                <code>{snapshot.metricsExcerpt.lines.join('\n')}</code>
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/dashboard/about">打开接入说明</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/settings">返回系统配置</Link>
        </Button>
      </div>
    </div>
  );
}
