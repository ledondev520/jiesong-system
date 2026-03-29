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
import { SYSTEM_CENTER_LINKS } from '@/components/layout/navigation.config';

/**
 * 职责：渲染运维中心快捷入口卡片列表
 */
export function OpsTab() {
  const router = useRouter();

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {SYSTEM_CENTER_LINKS.map((item) => {
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
