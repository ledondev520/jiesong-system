/**
 * Input: 路由跳转
 * Output: 运维中心总览（通知中心 / 系统日志 / 导入记录三大入口）
 * Pos: 系统管理 > 运维中心，聚合运维相关功能入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useRouter } from 'next/navigation';
import { Bell, History, Database, type LucideIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, ADMIN_TABS } from '@/components/layout/ModuleTabHeader';

interface OpsLink {
  href: string;
  label: string;
  icon: LucideIcon;
  desc: string;
  detail: string;
}

const opsLinks: OpsLink[] = [
  {
    href: '/dashboard/system/notifications',
    label: '通知中心',
    icon: Bell,
    desc: '查看系统通知和未读提醒',
    detail: '管理所有系统消息、操作提醒与告警通知，支持批量已读。',
  },
  {
    href: '/dashboard/system/logs',
    label: '系统日志',
    icon: History,
    desc: '审计关键操作日志与变更记录',
    detail: '追踪合同创建/修改/删除、数据导入等关键操作，支持 CSV 导出。',
  },
  {
    href: '/dashboard/system/import-records',
    label: '导入记录',
    icon: Database,
    desc: '复盘导入任务与失败明细',
    detail: '查看历次数据导入的执行结果、成功率与失败行详情。',
  },
];

/**
 * 职责：渲染运维中心总览页，提供三大功能入口卡片
 */
export default function SystemOverviewPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={ADMIN_TABS} moduleName="系统管理" />
      <PageHeader
        title="运维中心"
        description="系统监控、操作审计与数据导入管理"
      />

      <div className="grid gap-4 md:grid-cols-3">
        {opsLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Card
              key={item.href}
              className="hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => router.push(item.href)}
            >
              <CardHeader className="flex flex-row items-center gap-4 pb-2">
                <div className="p-2.5 bg-primary/10 rounded-lg shrink-0">
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
  );
}
