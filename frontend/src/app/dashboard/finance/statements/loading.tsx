/**
 * Input: none
 * Output: 财务报表页面骨架屏（Next.js Suspense loading）
 * Pos: Next.js App Router streaming skeleton，导航到报表页时即时展示
 */

import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function StatementsLoading() {
  return (
    <div className="space-y-6">
      {/* Tab 导航占位 */}
      <div className="mb-6 border-b">
        <div className="flex items-end gap-0 h-11">
          {['经营执行', '收付款', '财务报表'].map((label) => (
            <div
              key={label}
              className="flex min-h-[44px] items-center px-4 py-2.5 text-sm text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
      </div>
      {/* 页头骨架 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-6 w-32 rounded bg-muted animate-pulse" />
          <div className="mt-1 h-4 w-64 rounded bg-muted animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-28 rounded bg-muted animate-pulse" />
          <div className="h-10 w-28 rounded bg-muted animate-pulse" />
        </div>
      </div>
      {/* KPI 卡片骨架 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-32 rounded bg-muted animate-pulse" />
              <div className="mt-2 h-3 w-20 rounded bg-muted animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* 图表区骨架 */}
      <Card>
        <CardHeader>
          <div className="h-5 w-32 rounded bg-muted animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="h-60 rounded bg-muted animate-pulse" />
        </CardContent>
      </Card>
    </div>
  );
}
