/**
 * Input: loading 标志与加载完成后要显示的内容（条数、统计值等）
 * Output: 加载中占位骨架（占住数字位置、读屏播报「加载中」）；完成后显示内容
 * Pos: 列表页脚「共 N 条」、统计卡片等；让「真的 0 条」与「还没加载完」可区分
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { cn } from "@/lib/utils";

interface LoadingValueProps {
  loading: boolean;
  children: React.ReactNode;
  className?: string;
}

export function LoadingValue({ loading, children, className }: LoadingValueProps) {
  if (!loading) return <>{children}</>;
  // 用 span 而非 Skeleton(div)：常嵌在 <p>/<span> 行内文字里，div 在 p 内是非法嵌套。
  return (
    <span
      role="status"
      aria-label="加载中"
      className={cn(
        "inline-block h-4 w-8 animate-pulse rounded-md bg-gray-200 align-middle dark:bg-gray-700",
        className,
      )}
    />
  );
}
