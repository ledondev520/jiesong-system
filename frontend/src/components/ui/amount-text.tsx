/**
 * Input: 金额文本、语义状态
 * Output: 统一金额文本组件
 * Pos: UI基础组件层，统一金额正负/风险语义色
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const amountTextVariants = cva("font-medium", {
  variants: {
    tone: {
      neutral: "text-foreground",
      info: "text-primary",
      warning: "text-amber-600 dark:text-amber-300",
      success: "text-emerald-600 dark:text-emerald-300",
      danger: "text-destructive",
    },
    size: {
      sm: "text-sm",
      md: "text-base",
      lg: "text-xl",
      xl: "text-2xl",
    },
  },
  defaultVariants: {
    tone: "neutral",
    size: "md",
  },
});

interface AmountTextProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof amountTextVariants> {}

/**
 * 职责：按语义渲染金额文本
 * 思路：通过 tone+size 组合统一金额样式并保持页面可定制
 */
export function AmountText({
  tone,
  size,
  className,
  ...props
}: AmountTextProps) {
  return <span className={cn(amountTextVariants({ tone, size }), className)} {...props} />;
}
