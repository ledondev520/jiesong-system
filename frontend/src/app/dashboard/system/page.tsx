/**
 * Input: 访问旧系统管理路由
 * Output: 跳转到设置页运维中心
 * Pos: 历史路由兼容层
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function SystemManagementLegacyPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/settings?tab=ops');
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      正在跳转到运维中心...
    </div>
  );
}
