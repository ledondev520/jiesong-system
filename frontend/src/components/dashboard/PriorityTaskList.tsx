/**
 * Input: tasks array with priority
 * Output: Sorted priority task list with progress indicators
 * Pos: Dashboard right column
 */

'use client';

import { motion } from 'framer-motion';
import { ChevronRight, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type TaskPriority = 'urgent' | 'high' | 'normal';

interface PriorityTask {
  id: string;
  title: string;
  subtitle?: string;
  priority: TaskPriority;
  onClick: () => void;
}

const priorityConfig = {
  urgent: {
    label: '紧急',
    color: 'text-rose-500',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    icon: AlertTriangle,
  },
  high: {
    label: '重要',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    icon: Clock,
  },
  normal: {
    label: '普通',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    icon: CheckCircle2,
  },
};

interface PriorityTaskListProps {
  tasks: PriorityTask[];
  title?: string;
  emptyText?: string;
}

export function PriorityTaskList({
  tasks,
  title = '待办事项',
  emptyText = '暂无待办',
}: PriorityTaskListProps) {
  const sorted = [...tasks].sort((a, b) => {
    const order = { urgent: 0, high: 1, normal: 2 };
    return order[a.priority] - order[b.priority];
  });

  return (
    <div className="rounded-2xl border border-border/30 bg-card/60 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        {sorted.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {sorted.length}
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CheckCircle2 className="mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground/60">{emptyText}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((task, i) => {
            const cfg = priorityConfig[task.priority];
            const Icon = cfg.icon;
            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06, duration: 0.25 }}
              >
                <Button
                  variant="ghost"
                  onClick={task.onClick}
                  className={[
                    'h-auto w-full justify-between rounded-xl border px-3 py-2.5 text-left',
                    'transition-colors hover:bg-muted/50',
                    cfg.border,
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={['flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', cfg.bg, cfg.color].join(' ')}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                      {task.subtitle && (
                        <p className="truncate text-xs text-muted-foreground/60">{task.subtitle}</p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                </Button>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
