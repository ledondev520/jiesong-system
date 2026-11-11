/**
 * Input: 无
 * Output: 详情页加载骨架（标题条 + 信息卡片），读屏播报「加载中」
 * Pos: 详情页 Suspense fallback / 首次加载占位，替代空白或「加载中...」文字闪烁
 */
import { Skeleton } from "@/components/ui/skeleton";

export function DetailSkeleton() {
  return (
    <div role="status" aria-label="加载中" className="space-y-4 py-6">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
