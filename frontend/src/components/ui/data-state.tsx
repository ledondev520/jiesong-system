"use client";

import React from "react";
import { LucideIcon, Loader2, ServerCrash } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { describeFailure } from "@/lib/error-reason";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  title?: string;
  description?: string;
  className?: string;
}

interface ErrorStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** 失败的事（如「加载港口失败」）；与 error 一起给出时描述为「失败的事：服务端原因」 */
  what?: string;
  error?: unknown;
  /** 给出时渲染「重试」按钮；显式传入的 action 优先 */
  onRetry?: () => void;
}

interface TableStateRowProps extends ErrorStateProps {
  colSpan: number;
  variant: "loading" | "empty" | "error";
}

export function LoadingState({
  title = "加载中...",
  description,
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-[12rem] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-background shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function ErrorState({
  icon: Icon = ServerCrash,
  title = "数据加载失败",
  description: descriptionProp = "无法连接到服务器，请稍后重试。",
  action: actionProp,
  className,
  what,
  error,
  onRetry,
}: ErrorStateProps) {
  const description = what ? describeFailure(what, error) : descriptionProp;
  const action =
    actionProp ??
    (onRetry ? (
      <Button type="button" variant="outline" onClick={onRetry}>
        重试
      </Button>
    ) : undefined);
  return (
    <div
      className={cn(
        "flex min-h-[12rem] flex-col items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
        <Icon className="h-6 w-6 text-destructive" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function TableStateRow({
  colSpan,
  variant,
  icon,
  title,
  description,
  action,
  className,
  what,
  error,
  onRetry,
}: TableStateRowProps) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="p-0">
        {variant === "loading" ? (
          <LoadingState
            title={title}
            description={description}
            className={cn("min-h-[8rem] rounded-none border-0", className)}
          />
        ) : null}
        {variant === "empty" ? (
          <EmptyState
            icon={icon}
            title={title ?? "暂无数据"}
            description={description}
            action={action}
            className={cn("py-12", className)}
          />
        ) : null}
        {variant === "error" ? (
          <ErrorState
            icon={icon}
            title={title}
            description={description}
            action={action}
            what={what}
            error={error}
            onRetry={onRetry}
            className={cn(
              "min-h-[8rem] rounded-none border-0 bg-transparent",
              className,
            )}
          />
        ) : null}
      </TableCell>
    </TableRow>
  );
}
