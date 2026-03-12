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
      neutral: "border-border bg-muted text-muted-foreground",
      info: "border-primary/20 bg-primary/10 text-primary",
      warning: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400",
      progress: "border-primary/20 bg-primary/10 text-primary",
      success: "border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-400",
      danger: "border-destructive/30 bg-destructive/10 text-destructive-foreground",
      secondary: "border-border bg-secondary text-secondary-foreground",
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
