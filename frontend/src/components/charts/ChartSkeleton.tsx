/**
 * 图表加载骨架屏
 */
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface ChartSkeletonProps {
  className?: string;
}

export function ChartSkeleton({ className }: ChartSkeletonProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-[150px]" />
        <Skeleton className="h-4 w-[200px]" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[300px] w-full" />
      </CardContent>
    </Card>
  );
}
