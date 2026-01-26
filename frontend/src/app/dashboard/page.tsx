/**
 * Input: 后端dashboard API、AI greeting API
 * Output: 工作台页面（系统核心入口，含AI问候语、快速录入、商品追踪、数据看板）
 * Pos: 系统首页，提供快速录入、商品追踪、数据看板
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShoppingCart, TrendingUp, Plus } from 'lucide-react';
import { ProductTracker } from '@/components/tools/ProductTracker';
import { AIGreeting } from '@/components/ai/AIGreeting';
import { DataDashboard } from '@/components/dashboard/DataDashboard';

/**
 * 职责：渲染工作台首页
 * 思路：
 *   1. 顶部快速录入区（一键开始工作）
 *   2. 商品追踪（查询商品出货状态）
 *   3. 数据看板（关键业务指标）
 */
export default function DashboardPage() {
  const router = useRouter();

  // 快速录入入口配置
  const quickActions = [
    { 
      label: '新建采购', 
      icon: ShoppingCart, 
      href: '/dashboard/purchase/create',
      color: 'bg-blue-500 hover:bg-blue-600',
      desc: '录入采购合同'
    },
    { 
      label: '新建销售', 
      icon: TrendingUp, 
      href: '/dashboard/sales/create',
      color: 'bg-green-500 hover:bg-green-600',
      desc: '创建出口合同'
    },
  ];

  return (
    <div className="space-y-6">
      {/* AI问候语悬浮卡片 */}
      <AIGreeting />

      {/* 页面标题 */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">工作台</h2>
        <p className="text-muted-foreground">欢迎回来，开始今天的工作</p>
      </div>

      {/* 快速录入区 */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5" />
            快速录入
          </CardTitle>
          <CardDescription>一键开始录入新数据</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.label}
                  className={`h-auto py-4 flex-col gap-2 ${action.color} text-white`}
                  onClick={() => router.push(action.href)}
                >
                  <Icon className="h-6 w-6" />
                  <span className="font-medium">{action.label}</span>
                  <span className="text-xs opacity-80">{action.desc}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 商品追踪 */}
      <ProductTracker />

      {/* 数据看板 */}
      <DataDashboard />
    </div>
  );
}
