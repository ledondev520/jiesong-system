/**
 * Input: 路由跳转能力（useRouter）
 * Output: 运维中心快捷入口卡片列表（通知、日志、导入记录）
 * Pos: 设置页 > 运维中心 Tab，导航到系统运维相关页面
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bell, History, Database, type LucideIcon } from 'lucide-react';

interface OpsLink {
  href: string;
  label: string;
  icon: LucideIcon;
  desc: string;
}

const opsLinks: OpsLink[] = [
  { href: '/dashboard/system/notifications', label: '通知中心', icon: Bell, desc: '查看系统通知和未读提醒' },
  { href: '/dashboard/system/logs', label: '系统日志', icon: History, desc: '审计关键操作日志与变更记录' },
  { href: '/dashboard/system/import-records', label: '导入记录', icon: Database, desc: '复盘导入任务与失败明细' },
];

/**
 * 职责：渲染运维中心快捷入口卡片列表
 */
export function OpsTab() {
  const router = useRouter();

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {opsLinks.map((item) => {
        const Icon = item.icon;
        return (
          <Card
            key={item.href}
            className="hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => router.push(item.href)}
          >
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">{item.label}</CardTitle>
                <CardDescription>{item.desc}</CardDescription>
              </div>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
