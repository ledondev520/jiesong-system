/**
 * Input: 路由跳转能力（useRouter）
 * Output: 用户管理入口卡片
 * Pos: 设置页 > 用户管理 Tab，引导管理员跳转用户管理页
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { UserCog } from 'lucide-react';

/**
 * 职责：渲染用户管理引导入口
 */
export function UsersTab() {
  const router = useRouter();

  return (
    <Card
      className="hover:border-primary/50 transition-colors cursor-pointer"
      onClick={() => router.push('/dashboard/users')}
    >
      <CardHeader className="flex flex-row items-center gap-4">
        <div className="p-2 bg-primary/10 rounded-lg">
          <UserCog className="h-6 w-6 text-primary" />
        </div>
        <div>
          <CardTitle className="text-lg">用户管理</CardTitle>
          <CardDescription>管理系统用户与权限</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          创建和管理系统用户，分配角色权限（管理员、采购、销售）。
        </p>
      </CardContent>
    </Card>
  );
}
