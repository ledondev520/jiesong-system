/**
 * Input: 路由跳转、共享运维入口配置
 * Output: 运维中心总览（操作指引 + 通知中心 / 系统日志 / 导入记录）
 * Pos: 系统管理 > 运维中心，聚合运维相关功能入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, ADMIN_TABS } from '@/components/layout/ModuleTabHeader';
import { SYSTEM_CENTER_LINKS } from '@/components/layout/navigation.config';

/**
 * 职责：渲染运维中心总览页，提供共享入口卡片与操作建议
 */
export default function SystemOverviewPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={ADMIN_TABS} moduleName="系统管理" />
      <PageHeader
        eyebrow="系统管理 / 运维中心"
        title="运维中心"
        description="系统监控、操作审计与数据导入管理"
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/settings')}>
            返回系统配置
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="border-primary/10 bg-gradient-to-br from-background via-background to-muted/30 shadow-sm">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                运维入口
              </Badge>
              <span className="text-xs text-muted-foreground">统一承接通知、日志、导入记录</span>
            </div>
            <CardTitle className="text-2xl">先处理通知，再查日志，最后回看导入记录。</CardTitle>
            <CardDescription className="max-w-xl">
              这个页面不是入口拼盘，而是运维任务的起点。先按优先级处理高风险提醒，再用日志定位问题，最后用导入记录回溯数据流。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              {SYSTEM_CENTER_LINKS.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.href}
                    variant="outline"
                    className="h-auto min-h-20 items-start justify-start rounded-xl border-border bg-background px-4 py-3 text-left shadow-none hover:bg-muted"
                    onClick={() => router.push(item.href)}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                        <Icon className="h-5 w-5" />
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <span className="block font-medium text-foreground">{item.label}</span>
                      <span className="block text-xs text-muted-foreground">{item.desc}</span>
                    </div>
                  </Button>
                );
              })}
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-dashed border-border/80 bg-muted/30 p-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground">
                这里的每个入口都对应一个明确的后续动作，避免再回到“到处点、到处找”的运维模式。
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
          {SYSTEM_CENTER_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <Card
                key={item.href}
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm"
                onClick={() => router.push(item.href)}
              >
                <CardHeader className="flex flex-row items-center gap-4 pb-2">
                  <div className="shrink-0 rounded-lg bg-primary/10 p-2.5">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{item.label}</CardTitle>
                    <CardDescription>{item.desc}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.detail}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
