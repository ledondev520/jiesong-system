/**
 * Input: 出口专项单八阶段主线路、当前阻塞和唯一下一动作
 * Output: 工作台专项单进度卡片与可执行入口
 * Pos: 经营中台首页的主任务 Module，替代静态流程说明和重复待办
 */

'use client';

import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleDashed,
  OctagonAlert,
  Ship,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { TradeWorkflow, TradeWorkflowStageStatus } from '@/services/tradeWorkflow.service';

type Props = {
  workflows: TradeWorkflow[];
  loading?: boolean;
  unavailable?: boolean;
};

const stagePresentation: Record<TradeWorkflowStageStatus, {
  label: string;
  icon: typeof CheckCircle2;
  className: string;
}> = {
  completed: {
    label: '已完成',
    icon: CheckCircle2,
    className: 'border-emerald-200 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300',
  },
  current: {
    label: '进行中',
    icon: CircleDashed,
    className: 'border-primary/30 bg-primary/5 text-primary',
  },
  blocked: {
    label: '阻塞',
    icon: OctagonAlert,
    className: 'border-destructive/40 bg-destructive/5 text-destructive',
  },
  pending: {
    label: '待开始',
    icon: Circle,
    className: 'border-border/70 bg-muted/30 text-muted-foreground',
  },
};

function WorkflowCard({ workflow }: { workflow: TradeWorkflow }) {
  const router = useRouter();
  const nextStage = workflow.stages.find((stage) => (
    stage.status === 'blocked' || stage.status === 'current'
  )) || workflow.stages.find((stage) => stage.status === 'pending');
  const progress = workflow.stageCount > 0
    ? Math.round((workflow.completedStageCount / workflow.stageCount) * 100)
    : 0;

  return (
    <article className="rounded-lg border border-border/70 bg-background p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold tracking-tight">{workflow.contractNo}</h3>
            <Badge variant="outline" className="tabular-nums">
              {workflow.completedStageCount}/{workflow.stageCount} 阶段
            </Badge>
            {workflow.purchaseContractNos.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                关联 {workflow.purchaseContractNos.join('、')}
              </span>
            ) : null}
          </div>
          <Progress
            value={progress}
            aria-label={`${workflow.contractNo} 完整度 ${progress}%`}
            className="h-1.5 max-w-md"
          />
        </div>

        <Button
          type="button"
          className="shrink-0 justify-between rounded-md lg:min-w-48"
          aria-label={`${workflow.contractNo} 下一步：${workflow.nextAction.label}`}
          onClick={() => router.push(workflow.nextAction.href)}
        >
          {workflow.nextAction.label}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <ol className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8" aria-label={`${workflow.contractNo} 八阶段进度`}>
        {workflow.stages.map((stage, index) => {
          const presentation = stagePresentation[stage.status];
          const Icon = presentation.icon;
          return (
            <li
              key={stage.key}
              className={cn('min-w-0 rounded-md border px-2.5 py-2', presentation.className)}
              title={stage.reason}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{index + 1}. {stage.label}</span>
              </span>
              <span
                data-stage-status={stage.status}
                className="mt-1 block text-[11px] opacity-80"
              >
                {presentation.label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        {nextStage ? (
          <p className={cn(
            'flex min-w-0 items-start gap-2 text-sm',
            nextStage.status === 'blocked' ? 'text-destructive' : 'text-foreground',
          )}>
            {nextStage.status === 'blocked' ? (
              <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            )}
            <span>
              <span className="font-medium">{nextStage.label}：</span>
              {nextStage.reason}
            </span>
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            八阶段已全部完成
          </p>
        )}

        {workflow.issues.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-destructive" aria-label="数据风险">
            <AlertTriangle className="h-3.5 w-3.5" />
            {workflow.issues.map((issue) => (
              <Badge key={issue} variant="destructive" className="font-normal">{issue}</Badge>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function TradeWorkflowBoard({ workflows, loading = false, unavailable = false }: Props) {
  const router = useRouter();

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle role="heading" aria-level={2} className="flex items-center gap-2 text-base">
              <Ship className="h-4 w-4 text-primary" />
              出口专项单主线路
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              每张卡片对应一笔出口专项单；只执行卡片上的下一步。
            </p>
          </div>
          {workflows.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/dashboard/sales')}>
              查看全部
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            正在加载专项单主线路…
          </div>
        ) : unavailable ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
            专项单主线路暂时不可用，请稍后刷新。
          </div>
        ) : workflows.length > 0 ? (
          workflows.map((workflow) => <WorkflowCard key={workflow.id} workflow={workflow} />)
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-4 py-8 text-center">
            <div>
              <p className="text-sm font-medium">暂无出口专项单</p>
              <p className="mt-1 text-xs text-muted-foreground">新建后会在这里形成采购到退税、财务结清的完整线路。</p>
            </div>
            <Button type="button" size="sm" onClick={() => router.push('/dashboard/sales/create')}>
              新建出口专项单
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
