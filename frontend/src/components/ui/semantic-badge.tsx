/**
 * Input: 业务状态文本、语义色调
 * Output: 统一语义状态徽章
 * Pos: UI基础组件层，收敛各页面状态徽章视觉语义
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { cva, type VariantProps } from "class-variance-authority";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const semanticBadgeVariants = cva("", {
  variants: {
    tone: {
      neutral: "bg-muted text-muted-foreground border border-border/70",
      info: "bg-primary/16 text-primary border border-primary/35",
      warning: "bg-chart-4/16 text-chart-4 border border-chart-4/35",
      progress: "bg-chart-1/16 text-chart-1 border border-chart-1/35",
      success: "bg-chart-3/16 text-chart-3 border border-chart-3/35",
      danger: "bg-destructive/14 text-destructive border border-destructive/30",
      secondary: "bg-secondary text-secondary-foreground border border-border/70",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

interface SemanticBadgeProps
  extends Omit<React.ComponentProps<typeof Badge>, "variant">,
    VariantProps<typeof semanticBadgeVariants> {}

/**
 * 职责：渲染统一语义徽章
 * 思路：根据 tone 选择统一 token 类，避免页面重复写状态样式
 */
export function SemanticBadge({
  tone,
  className,
  ...props
}: SemanticBadgeProps) {
  return <Badge className={cn(semanticBadgeVariants({ tone }), className)} {...props} />;
}

