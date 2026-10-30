import type { Metadata } from 'next';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { NotFoundActions } from './NotFoundActions';

export const metadata: Metadata = { title: '页面不存在' };

/**
 * Input: Next.js not-found boundary
 * Output: 面向业务用户的 404 页面，提供返回工作台与登录页入口
 * Pos: 全局兜底路由页
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-xl rounded-3xl border border-border/70 bg-card/95 shadow-lg">
        <EmptyState
          icon={Compass}
          title="页面不存在"
          titleAs="h1"
          description="你访问的页面可能已迁移、暂未开放，或链接地址有误。可先回到工作台继续处理业务。"
          action={<NotFoundActions />}
        />
      </div>
    </main>
  );
}
